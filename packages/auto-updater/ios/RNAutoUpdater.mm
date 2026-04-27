#import "RNAutoUpdater.h"

#import <React/RCTBridgeModule.h>
#import <TargetConditionals.h>

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
  if (self = [super init]) {
#if RN_AUTO_UPDATER_HAS_SPARKLE
    _updateController = [[SPUStandardUpdaterController alloc] initWithStartingUpdater:NO
                                                                      updaterDelegate:nil
                                                                   userDriverDelegate:nil];
#endif
  }
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
  dispatch_async(dispatch_get_main_queue(), ^{
    if (value) {
      [self->_updateController startUpdater];
    }
    self->_updateController.updater.automaticallyChecksForUpdates = value;
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
  dispatch_async(dispatch_get_main_queue(), ^{
    self->_updateController.updater.updateCheckInterval = interval;
    resolve(@YES);
  });
#else
  resolve(@NO);
#endif
}

@end
