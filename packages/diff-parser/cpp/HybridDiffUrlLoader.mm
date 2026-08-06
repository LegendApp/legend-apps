#include "HybridDiffUrlLoader.hpp"

#import <Foundation/Foundation.h>

#include <chrono>
#include <stdexcept>

namespace margelo::nitro::legendapps::diffparser {

namespace {

using UrlClock = std::chrono::steady_clock;
constexpr NSUInteger diffUrlParserChunkBytes = 16 * 1024;
constexpr NSUInteger diffUrlCacheDiskBytes = 2ULL * 1024 * 1024 * 1024;

double elapsedUrlMs(UrlClock::time_point start, UrlClock::time_point end) {
  return std::chrono::duration<double, std::milli>(end - start).count();
}

std::string nsStringToStdString(NSString* value) {
  const char* utf8 = [value UTF8String];
  return utf8 != nullptr ? std::string(utf8) : std::string();
}

NSURL* createUrl(const std::string& diffUrl) {
  NSString* urlString = [[NSString alloc] initWithBytes:diffUrl.data()
                                                 length:diffUrl.size()
                                               encoding:NSUTF8StringEncoding];
  if (urlString == nil) {
    throw std::runtime_error("Failed to read diff URL");
  }

  NSURL* url = [NSURL URLWithString:urlString];
  if (url == nil) {
    throw std::runtime_error("Invalid diff URL");
  }
  return url;
}

NSMutableURLRequest* createDiffUrlRequest(const std::string& diffUrl) {
  NSMutableURLRequest* request = [NSMutableURLRequest requestWithURL:createUrl(diffUrl)];
  request.HTTPMethod = @"GET";
  request.cachePolicy = NSURLRequestUseProtocolCachePolicy;
  request.timeoutInterval = 60;
  [request setValue:@"Legend Diff" forHTTPHeaderField:@"User-Agent"];
  return request;
}

NSURLCache* diffUrlCache() {
  static NSURLCache* cache = nil;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    NSURL* cacheRoot = [[NSFileManager defaultManager] URLForDirectory:NSCachesDirectory
                                                              inDomain:NSUserDomainMask
                                                     appropriateForURL:nil
                                                                create:YES
                                                                 error:nil];
    NSURL* cacheDirectory = [cacheRoot URLByAppendingPathComponent:@"Legend Diff/Remote Diffs"
                                                        isDirectory:YES];
    cache = [[NSURLCache alloc] initWithMemoryCapacity:0
                                          diskCapacity:diffUrlCacheDiskBytes
                                          directoryURL:cacheDirectory];
  });
  return cache;
}

NSURLSessionConfiguration* createDiffUrlSessionConfiguration() {
  NSURLSessionConfiguration* configuration = [NSURLSessionConfiguration defaultSessionConfiguration];
  configuration.URLCache = diffUrlCache();
  configuration.requestCachePolicy = NSURLRequestUseProtocolCachePolicy;
  configuration.timeoutIntervalForRequest = 60;
  configuration.timeoutIntervalForResource = 60;
  return configuration;
}

} // namespace

} // namespace margelo::nitro::legendapps::diffparser

@interface DiffUrlStreamDelegate : NSObject <NSURLSessionDataDelegate> {
@public
  dispatch_semaphore_t _semaphore;
  std::function<void(std::string_view)> _onChunk;
  std::function<bool()> _shouldCancel;
  std::string _error;
}

- (instancetype)initWithSemaphore:(dispatch_semaphore_t)semaphore
                          onChunk:(std::function<void(std::string_view)>)onChunk
                      shouldCancel:(std::function<bool()>)shouldCancel;

@end

@implementation DiffUrlStreamDelegate

- (instancetype)initWithSemaphore:(dispatch_semaphore_t)semaphore
                          onChunk:(std::function<void(std::string_view)>)onChunk
                      shouldCancel:(std::function<bool()>)shouldCancel
{
  self = [super init];
  if (self) {
    _semaphore = semaphore;
    _onChunk = std::move(onChunk);
    _shouldCancel = std::move(shouldCancel);
  }
  return self;
}

- (void)URLSession:(NSURLSession*)session
          dataTask:(NSURLSessionDataTask*)dataTask
didReceiveResponse:(NSURLResponse*)response
 completionHandler:(void (^)(NSURLSessionResponseDisposition disposition))completionHandler
{
  (void)session;
  if (_shouldCancel && _shouldCancel()) {
    completionHandler(NSURLSessionResponseCancel);
    return;
  }

  if ([response isKindOfClass:[NSHTTPURLResponse class]]) {
    const NSInteger statusCode = [(NSHTTPURLResponse*)response statusCode];
    if (statusCode < 200 || statusCode >= 300) {
      _error = "Failed to fetch diff URL (" + std::to_string(statusCode) + ")";
      completionHandler(NSURLSessionResponseCancel);
      return;
    }
  }

  (void)dataTask;
  completionHandler(NSURLSessionResponseAllow);
}

