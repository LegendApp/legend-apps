#include "GrammarInstaller.hpp"
#include "TreeSitterHighlighter.hpp"
#import <Foundation/Foundation.h>
#import <Security/Security.h>
#import <CommonCrypto/CommonDigest.h>
#include <dlfcn.h>
#include <mutex>
#include <stdexcept>

@interface LEGGrammarDownload : NSObject <NSURLSessionDownloadDelegate>
@property(nonatomic, copy) NSString *destination;
@property(nonatomic, copy) NSString *failure;
@property(nonatomic) int64_t expectedSize;
@property(nonatomic) NSTimeInterval lastProgress;
@property(nonatomic, copy) void (^progress)(double, double);
@property(nonatomic, strong) dispatch_semaphore_t completion;
@end
@implementation LEGGrammarDownload
- (void)URLSession:(NSURLSession *)session downloadTask:(NSURLSessionDownloadTask *)task
    didWriteData:(int64_t)bytes totalBytesWritten:(int64_t)written totalBytesExpectedToWrite:(int64_t)expected {
  if (written > self.expectedSize) { self.failure = @"Grammar exceeds declared size"; [task cancel]; return; }
  const auto now = NSProcessInfo.processInfo.systemUptime;
  if (now - self.lastProgress >= 0.1) { self.lastProgress = now; self.progress(written, self.expectedSize); }
}
- (void)URLSession:(NSURLSession *)session task:(NSURLSessionTask *)task
    willPerformHTTPRedirection:(NSHTTPURLResponse *)response newRequest:(NSURLRequest *)request
    completionHandler:(void (^)(NSURLRequest *))completionHandler {
  // GitHub redirects release assets to its HTTPS asset CDN, never arbitrary hosts.
  NSString *host = request.URL.host.lowercaseString;
  BOOL trusted = [request.URL.scheme isEqualToString:@"https"] &&
    ([host isEqualToString:@"github.com"] || [host hasSuffix:@".githubusercontent.com"]);
  if (!trusted) self.failure = @"Untrusted grammar download redirect";
  completionHandler(trusted ? request : nil);
}
- (void)URLSession:(NSURLSession *)session downloadTask:(NSURLSessionDownloadTask *)task didFinishDownloadingToURL:(NSURL *)location {
  if (((NSHTTPURLResponse *)task.response).statusCode != 200) { self.failure = @"Grammar download failed; the release may not be published yet"; return; }
  NSError *error;
  if (![[NSFileManager defaultManager] moveItemAtURL:location toURL:[NSURL fileURLWithPath:self.destination] error:&error]) self.failure = error.localizedDescription;
}
- (void)URLSession:(NSURLSession *)session task:(NSURLSessionTask *)task didCompleteWithError:(NSError *)error {
  if (error && !self.failure) self.failure = error.localizedDescription;
  dispatch_semaphore_signal(self.completion);
}
@end

