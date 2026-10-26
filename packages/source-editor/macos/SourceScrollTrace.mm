#import "SourceScrollTrace.h"
#include <mutex>
#include <unistd.h>

static NSMutableArray *events;
static std::mutex eventsMutex;
static uint64_t sequence = 0, dropped = 0;
static NSString *session;
static NSFileHandle *output;
static dispatch_queue_t writer;
static double started;

double LESourceScrollTraceClock(void) { return NSProcessInfo.processInfo.systemUptime * 1000; }

static void flushEvents(void) {
  NSArray *batch;
  uint64_t lost;
  {
    std::lock_guard<std::mutex> lock(eventsMutex);
    batch = [events copy]; [events removeAllObjects]; lost = dropped; dropped = 0;
  }
  for (NSDictionary *entry in batch) {
    // Put the absolute timestamp first in every JSONL record, independent of
    // NSDictionary's serialization order.
    NSMutableDictionary *rest = [entry mutableCopy]; [rest removeObjectForKey:@"timestamp"];
    NSData *json = [NSJSONSerialization dataWithJSONObject:rest options:0 error:nil];
    if (json.length) {
      NSString *tail = [[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding];
      NSString *line = [NSString stringWithFormat:@"{\"timestamp\":%.3f,%@\n", [entry[@"timestamp"] doubleValue], [tail substringFromIndex:1]];
      @try { [output writeData:[line dataUsingEncoding:NSUTF8StringEncoding]]; }
      @catch (NSException *exception) { (void)exception; output = nil; break; } // Diagnostics must not crash the editor.
    }
  }
  if (lost) LESourceScrollTrace(@"dropped", nil, @{@"count":@(lost)});
}

BOOL LESourceScrollTraceEnabled(void) {
  static BOOL enabled;
  static dispatch_once_t once;
  dispatch_once(&once, ^{
    NSString *directory = NSProcessInfo.processInfo.environment[@"LEGEND_SOURCE_SCROLL_TRACE_DIR"];
    if (!directory.length) return;
    session = NSUUID.UUID.UUIDString;
    NSString *path = [directory stringByAppendingPathComponent:[NSString stringWithFormat:@"scroll-%d-%@.jsonl", getpid(), session]];
    if (![NSFileManager.defaultManager createFileAtPath:path contents:nil attributes:@{NSFilePosixPermissions:@0600}]) return;
    output = [NSFileHandle fileHandleForWritingAtPath:path];
    if (!output) return;
    events = [NSMutableArray new]; writer = dispatch_queue_create("legend.source.scroll-trace", DISPATCH_QUEUE_SERIAL);
    started = LESourceScrollTraceClock(); enabled = YES;
    // Main-thread setup is deferred to avoid reentering dispatch_once.
    dispatch_async(dispatch_get_main_queue(), ^{
      LESourceScrollTrace(@"session", nil, @{@"pid":@(getpid()), @"bundle":NSBundle.mainBundle.bundleIdentifier ?: @"test",
        @"build":@(__DATE__ " " __TIME__), @"os":NSProcessInfo.processInfo.operatingSystemVersionString,
        @"limitSeconds":@300});
      __block double last = LESourceScrollTraceClock();
      NSTimer *timer = [NSTimer timerWithTimeInterval:0.1 repeats:YES block:^(NSTimer *timer) {
        double now = LESourceScrollTraceClock();
        LESourceScrollTrace(@"main-heartbeat", nil, @{@"gapMs":@(now - last)}); last = now;
        if (now - started > 300000) {
          LESourceScrollTrace(@"capture-ended", nil, @{}); [timer invalidate];
        }
      }];
      [NSRunLoop.mainRunLoop addTimer:timer forMode:NSRunLoopCommonModes];
      [NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskKeyDown handler:^NSEvent *(NSEvent *event) {
        NSEventModifierFlags flags = event.modifierFlags & NSEventModifierFlagDeviceIndependentFlagsMask;
        if (LESourceScrollTraceClock() - started < 300000
            && flags == (NSEventModifierFlagCommand | NSEventModifierFlagOption | NSEventModifierFlagShift)
            && [event.charactersIgnoringModifiers.lowercaseString isEqual:@"d"]) {
          LESourceScrollTrace(@"user-mark", nil, @{@"eventMonoMs":@(event.timestamp * 1000), @"window":@(event.windowNumber)});
          dispatch_async(writer, ^{ flushEvents(); });
          return nil;
        }
        return event;
      }];
    });
    static dispatch_source_t flushTimer;
    flushTimer = dispatch_source_create(DISPATCH_SOURCE_TYPE_TIMER, 0, 0, writer);
    dispatch_source_set_timer(flushTimer, dispatch_time(DISPATCH_TIME_NOW, NSEC_PER_SEC), NSEC_PER_SEC, 100 * NSEC_PER_MSEC);
    dispatch_source_set_event_handler(flushTimer, ^{ flushEvents(); });
    dispatch_resume(flushTimer);
  });
  return enabled;
}

void LESourceScrollTrace(NSString *event, id owner, NSDictionary *fields) {
  if (!LESourceScrollTraceEnabled()) return;
  double mono = LESourceScrollTraceClock();
  if (mono - started > 301000) return;
  std::lock_guard<std::mutex> lock(eventsMutex);
  if (events.count >= 20000) { ++dropped; return; }
  [events addObject:@{@"timestamp":@(NSDate.date.timeIntervalSince1970 * 1000), @"prefix":@"DEBUG source-scroll-v1",
    @"session":session, @"seq":@(++sequence), @"event":event, @"monoMs":@(mono),
    @"owner":owner ? [NSString stringWithFormat:@"%p", (__bridge void *)owner] : @"process", @"fields":fields}];
}
