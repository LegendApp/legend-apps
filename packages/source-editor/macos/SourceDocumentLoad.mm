#import "SourceDocumentLoad.h"
#import "SourceFileSession.h"
#include <mutex>
#include <unordered_map>

std::shared_ptr<SourceLoadJob> startSourceDocumentLoad(NSString *path) {
  auto job = std::make_shared<SourceLoadJob>();
  job->path = [path copy];
  job->ready = dispatch_group_create();
  dispatch_group_enter(job->ready);
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    @autoreleasepool {
      if (!job->cancelled) {
        try {
          job->signature = [LESourceFileSession signatureAtPath:job->path];
          job->reader = std::make_unique<legend::source::SourceFileReader>(job->path.fileSystemRepresentation);
          auto source = job->reader->next(16384, 128);
          job->hasBOM = job->reader->hasBOM();
          job->sourcePrefix = [[NSString alloc] initWithCharacters:(const unichar *)source.data() length:std::min<size_t>(512, source.size())];
          job->complete = job->reader->done();
          job->firstDocument = std::make_shared<legend::source::SourceDocument>(source, job->nextId);
          job->nextId += job->firstDocument->lineCount() - 1;
          if (job->complete) job->reader.reset();
        } catch (const std::exception &cause) {
          job->error = [NSString stringWithUTF8String:cause.what()] ?: @"Unable to load source file";
          job->reader.reset();
        }
      }
      dispatch_group_leave(job->ready);
    }
  });
  return job;
}

bool sourceDocumentLoadReady(const std::shared_ptr<SourceLoadJob> &job) {
  return dispatch_group_wait(job->ready, DISPATCH_TIME_NOW) == 0;
}

NSDictionary *sourceDocumentLoadMetadata(const std::shared_ptr<SourceLoadJob> &job) {
  if (!sourceDocumentLoadReady(job) || job->cancelled) return nil;
  return @{ @"lineCount": @(job->firstDocument ? job->firstDocument->lineCount() : 0), @"firstId": @1,
    @"complete": @(job->complete), @"error": job->error, @"sourcePrefix": job->sourcePrefix };
}

static std::mutex registryMutex;
static std::unordered_map<std::string, std::shared_ptr<SourceLoadJob>> preparedDocuments;

@implementation LESourcePreparedDocuments
+ (NSString *)prepare:(NSString *)path {
  NSString *token = NSUUID.UUID.UUIDString;
  auto job = startSourceDocumentLoad(path);
  std::lock_guard<std::mutex> lock(registryMutex);
  preparedDocuments.emplace(token.UTF8String, std::move(job));
  return token;
}
+ (NSDictionary *)snapshot:(NSString *)token path:(NSString *)path {
  std::lock_guard<std::mutex> lock(registryMutex);
  auto found = preparedDocuments.find(token.UTF8String);
  if (found == preparedDocuments.end() || ![found->second->path isEqualToString:path]) return nil;
  return sourceDocumentLoadMetadata(found->second);
}
+ (std::shared_ptr<SourceLoadJob>)claim:(NSString *)token path:(NSString *)path {
  std::lock_guard<std::mutex> lock(registryMutex);
  auto found = preparedDocuments.find(token.UTF8String);
  if (found == preparedDocuments.end() || ![found->second->path isEqualToString:path]) return nullptr;
  auto job = found->second;
  preparedDocuments.erase(found);
  return job;
}
+ (void)cancel:(NSString *)token {
  std::lock_guard<std::mutex> lock(registryMutex);
  auto found = preparedDocuments.find(token.UTF8String);
  if (found != preparedDocuments.end()) {
    found->second->cancelled = true;
    preparedDocuments.erase(found);
  }
}
@end
