#import "RNAppExit.h"

#import <React/RCTBridgeModule.h>
#import <TargetConditionals.h>

#if TARGET_OS_OSX
#import <AppKit/AppKit.h>
#endif

@interface RNAppExit ()
#if TARGET_OS_OSX
@property (nonatomic, assign) BOOL hasAppExitListeners;
@property (nonatomic, assign) BOOL isWaitingForExitCompletion;
#endif
@end

@implementation RNAppExit

#if TARGET_OS_OSX
static __weak RNAppExit *RNAppExitSharedInstance = nil;
#endif

RCT_EXPORT_MODULE(NativeAppExit)

- (instancetype)init
{
  if (self = [super init]) {
#if TARGET_OS_OSX
    RNAppExitSharedInstance = self;
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
  if (RNAppExitSharedInstance == self) {
    RNAppExitSharedInstance = nil;
  }
  [[NSNotificationCenter defaultCenter] removeObserver:self];
#endif
}

- (void)startObserving
{
#if TARGET_OS_OSX
  self.hasAppExitListeners = YES;
#endif
}

- (void)stopObserving
{
#if TARGET_OS_OSX
  self.hasAppExitListeners = NO;
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
  dispatch_async(dispatch_get_main_queue(), ^{
    [NSApp terminate:nil];
  });
#endif
}

- (void)completeExit:(BOOL)allow
{
#if TARGET_OS_OSX
  dispatch_async(dispatch_get_main_queue(), ^{
    self.isWaitingForExitCompletion = NO;
    [NSApp replyToApplicationShouldTerminate:allow ? NSTerminateNow : NSTerminateCancel];
  });
#endif
}

#if TARGET_OS_OSX
+ (NSApplicationTerminateReply)applicationShouldTerminate
{
  RNAppExit *module = RNAppExitSharedInstance;
  if (!module || !module.hasAppExitListeners || module.isWaitingForExitCompletion) {
    return NSTerminateNow;
  }

  module.isWaitingForExitCompletion = YES;
  [module sendEventWithName:@"AppExitRequested" body:@{@"reason": @"requested"}];
  return NSTerminateLater;
}

- (void)handleWillTerminate:(__unused NSNotification *)notification
{
  [self sendEventWithName:@"AppExitRequested" body:@{@"reason": @"willTerminate"}];
}
#endif

@end
