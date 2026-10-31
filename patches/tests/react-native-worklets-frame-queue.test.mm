#import <Foundation/Foundation.h>
#import <QuartzCore/QuartzCore.h>
#import <worklets/apple/AnimationFrameQueue.h>
#include <algorithm>
#include <cstdio>
#include <functional>
#include <unistd.h>
#include <vector>

// Compiles the production AnimationFrameQueue.mm and RCTPlatformDisplayLink.m against a real CVDisplayLink.
extern "C" BOOL RCTIsMainQueue(void) { return NSThread.isMainThread; }
extern "C" void _RCTAssertFormat(const char *condition, const char *file, int line, const char *, NSString *, ...)
{
  fprintf(stderr, "RCTAssert %s %s:%d\n", condition, file, line);
  abort();
}

static int failures = 0;
#define CHECK(cond, ...)                                    \
  do {                                                      \
    bool ok_ = (cond);                                      \
    if (!ok_) failures++;                                   \
    printf("%s ", ok_ ? "PASS" : "FAIL");                   \
    printf(__VA_ARGS__);                                    \
    printf("\n");                                           \
  } while (0)

static double nowMs() { return CACurrentMediaTime() * 1000; }
static void runFor(double ms) { [NSRunLoop.mainRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:ms / 1000]]; }
static void busy(double ms) { for (double end = nowMs() + ms; nowMs() < end;) {} }
static dispatch_queue_t turboModuleQueue()
{
  static dispatch_queue_t queue = dispatch_queue_create("com.meta.react.turbomodulemanager.queue", DISPATCH_QUEUE_SERIAL);
  return queue;
}
static BOOL linkPaused(AnimationFrameQueue *queue) { return [[queue valueForKey:@"displayLink_"] isPaused]; }

// A self-requeueing frame loop, as the UI runtime does with nativeFlushQueue.
struct Loop {
  AnimationFrameQueue *queue;
  double busyMs = 0;
  bool running = true;
  int stallAtFrame = -1;
  double stallMs = 0;
  double stallEnd = 0;
  std::vector<double> calls, timestamps;
  std::function<void(double)> frame;
  Loop(AnimationFrameQueue *q) : queue(q)
  {
    frame = [this](double timestamp) {
      calls.push_back(nowMs());
      timestamps.push_back(timestamp);
      busy(busyMs);
      if ((int)calls.size() == stallAtFrame) {
        usleep(stallMs * 1000);
        stallEnd = nowMs();
      }
      if (running) [queue requestAnimationFrame:frame];
    };
  }
  void start() { [queue requestAnimationFrame:frame]; }
};

static double median(std::vector<double> values)
{
  std::sort(values.begin(), values.end());
  return values.empty() ? 0 : values[values.size() / 2];
}

static std::vector<double> deltas(const std::vector<double> &values, size_t from = 1)
{
  std::vector<double> result;
  for (size_t i = std::max<size_t>(from, 1); i < values.size(); i++) result.push_back(values[i] - values[i - 1]);
  return result;
}