- (void)URLSession:(NSURLSession*)session
          dataTask:(NSURLSessionDataTask*)dataTask
    didReceiveData:(NSData*)data
{
  (void)session;
  if (_shouldCancel && _shouldCancel()) {
    [dataTask cancel];
    return;
  }

  if (data.length == 0) {
    return;
  }

  const char* bytes = static_cast<const char*>(data.bytes);
  NSUInteger offset = 0;
  while (offset < data.length) {
    if (_shouldCancel && _shouldCancel()) {
      [dataTask cancel];
      return;
    }
    const NSUInteger length = MIN(
        margelo::nitro::legendapps::diffparser::diffUrlParserChunkBytes,
        data.length - offset);
    try {
      _onChunk(std::string_view(bytes + offset, length));
    } catch (const std::exception& error) {
      _error = error.what();
      [dataTask cancel];
      return;
    } catch (...) {
      _error = "Failed to parse diff URL";
      [dataTask cancel];
      return;
    }
    offset += length;
  }
}

- (void)URLSession:(NSURLSession*)session
              task:(NSURLSessionTask*)task
didCompleteWithError:(NSError*)error
{
  (void)session;
  (void)task;
  if (_error.empty() && error != nil && error.code != NSURLErrorCancelled) {
    _error = "Failed to fetch diff URL: " +
        margelo::nitro::legendapps::diffparser::nsStringToStdString(error.localizedDescription);
  }
  dispatch_semaphore_signal(_semaphore);
}

@end

namespace margelo::nitro::legendapps::diffparser {

DiffUrlLoadResult loadDiffUrlText(const std::string& diffUrl) {
  const auto startedAt = UrlClock::now();
  NSMutableURLRequest* request = createDiffUrlRequest(diffUrl);

  dispatch_semaphore_t semaphore = dispatch_semaphore_create(0);
  __block NSData* responseData = nil;
  __block NSURLResponse* urlResponse = nil;
  __block NSError* requestError = nil;

  NSURLSession* session = [NSURLSession sessionWithConfiguration:createDiffUrlSessionConfiguration()];
  NSURLSessionDataTask* task = [session dataTaskWithRequest:request
                                                               completionHandler:^(NSData* data, NSURLResponse* response, NSError* error) {
    responseData = data;
    urlResponse = response;
    requestError = error;
    dispatch_semaphore_signal(semaphore);
  }];
  [task resume];
  dispatch_semaphore_wait(semaphore, DISPATCH_TIME_FOREVER);
  [session finishTasksAndInvalidate];

  const auto finishedAt = UrlClock::now();

  if (requestError != nil) {
    throw std::runtime_error("Failed to fetch diff URL: " + nsStringToStdString(requestError.localizedDescription));
  }

  if ([urlResponse isKindOfClass:[NSHTTPURLResponse class]]) {
    const NSInteger statusCode = [(NSHTTPURLResponse*)urlResponse statusCode];
    if (statusCode < 200 || statusCode >= 300) {
      throw std::runtime_error("Failed to fetch diff URL (" + std::to_string(statusCode) + ")");
    }
  }

  if (responseData == nil) {
    throw std::runtime_error("Failed to fetch diff URL");
  }

  DiffUrlLoadResult result;
  result.fetchMs = elapsedUrlMs(startedAt, finishedAt);
  result.text = std::string(static_cast<const char*>(responseData.bytes), responseData.length);
  return result;
}

double loadDiffUrlChunks(
    const std::string& diffUrl,
    const std::function<void(std::string_view)>& onChunk,
    const std::function<bool()>& shouldCancel) {
  const auto startedAt = UrlClock::now();
  NSMutableURLRequest* request = createDiffUrlRequest(diffUrl);
  dispatch_semaphore_t semaphore = dispatch_semaphore_create(0);
  DiffUrlStreamDelegate* delegate = [[DiffUrlStreamDelegate alloc] initWithSemaphore:semaphore
                                                                             onChunk:onChunk
                                                                         shouldCancel:shouldCancel];
  NSOperationQueue* delegateQueue = [NSOperationQueue new];
  delegateQueue.maxConcurrentOperationCount = 1;
  NSURLSession* session = [NSURLSession sessionWithConfiguration:createDiffUrlSessionConfiguration()
                                                       delegate:delegate
                                                  delegateQueue:delegateQueue];
  NSURLSessionDataTask* task = [session dataTaskWithRequest:request];
  [task resume];

  while (dispatch_semaphore_wait(semaphore, dispatch_time(DISPATCH_TIME_NOW, 100 * NSEC_PER_MSEC)) != 0) {
    if (shouldCancel && shouldCancel()) {
      [task cancel];
    }
  }

  [session finishTasksAndInvalidate];
  const auto finishedAt = UrlClock::now();

  if (!delegate->_error.empty()) {
    throw std::runtime_error(delegate->_error);
  }

  return elapsedUrlMs(startedAt, finishedAt);
}

} // namespace margelo::nitro::legendapps::diffparser
