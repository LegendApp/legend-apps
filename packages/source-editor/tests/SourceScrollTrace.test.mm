#import "../macos/SourceScrollTrace.h"
#include <cassert>
#include <cstdio>

int main(int argc, const char **argv) {
  @autoreleasepool {
    if (argc == 1) {
      unsetenv("LEGEND_SOURCE_SCROLL_TRACE_DIR");
      assert(!LESourceScrollTraceEnabled());
      LESourceScrollTrace(@"ignored", nil, @{});
      puts("Scroll capture: disabled by default");
      return 0;
    }
    NSString *directory = [NSString stringWithUTF8String:argv[1]];
    setenv("LEGEND_SOURCE_SCROLL_TRACE_DIR", directory.UTF8String, 1);
    assert(LESourceScrollTraceEnabled());
    NSObject *owner = [NSObject new];
    for (int i = 0; i < 21000; ++i) LESourceScrollTrace(@"probe-test", owner, @{@"index":@(i)});
    // File serialization is intentionally off the UI thread. No AppKit window
    // is created by this test; only verify opt-in transport and overflow.
    [NSThread sleepForTimeInterval:2.3];
    NSArray *files = [NSFileManager.defaultManager contentsOfDirectoryAtPath:directory error:nil];
    assert(files.count == 1);
    NSString *text = [NSString stringWithContentsOfFile:[directory stringByAppendingPathComponent:files[0]] encoding:NSUTF8StringEncoding error:nil];
    NSUInteger count = 0, dropped = 0;
    uint64_t previous = 0;
    for (NSString *line in [text componentsSeparatedByString:@"\n"]) {
      if (!line.length) continue;
      NSDictionary *entry = [NSJSONSerialization JSONObjectWithData:[line dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil];
      assert([entry[@"prefix"] isEqual:@"DEBUG source-scroll-v1"]);
      assert([entry[@"timestamp"] doubleValue] > 0);
      assert([entry[@"monoMs"] doubleValue] > 0);
      assert([entry[@"seq"] unsignedLongLongValue] > previous);
      previous = [entry[@"seq"] unsignedLongLongValue];
      if ([entry[@"event"] isEqual:@"probe-test"]) ++count;
      if ([entry[@"event"] isEqual:@"dropped"]) dropped += [entry[@"fields"][@"count"] unsignedIntegerValue];
    }
    // Slow runners may flush while the producer is still emitting. Every
    // submitted record must either be written or explicitly counted as dropped.
    assert(count > 0 && count + dropped == 21000);
    puts("Scroll capture: timestamps, ordering, private file transport and bounded overflow passed");
  }
}
