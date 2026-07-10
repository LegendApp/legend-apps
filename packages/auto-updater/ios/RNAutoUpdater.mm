#import "RNAutoUpdater.h"

#import <React/RCTBridgeModule.h>
#import <TargetConditionals.h>

#if TARGET_OS_OSX && DEBUG
#import <os/log.h>
#endif

static void LogDiffStartupAutoUpdater(NSString *event, NSDictionary *payload)
{
#if TARGET_OS_OSX && DEBUG
  static os_log_t log = os_log_create("so.legend.diff.macos", "startup-diagnosis");
  static NSUInteger sequence = 0;
  sequence += 1;
  const long long timestamp = (long long)(NSDate.date.timeIntervalSince1970 * 1000.0);
  NSString *message = [NSString stringWithFormat:@"%lld [DEBUG diff-startup-candidates-v1] %@ {\"seq\":%lu,\"data\":%@}",
                       timestamp,
                       event,
                       (unsigned long)sequence,
                       (payload ?: @{}).description];
  os_log_with_type(log, OS_LOG_TYPE_DEFAULT, "%{public}@", message);
#else
  (void)event;
  (void)payload;
#endif
}

#if TARGET_OS_OSX && __has_include(<Sparkle/Sparkle.h>)
#import <Sparkle/Sparkle.h>
#define RN_AUTO_UPDATER_HAS_SPARKLE 1
#else
#define RN_AUTO_UPDATER_HAS_SPARKLE 0
#endif

@implementation RNAutoUpdater {
#if RN_AUTO_UPDATER_HAS_SPARKLE
  SPUStandardUpdaterController *_updateController;
#endif
}

RCT_EXPORT_MODULE(NativeAutoUpdater)

- (instancetype)init
{
  CFAbsoluteTime startedAt = CFAbsoluteTimeGetCurrent();
  LogDiffStartupAutoUpdater(@"native.autoUpdater.init.start", @{});
  if (self = [super init]) {
#if RN_AUTO_UPDATER_HAS_SPARKLE
    _updateController = [[SPUStandardUpdaterController alloc] initWithStartingUpdater:NO
                                                                      updaterDelegate:nil
                                                                   userDriverDelegate:nil];
#endif
  }
  LogDiffStartupAutoUpdater(@"native.autoUpdater.init.finish", @{
    @"durationMs": @((CFAbsoluteTimeGetCurrent() - startedAt) * 1000.0),
  });
  return self;
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeAutoUpdaterSpecJSI>(params);
}

- (NSNumber *)isAvailable
{
#if RN_AUTO_UPDATER_HAS_SPARKLE
  return @YES;
#else
  return @NO;
#endif
}

- (void)checkForUpdates:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
#if RN_AUTO_UPDATER_HAS_SPARKLE
  dispatch_async(dispatch_get_main_queue(), ^{
    if (self->_updateController.updater.sessionInProgress) {
      reject(@"UPDATE_IN_PROGRESS", @"An update check is already in progress", nil);
      return;
    }

    [self->_updateController startUpdater];
    [self->_updateController.updater checkForUpdates];
    resolve(@YES);
  });
#else
  resolve(@NO);
#endif
}

- (void)checkForUpdatesInBackground:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
#if RN_AUTO_UPDATER_HAS_SPARKLE
  dispatch_async(dispatch_get_main_queue(), ^{
    if (self->_updateController.updater.sessionInProgress) {
      reject(@"UPDATE_IN_PROGRESS", @"An update check is already in progress", nil);
      return;
    }

    [self->_updateController startUpdater];
    [self->_updateController.updater checkForUpdatesInBackground];
    resolve(@YES);
  });
#else
  resolve(@NO);
#endif
}

- (void)getAutomaticallyChecksForUpdates:(RCTPromiseResolveBlock)resolve reject:(__unused RCTPromiseRejectBlock)reject
{
#if RN_AUTO_UPDATER_HAS_SPARKLE
  dispatch_async(dispatch_get_main_queue(), ^{
    resolve(@(self->_updateController.updater.automaticallyChecksForUpdates));
  });
#else
  resolve(@NO);
#endif
}

- (void)setAutomaticallyChecksForUpdates:(BOOL)value
                                 resolve:(RCTPromiseResolveBlock)resolve
                                  reject:(__unused RCTPromiseRejectBlock)reject
{
#if RN_AUTO_UPDATER_HAS_SPARKLE
  CFAbsoluteTime scheduledAt = CFAbsoluteTimeGetCurrent();
  LogDiffStartupAutoUpdater(@"native.autoUpdater.automaticChecks.schedule", @{});
  dispatch_async(dispatch_get_main_queue(), ^{
    CFAbsoluteTime startedAt = CFAbsoluteTimeGetCurrent();
    LogDiffStartupAutoUpdater(@"native.autoUpdater.automaticChecks.main.start", @{
      @"queueDelayMs": @((startedAt - scheduledAt) * 1000.0),
    });
    if (value) {
      [self->_updateController startUpdater];
    }
    self->_updateController.updater.automaticallyChecksForUpdates = value;
    LogDiffStartupAutoUpdater(@"native.autoUpdater.automaticChecks.main.finish", @{
      @"durationMs": @((CFAbsoluteTimeGetCurrent() - startedAt) * 1000.0),
    });
    resolve(@YES);
  });
#else
  resolve(@NO);
#endif
}

- (void)getUpdateCheckInterval:(RCTPromiseResolveBlock)resolve reject:(__unused RCTPromiseRejectBlock)reject
{
#if RN_AUTO_UPDATER_HAS_SPARKLE
  dispatch_async(dispatch_get_main_queue(), ^{
    resolve(@(self->_updateController.updater.updateCheckInterval));
  });
#else
  resolve(@0);
#endif
}

- (void)setUpdateCheckInterval:(double)interval
                       resolve:(RCTPromiseResolveBlock)resolve
                        reject:(__unused RCTPromiseRejectBlock)reject
{
#if RN_AUTO_UPDATER_HAS_SPARKLE
  CFAbsoluteTime scheduledAt = CFAbsoluteTimeGetCurrent();
  LogDiffStartupAutoUpdater(@"native.autoUpdater.interval.schedule", @{});
  dispatch_async(dispatch_get_main_queue(), ^{
    CFAbsoluteTime startedAt = CFAbsoluteTimeGetCurrent();
    LogDiffStartupAutoUpdater(@"native.autoUpdater.interval.main.start", @{
      @"queueDelayMs": @((startedAt - scheduledAt) * 1000.0),
    });
    self->_updateController.updater.updateCheckInterval = interval;
    LogDiffStartupAutoUpdater(@"native.autoUpdater.interval.main.finish", @{
      @"durationMs": @((CFAbsoluteTimeGetCurrent() - startedAt) * 1000.0),
    });
    resolve(@YES);
  });
#else
  resolve(@NO);
#endif
}

@end
