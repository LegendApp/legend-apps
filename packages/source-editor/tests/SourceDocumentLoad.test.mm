#import "../macos/SourceDocumentLoad.h"
#include <cassert>
#include <chrono>
#include <iostream>

static void waitReady(const std::shared_ptr<SourceLoadJob> &job) {
  assert(dispatch_group_wait(job->ready, dispatch_time(DISPATCH_TIME_NOW, 5 * NSEC_PER_SEC)) == 0);
}

int main(int argc, char **argv) { @autoreleasepool {
  NSString *directory = [NSTemporaryDirectory() stringByAppendingPathComponent:NSUUID.UUID.UUIDString];
  assert([NSFileManager.defaultManager createDirectoryAtPath:directory withIntermediateDirectories:YES attributes:nil error:nil]);
  NSString *path = [directory stringByAppendingPathComponent:@"source.txt"];
  assert([@"\uFEFFhello 👋\r\nnext" writeToFile:path atomically:YES encoding:NSUTF8StringEncoding error:nil]);

  // Preparation needs neither AppKit, a run loop, nor a React/native view.
  auto first = startSourceDocumentLoad(path);
  waitReady(first);
  assert(first->complete && first->hasBOM && first->firstDocument->lineCount() == 2);
  assert(first->firstDocument->line(0).text == u"hello 👋");
  assert([first->sourcePrefix isEqualToString:@"hello 👋\r\nnext"]);

  NSString *token = [LESourcePreparedDocuments prepare:path];
  // Wrong paths cannot consume a token and snapshots never wait for I/O.
  assert([LESourcePreparedDocuments snapshot:token path:@"/wrong"] == nil);
  assert(![LESourcePreparedDocuments claim:token path:@"/wrong"]);
  NSDictionary *metadata = nil;
  for (int i = 0; !metadata && i < 5000; i++) {
    metadata = [LESourcePreparedDocuments snapshot:token path:path];
    if (!metadata) [NSThread sleepForTimeInterval:0.001];
  }
  assert(metadata && [metadata[@"lineCount"] intValue] == 2);
  auto claimed = [LESourcePreparedDocuments claim:token path:path];
  assert(claimed && ![LESourcePreparedDocuments claim:token path:path]);
  [LESourcePreparedDocuments cancel:token]; // ownership already transferred
  assert(!claimed->cancelled);
  assert([LESourcePreparedDocuments snapshot:token path:path] == nil);
  auto *buffer = claimed->firstDocument.get();
  assert([@"changed" writeToFile:path atomically:YES encoding:NSUTF8StringEncoding error:nil]);
  assert(claimed->firstDocument.get() == buffer && claimed->firstDocument->lineCount() == 2);

  NSString *cancelled = [LESourcePreparedDocuments prepare:path];
  [LESourcePreparedDocuments cancel:cancelled];
  [LESourcePreparedDocuments cancel:cancelled];
  assert(![LESourcePreparedDocuments claim:cancelled path:path]);
  NSString *other = [LESourcePreparedDocuments prepare:path];
  auto independent = [LESourcePreparedDocuments claim:other path:path];
  waitReady(independent);
  assert(independent->firstDocument.get() != buffer);
  assert(independent->firstDocument->line(0).text == u"changed");

  auto missing = startSourceDocumentLoad([directory stringByAppendingPathComponent:@"missing"]);
  waitReady(missing);
  assert(missing->error.length && !missing->firstDocument);
  assert([sourceDocumentLoadMetadata(missing)[@"error"] length] > 0);

  assert([@"" writeToFile:path atomically:YES encoding:NSUTF8StringEncoding error:nil]);
  auto empty = startSourceDocumentLoad(path);
  waitReady(empty);
  assert(empty->complete && empty->firstDocument->lineCount() == 1 && empty->firstDocument->length() == 0);

  NSMutableString *large = [NSMutableString string];
  for (int i = 0; i < 40000; i++) [large appendFormat:@"unique row %d: 👋\r\n", i];
  assert([large writeToFile:path atomically:YES encoding:NSUTF8StringEncoding error:nil]);
  const auto start = std::chrono::steady_clock::now();
  auto progressive = startSourceDocumentLoad(path);
  const auto dispatched = std::chrono::steady_clock::now();
  waitReady(progressive);
  assert(!progressive->complete && progressive->reader->bytesRead() <= 16384);
  assert(progressive->firstDocument->lineCount() == 129);
  std::u16string combined;
  const auto &document = *progressive->firstDocument;
  combined = document.text();
  while (!progressive->reader->done()) combined += progressive->reader->next(1048576, 16384);
  NSString *roundTrip = [[NSString alloc] initWithCharacters:(const unichar *)combined.data() length:combined.size()];
  assert([roundTrip isEqualToString:large]);
  std::cout << "Preload dispatch: " << std::chrono::duration<double, std::milli>(dispatched - start).count() << " ms\n";
  assert([NSFileManager.defaultManager removeItemAtPath:directory error:nil]);
  std::cout << "Prepared documents: independent loading, metadata, ownership, cancellation, errors, Unicode and bounded continuation passed\n";
  // Optional real files measure native preparation, not time-to-first-paint.
  for (int i = 1; i < argc; i++) {
    const auto begin = std::chrono::steady_clock::now();
    auto real = startSourceDocumentLoad([NSString stringWithUTF8String:argv[i]]);
    const auto queued = std::chrono::steady_clock::now();
    waitReady(real);
    const auto end = std::chrono::steady_clock::now();
    assert(!real->error.length && real->firstDocument);
    std::cout << argv[i] << ": dispatch=" << std::chrono::duration<double, std::milli>(queued - begin).count()
      << "ms, first chunk ready=" << std::chrono::duration<double, std::milli>(end - begin).count()
      << "ms, rows=" << real->firstDocument->lineCount() << "\n";
  }
} }
