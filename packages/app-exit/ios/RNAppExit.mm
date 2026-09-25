#import "RNAppExit.h"

#import <React/RCTBridgeModule.h>
#import <TargetConditionals.h>

#if TARGET_OS_OSX
#import <AppKit/AppKit.h>
#if __has_include(<RNDesktopApp/SparkLifecycle.h>)
#import <RNDesktopApp/SparkLifecycle.h>
#endif
#endif

@interface RNAppExit ()
#if TARGET_OS_OSX
#if __has_include(<RNDesktopApp/SparkLifecycle.h>)
@property (nonatomic, copy) SparkQuitReply sparkQuitReply;
@property (nonatomic, copy) NSString *sparkQuitIdentifier;
#endif
@property (nonatomic, assign) BOOL hasAppExitListeners;
@property (nonatomic, assign) BOOL isWaitingForExitCompletion;
#endif
@end

@implementation RNAppExit

#if TARGET_OS_OSX
static __weak RNAppExit *RNAppExitSharedInstance = nil;
#endif

RCT_EXPORT_MODULE(NativeAppExit)
+ (BOOL)requiresMainQueueSetup { return YES; }
- (dispatch_queue_t)methodQueue { return dispatch_get_main_queue(); }


- (instancetype)init
{
  if (self = [super init]) {
#if TARGET_OS_OSX
    RNAppExitSharedInstance = self;
#if __has_include(<RNDesktopApp/SparkLifecycle.h>)
    self.sparkQuitIdentifier = [@"legend.app-exit." stringByAppendingString:NSUUID.UUID.UUIDString];
#endif
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
#if __has_include(<RNDesktopApp/SparkLifecycle.h>)
  NSString *identifier = _sparkQuitIdentifier;
  dispatch_async(dispatch_get_main_queue(), ^{ SparkRemoveQuitHandler(identifier); });
#endif
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
#if __has_include(<RNDesktopApp/SparkLifecycle.h>)
  __weak RNAppExit *weakSelf = self;
  SparkRegisterQuitHandler(self.sparkQuitIdentifier, ^(SparkQuitReply reply) {
    RNAppExit *module = weakSelf;
    if (!module || !module.hasAppExitListeners) { reply(NO); return; }
    // An old JS save may still finish after a timeout. Do not let that
    // completion approve a newer quit attempt.
    if (module.sparkQuitReply) { reply(NO); return; }
    module.sparkQuitReply = reply;
    [module sendEventWithName:@"AppExitRequested" body:@{@"reason": @"requested"}];
  });
#endif
#endif
}

- (void)stopObserving
{
#if TARGET_OS_OSX
  self.hasAppExitListeners = NO;
#if __has_include(<RNDesktopApp/SparkLifecycle.h>)
  SparkRemoveQuitHandler(self.sparkQuitIdentifier);
  // Keep an outstanding completion until JS acknowledges it. A replacement
  // subscription must not mistake that old completion for its own approval.
#endif
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

- (void)invalidate
{
  dispatch_async(dispatch_get_main_queue(), ^{ [self stopObserving]; });
  [super invalidate];
}

- (void)requestExit
{
#if TARGET_OS_OSX
  dispatch_async(dispatch_get_main_queue(), ^{
    [NSRunLoop.mainRunLoop performBlock:^{ [NSApp terminate:nil]; }];
  });
#endif
}

- (void)completeExit:(BOOL)allow
{
#if TARGET_OS_OSX
  dispatch_async(dispatch_get_main_queue(), ^{
#if __has_include(<RNDesktopApp/SparkLifecycle.h>)
    SparkQuitReply reply = self.sparkQuitReply;
    self.sparkQuitReply = nil;
    if (reply) reply(allow);
#else
    self.isWaitingForExitCompletion = NO;
    [NSApp replyToApplicationShouldTerminate:allow];
#endif
  });
#endif
}

#if TARGET_OS_OSX
+ (NSApplicationTerminateReply)applicationShouldTerminate
{
  RNAppExit *module = RNAppExitSharedInstance;
  if (!module || !module.hasAppExitListeners) {
    return NSTerminateNow;
  }
  if (module.isWaitingForExitCompletion) {
    return NSTerminateLater;
  }

  module.isWaitingForExitCompletion = YES;
  [module sendEventWithName:@"AppExitRequested" body:@{@"reason": @"requested"}];
  return NSTerminateLater;
}

- (void)handleWillTerminate:(__unused NSNotification *)notification
{
  // AppKit may announce termination after React has invalidated its bridge.
  if (self.hasAppExitListeners && self.callableJSModules) {
    [self sendEventWithName:@"AppExitRequested" body:@{@"reason": @"willTerminate"}];
  }
}
#endif

@end
