#import "RNAppExit.h"

#import <React/RCTBridgeModule.h>
#import <TargetConditionals.h>

#if TARGET_OS_OSX
#import <AppKit/AppKit.h>
#endif

@implementation RNAppExit

RCT_EXPORT_MODULE(NativeAppExit)

- (instancetype)init
{
  if (self = [super init]) {
#if TARGET_OS_OSX
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(handleWillTerminate:)
                                                 name:NSApplicationWillTerminateNotification
                                               object:nil];
#endif
  }
  return self;
}

- (void)dealloc
{
#if TARGET_OS_OSX
  [[NSNotificationCenter defaultCenter] removeObserver:self];
#endif
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[@"AppExitRequested"];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeAppExitSpecJSI>(params);
}

- (NSNumber *)isSupported
{
#if TARGET_OS_OSX
  return @YES;
#else
  return @NO;
#endif
}

- (void)requestExit
{
#if TARGET_OS_OSX
  [self sendEventWithName:@"AppExitRequested" body:@{@"reason": @"requested"}];
  dispatch_async(dispatch_get_main_queue(), ^{
    [NSApp terminate:nil];
  });
#endif
}

- (void)completeExit:(BOOL)allow
{
#if TARGET_OS_OSX
  dispatch_async(dispatch_get_main_queue(), ^{
    [NSApp replyToApplicationShouldTerminate:allow ? NSTerminateNow : NSTerminateCancel];
  });
#endif
}

#if TARGET_OS_OSX
- (void)handleWillTerminate:(__unused NSNotification *)notification
{
  [self sendEventWithName:@"AppExitRequested" body:@{@"reason": @"willTerminate"}];
}
#endif

@end
