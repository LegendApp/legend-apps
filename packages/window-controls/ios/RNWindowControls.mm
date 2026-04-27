#import "RNWindowControls.h"

#import <React/RCTBridgeModule.h>
#import <TargetConditionals.h>

#if TARGET_OS_OSX
#import <AppKit/AppKit.h>
#endif

@implementation RNWindowControls {
  BOOL _hasListeners;
}

RCT_EXPORT_MODULE(NativeWindowControls)

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[@"fullscreenChange"];
}

- (void)startObserving
{
  _hasListeners = YES;
#if TARGET_OS_OSX
  [self emitFullscreenStatus];
  NSNotificationCenter *center = NSNotificationCenter.defaultCenter;
  [center addObserver:self selector:@selector(windowDidResize:) name:NSWindowDidResizeNotification object:nil];
  [center addObserver:self selector:@selector(windowDidEnterFullScreen:) name:NSWindowDidEnterFullScreenNotification object:nil];
  [center addObserver:self selector:@selector(windowWillExitFullScreen:) name:NSWindowWillExitFullScreenNotification object:nil];
#endif
}

- (void)stopObserving
{
  _hasListeners = NO;
#if TARGET_OS_OSX
  [NSNotificationCenter.defaultCenter removeObserver:self];
#endif
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeWindowControlsSpecJSI>(params);
}

- (void)hideWindowControls
{
#if TARGET_OS_OSX
  dispatch_async(dispatch_get_main_queue(), ^{
    NSWindow *window = [self targetWindow];
    [window standardWindowButton:NSWindowCloseButton].hidden = YES;
    [window standardWindowButton:NSWindowMiniaturizeButton].hidden = YES;
    [window standardWindowButton:NSWindowZoomButton].hidden = YES;
  });
#endif
}

- (void)showWindowControls
{
#if TARGET_OS_OSX
  dispatch_async(dispatch_get_main_queue(), ^{
    NSWindow *window = [self targetWindow];
    [window standardWindowButton:NSWindowCloseButton].hidden = NO;
    [window standardWindowButton:NSWindowMiniaturizeButton].hidden = NO;
    [window standardWindowButton:NSWindowZoomButton].hidden = NO;
  });
#endif
}

- (void)isWindowFullScreen:(RCTPromiseResolveBlock)resolve reject:(__unused RCTPromiseRejectBlock)reject
{
#if TARGET_OS_OSX
  dispatch_async(dispatch_get_main_queue(), ^{
    resolve(@([[self targetWindow] styleMask] & NSWindowStyleMaskFullScreen ? YES : NO));
  });
#else
  resolve(@NO);
#endif
}

#if TARGET_OS_OSX
- (void)windowDidResize:(NSNotification *)notification
{
  if ([self isNotificationForTargetWindow:notification]) {
    [self emitFullscreenStatus];
  }
}

- (void)windowDidEnterFullScreen:(NSNotification *)notification
{
  if (_hasListeners && [self isNotificationForTargetWindow:notification]) {
    [self sendEventWithName:@"fullscreenChange" body:@{@"isFullscreen": @YES}];
  }
}

- (void)windowWillExitFullScreen:(NSNotification *)notification
{
  if (_hasListeners && [self isNotificationForTargetWindow:notification]) {
    [self sendEventWithName:@"fullscreenChange" body:@{@"isFullscreen": @NO}];
  }
}

- (void)emitFullscreenStatus
{
  if (!_hasListeners) {
    return;
  }
  dispatch_async(dispatch_get_main_queue(), ^{
    [self sendEventWithName:@"fullscreenChange"
                       body:@{@"isFullscreen": @([[self targetWindow] styleMask] & NSWindowStyleMaskFullScreen ? YES : NO)}];
  });
}

- (NSWindow *)targetWindow
{
  NSWindow *keyWindow = NSApplication.sharedApplication.keyWindow;
  if ([self windowMatchesTargetHeuristics:keyWindow]) {
    return keyWindow;
  }

  NSWindow *mainWindow = NSApplication.sharedApplication.mainWindow;
  if ([self windowMatchesTargetHeuristics:mainWindow]) {
    return mainWindow;
  }

  for (NSWindow *window in NSApplication.sharedApplication.windows) {
    if ([self windowMatchesTargetHeuristics:window]) {
      return window;
    }
  }

  return nil;
}

- (BOOL)isNotificationForTargetWindow:(NSNotification *)notification
{
  NSWindow *window = [notification.object isKindOfClass:NSWindow.class] ? notification.object : nil;
  if (!window) {
    return NO;
  }

  NSWindow *targetWindow = [self targetWindow];
  if (targetWindow) {
    return window == targetWindow;
  }

  return [self windowMatchesTargetHeuristics:window];
}

- (BOOL)windowMatchesTargetHeuristics:(NSWindow *)window
{
  if (!window || window.sheet || [window isKindOfClass:NSPanel.class]) {
    return NO;
  }
  return window.frameAutosaveName.length > 0 || window == NSApplication.sharedApplication.mainWindow ||
    window == NSApplication.sharedApplication.keyWindow;
}
#endif

@end