namespace margelo::nitro::legendapps::syntaxparser {
namespace {
void verify(NSString *path, const std::string& digest, uint64_t size) {
  NSError *error;
  NSDictionary *attributes = [[NSFileManager defaultManager] attributesOfItemAtPath:path error:&error];
  if (!attributes || [attributes fileSize] != size || ![attributes[NSFileType] isEqual:NSFileTypeRegular])
    throw std::runtime_error("Invalid grammar file size/type");
  NSData *data = [NSData dataWithContentsOfFile:path options:NSDataReadingMappedIfSafe error:&error];
  if (!data) throw std::runtime_error("Cannot read grammar file");
  unsigned char hash[CC_SHA256_DIGEST_LENGTH]; CC_SHA256(data.bytes, (CC_LONG)data.length, hash);
  std::string actual;
  for (auto byte : hash) { actual += "0123456789abcdef"[byte >> 4]; actual += "0123456789abcdef"[byte & 15]; }
  if (actual != digest) throw std::runtime_error("Grammar checksum mismatch");
#if TARGET_OS_OSX
  SecCodeRef self = nullptr; CFDictionaryRef info = nullptr;
  if (SecCodeCopySelf(kSecCSDefaultFlags, &self) != errSecSuccess) throw std::runtime_error("Cannot inspect app signing identity");
  OSStatus status = SecCodeCopySigningInformation(self, kSecCSSigningInformation, &info); CFRelease(self);
  NSString *team = status == errSecSuccess ? [(__bridge NSDictionary *)info objectForKey:(__bridge NSString *)kSecCodeInfoTeamIdentifier] : nil;
  team = [team copy]; if (info) CFRelease(info);
  if (!team.length) throw std::runtime_error("Downloaded grammars require an app signed with a development or distribution team");
  SecRequirementRef requirement = nullptr;
  NSString *rule = [NSString stringWithFormat:@"anchor apple generic and certificate leaf[subject.OU] = \"%@\"", team];
  status = SecRequirementCreateWithString((__bridge CFStringRef)rule, kSecCSDefaultFlags, &requirement);
  SecStaticCodeRef code = nullptr;
  if (status == errSecSuccess) status = SecStaticCodeCreateWithPath((__bridge CFURLRef)[NSURL fileURLWithPath:path], kSecCSDefaultFlags, &code);
  if (status == errSecSuccess) status = SecStaticCodeCheckValidity(code, kSecCSStrictValidate | kSecCSCheckAllArchitectures, requirement);
  if (code) CFRelease(code); if (requirement) CFRelease(requirement);
  if (status != errSecSuccess) throw std::runtime_error("Grammar signature is invalid or belongs to another signing team");
#else
  throw std::runtime_error("Downloadable native grammars are supported on macOS only");
#endif
}
}
std::string installGrammarPack(const std::string& name, const std::string& url,
    const std::string& digest, double size, const std::function<void(double, double)>& progress) {
  @autoreleasepool {
    if (name.empty() || name.find_first_not_of("abcdefghijklmnopqrstuvwxyz0123456789-_") != std::string::npos
      || digest.size() != 64 || digest.find_first_not_of("0123456789abcdef") != std::string::npos
      || !(size > 0 && size <= 64 * 1024 * 1024) || size != static_cast<uint64_t>(size))
      throw std::runtime_error("Invalid grammar request");
    const std::string prefix = "https://github.com/LegendApp/legend-apps/releases/download/grammars-v";
    if (url.rfind(prefix, 0) != 0) throw std::runtime_error("Untrusted grammar source");
    // Cross-window callers share this lock and cache; files are hash-addressed.
    static std::mutex mutex; std::lock_guard lock(mutex);
    if (TreeSitterHighlighter::supports(name)) return name;
    NSFileManager *files = NSFileManager.defaultManager;
    NSString *base = [[files URLsForDirectory:NSApplicationSupportDirectory inDomains:NSUserDomainMask].firstObject.path
      stringByAppendingPathComponent:@"Legend/Grammars/v1"];
    NSError *error;
    if (![files createDirectoryAtPath:base withIntermediateDirectories:YES attributes:nil error:&error]) throw std::runtime_error("Cannot create grammar cache");
    NSString *path = [base stringByAppendingPathComponent:[NSString stringWithFormat:@"%s-%s.dylib", name.c_str(), digest.c_str()]];
    if ([files fileExistsAtPath:path]) {
      try { verify(path, digest, static_cast<uint64_t>(size)); }
      catch (...) {
        // Preserve a corrupt/rejected cache entry for diagnosis, but let Retry
        // acquire a fresh copy. Never overwrite a working older hash/version.
        NSString *rejected = [path stringByAppendingFormat:@".rejected-%@", NSUUID.UUID.UUIDString];
        if (![files moveItemAtPath:path toPath:rejected error:&error]) throw;
      }
    }
    if (![files fileExistsAtPath:path]) {
      NSString *temporary = [base stringByAppendingPathComponent:[@"download-" stringByAppendingString:NSUUID.UUID.UUIDString]];
      LEGGrammarDownload *delegate = [LEGGrammarDownload new];
      delegate.destination = temporary; delegate.expectedSize = static_cast<int64_t>(size);
      delegate.completion = dispatch_semaphore_create(0);
      delegate.progress = ^(double done, double total) { progress(done, total); };
      NSURLSessionConfiguration *configuration = NSURLSessionConfiguration.ephemeralSessionConfiguration;
      configuration.timeoutIntervalForRequest = 30; configuration.timeoutIntervalForResource = 120;
      NSURLSession *session = [NSURLSession sessionWithConfiguration:configuration delegate:delegate delegateQueue:nil];
      auto task = [session downloadTaskWithURL:[NSURL URLWithString:[NSString stringWithUTF8String:url.c_str()]]];
      [task resume]; dispatch_semaphore_wait(delegate.completion, DISPATCH_TIME_FOREVER); [session finishTasksAndInvalidate];
      try {
        if (delegate.failure) throw std::runtime_error(delegate.failure.UTF8String);
        verify(temporary, digest, static_cast<uint64_t>(size));
        if (![files moveItemAtPath:temporary toPath:path error:&error]) throw std::runtime_error("Cannot install grammar atomically");
      } catch (...) { [files removeItemAtPath:temporary error:nil]; throw; }
    }
    verify(path, digest, static_cast<uint64_t>(size));
    void *handle = dlopen(path.fileSystemRepresentation, RTLD_NOW | RTLD_LOCAL);
    if (!handle) throw std::runtime_error(dlerror());
    auto factory = reinterpret_cast<LegendGrammarPackFactory>(dlsym(handle, "legend_grammar_pack_v1"));
    if (!factory || !factory() || !factory()->name || name != factory()->name) { dlclose(handle); throw std::runtime_error("Grammar pack identity mismatch"); }
    try { TreeSitterHighlighter::registerPack(*factory()); } catch (...) { dlclose(handle); throw; }
    progress(size, size);
    return name; // Keep the library mapped while any syntax tree can reference it.
  }
}
}
