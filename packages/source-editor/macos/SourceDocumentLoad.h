#import <Foundation/Foundation.h>
#include "../cpp/SourceDocument.hpp"
#include "../cpp/SourceFileReader.hpp"
#include <atomic>
#include <memory>

// The worker owns reader/nextId until ready completes; afterwards the claiming
// editor serializes further reads. Metadata and the first buffer are immutable
// after ready, so snapshots never wait for disk or hold a lock around I/O.
struct SourceLoadJob {
  std::atomic<bool> cancelled{false};
  std::unique_ptr<legend::source::SourceFileReader> reader;
  uint64_t nextId = 1;
  NSString *path;
  NSDictionary *signature;
  bool hasBOM = false;
  dispatch_group_t ready;
  std::shared_ptr<legend::source::SourceDocument> firstDocument;
  NSString *error = @"";
  NSString *sourcePrefix = @"";
  bool complete = false;
};

std::shared_ptr<SourceLoadJob> startSourceDocumentLoad(NSString *path);
bool sourceDocumentLoadReady(const std::shared_ptr<SourceLoadJob> &job);
NSDictionary *sourceDocumentLoadMetadata(const std::shared_ptr<SourceLoadJob> &job);

// Tokens are single-use capabilities, not a path cache. Each open gets an
// independent buffer and file signature, including two windows on the same file.
@interface LESourcePreparedDocuments : NSObject
+ (NSString *)prepare:(NSString *)path;
+ (NSDictionary *)snapshot:(NSString *)token path:(NSString *)path;
+ (std::shared_ptr<SourceLoadJob>)claim:(NSString *)token path:(NSString *)path;
+ (void)cancel:(NSString *)token;
@end