int main()
{
  setvbuf(stdout, NULL, _IOLBF, 0);
  @autoreleasepool {
    NSThread.currentThread.name = @"com.facebook.react.runtime.JavaScript";
    CVDisplayLinkRef probe;
    if (CVDisplayLinkCreateWithActiveCGDisplays(&probe) != kCVReturnSuccess) {
      CHECK(false, "a display link is available");
      return 1;
    }
    CVTime nominal = CVDisplayLinkGetNominalOutputVideoRefreshPeriod(probe);
    const double period = 1000.0 * nominal.timeValue / nominal.timeScale;
    CVDisplayLinkRelease(probe);
    printf("INFO display period %.2f ms\n", period);
    if (fabs(period - 1000.0 / 60) > 0.5 || !std::isfinite(period)) {
      CHECK(false, "frame queue tests require a 60 Hz display");
      return 1;
    }

    for (double busyMs : {0.0, 4.0, 8.0, 12.0}) {
      AnimationFrameQueue *queue = [AnimationFrameQueue new];
      Loop loop(queue);
      loop.busyMs = busyMs;
      loop.start();
      runFor(1000);
      loop.running = false;
      runFor(4 * period);
      dispatch_sync(turboModuleQueue(), ^{ [queue invalidate]; });
      if (loop.calls.size() < 7 || loop.timestamps.size() < 2) {
        CHECK(false, "busy %.0f ms delivered too few frame samples (%zu calls, %zu timestamps)", busyMs, loop.calls.size(), loop.timestamps.size());
        return 1;
      }
      auto frameDeltas = deltas(loop.calls, 5);
      double fps = 1000.0 * (loop.calls.size() - 6) / (loop.calls.back() - loop.calls[5]);
      printf("INFO busy %.0f ms: %.1f fps, median %.2f ms\n", busyMs, fps, median(frameDeltas));
      CHECK(median(frameDeltas) < 1.5 * period, "busy %.0f ms keeps one frame per pulse (median %.2f ms)", busyMs, median(frameDeltas));
      auto timestampDeltas = deltas(loop.timestamps);
      CHECK(*std::min_element(timestampDeltas.begin(), timestampDeltas.end()) > 0, "busy %.0f ms timestamps increase", busyMs);
      CHECK(fabs(loop.timestamps.back() - loop.calls.back()) < 3 * period, "timestamps are milliseconds near the media clock");
    }

    {
      AnimationFrameQueue *queue = [AnimationFrameQueue new];
      Loop loop(queue);
      loop.stallAtFrame = 20;
      loop.stallMs = 8 * period;
      loop.start();
      runFor(600);
      loop.running = false;
      runFor(4 * period);
      dispatch_sync(turboModuleQueue(), ^{ [queue invalidate]; });
      if (loop.calls.size() < 26 || loop.timestamps.size() < 26) {
        CHECK(false, "stall test delivered too few frame samples (%zu calls, %zu timestamps)", loop.calls.size(), loop.timestamps.size());
        return 1;
      }
      std::vector<double> after;
      for (size_t i = 20; i < loop.calls.size() && after.size() < 6; i++) after.push_back(loop.calls[i]);
      auto afterDeltas = deltas(after);
      double minDelta = *std::min_element(afterDeltas.begin(), afterDeltas.end());
      auto timestampDeltas = deltas(std::vector<double>(loop.timestamps.begin() + 20, loop.timestamps.begin() + 26));
      double minTimestampDelta = *std::min_element(timestampDeltas.begin(), timestampDeltas.end());
      int burst = 0;
      for (double call : loop.calls) burst += call > loop.stallEnd && call < loop.stallEnd + period / 2;
      printf("INFO stall %.0f ms: %d frames within half a period after it, min gap %.2f ms, min timestamp delta %.2f ms\n",
             loop.stallMs, burst, minDelta, minTimestampDelta);
      CHECK(burst <= 1, "main thread stall does not replay queued pulses (%d frames)", burst);
      CHECK(minDelta > period / 2, "frames after the stall stay one pulse apart (min %.2f ms)", minDelta);
      CHECK(minTimestampDelta > period / 2, "timestamps after the stall stay one pulse apart (min %.2f ms)", minTimestampDelta);
    }

    {
      AnimationFrameQueue *queue = [AnimationFrameQueue new];
      std::vector<double> parent, children;
      bool requeued = false;
      std::function<void(double)> child = [&](double timestamp) { children.push_back(timestamp); };
      [queue requestAnimationFrame:[&](double timestamp) {
        parent.push_back(timestamp);
        for (int i = 0; i < 3; i++) [queue requestAnimationFrame:child];
        requeued = true;
      }];
      runFor(6 * period);
      CHECK(parent.size() == 1 && children.size() == 3, "each registration runs once (%zu parent, %zu children)", parent.size(), children.size());
      CHECK(requeued && children.size() == 3 && children[0] == children[2] && children[0] > parent[0],
            "callbacks requested during a frame share the next frame");
      runFor(4 * period);
      CHECK(linkPaused(queue), "link stops after an idle tick");
      double requested = nowMs();
      double resumed = 0;
      [queue requestAnimationFrame:[&](double) { resumed = nowMs(); }];
      runFor(4 * period);
      CHECK(resumed > 0 && resumed - requested < 3 * period, "request after idle resumes (%.2f ms)", resumed - requested);

      static std::atomic<int> requests = 0, called = 0;
      dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
        for (int i = 0; i < 300; i++) {
          usleep(arc4random_uniform((useconds_t)(2 * period * 1000)));
          [queue requestAnimationFrame:[](double) { called++; }];
          requests++;
        }
      });
      for (double end = nowMs() + 300 * 2 * period; nowMs() < end && requests < 300;) runFor(50);
      runFor(6 * period);
      CHECK(requests == 300 && called == 300, "requests racing idle stops all run (%d/%d)", called.load(), requests.load());
      dispatch_sync(turboModuleQueue(), ^{ [queue invalidate]; });
    }

    {
      AnimationFrameQueue *queue = [AnimationFrameQueue new];
      int called = 0;
      [queue requestAnimationFrame:[&](double) { called++; }];
      usleep(3 * period * 1000);
      dispatch_sync(turboModuleQueue(), ^{ [queue invalidate]; });
      runFor(4 * period);
      CHECK(called == 0, "tick queued before invalidate does not deliver (%d)", called);
      [queue requestAnimationFrame:[&](double) { called++; }];
      runFor(4 * period);
      CHECK(called == 0 && linkPaused(queue), "request after invalidate does not restart the link");
    }
  }
  printf("%s %d failure(s)\n", failures ? "FAILED" : "OK", failures);
  return failures ? 1 : 0;
}
