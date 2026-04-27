#import "RNGlobalHotkey.h"

#import <React/RCTBridgeModule.h>
#import <TargetConditionals.h>

#if TARGET_OS_OSX
#import <AppKit/AppKit.h>
#import <Carbon/Carbon.h>

static OSStatus RNGlobalHotkeyHandleEvent(EventHandlerCallRef nextHandler, EventRef eventRef, void *userData);
#endif

@implementation RNGlobalHotkey {
  BOOL _hasListeners;
#if TARGET_OS_OSX
  EventHotKeyRef _hotKeyRef;
  EventHandlerRef _eventHandler;
#endif
}

RCT_EXPORT_MODULE(NativeGlobalHotkey)

- (instancetype)init
{
  if (self = [super init]) {
#if TARGET_OS_OSX
    [NSNotificationCenter.defaultCenter addObserver:self
                                           selector:@selector(applicationWillTerminate:)
                                               name:NSApplicationWillTerminateNotification
                                             object:nil];
#endif
  }
  return self;
}

- (void)dealloc
{
#if TARGET_OS_OSX
  [self unregisterHotkeyInternal];
  [self removeEventHandler];
  [NSNotificationCenter.defaultCenter removeObserver:self];
#endif
}

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[@"onHotkeyPressed"];
}

- (void)startObserving
{
  _hasListeners = YES;
}

- (void)stopObserving
{
  _hasListeners = NO;
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeGlobalHotkeySpecJSI>(params);
}

- (NSString *)jsonStringFromObject:(id)object
{
  NSData *data = [NSJSONSerialization dataWithJSONObject:object options:0 error:nil];
  return data ? [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] : @"{\"success\":false}";
}

- (void)registerHotkey:(double)keyCode
             modifiers:(double)modifiers
               resolve:(RCTPromiseResolveBlock)resolve
                reject:(__unused RCTPromiseRejectBlock)reject
{
#if TARGET_OS_OSX
  dispatch_async(dispatch_get_main_queue(), ^{
    NSInteger keyCodeValue = (NSInteger)keyCode;
    if (keyCodeValue < 0 || keyCodeValue > 255) {
      resolve([self jsonStringFromObject:@{@"success": @NO, @"message": @"Unsupported key code."}]);
      return;
    }

    [self unregisterHotkeyInternal];
    if (![self installEventHandlerIfNeeded]) {
      resolve([self jsonStringFromObject:@{@"success": @NO, @"message": @"Failed to install hotkey handler."}]);
      return;
    }

    EventHotKeyID hotKeyID;
    hotKeyID.signature = 'LDHK';
    hotKeyID.id = 1;
    OSStatus status = RegisterEventHotKey((UInt32)keyCodeValue,
                                          [self carbonModifiersFromReactModifiers:(NSUInteger)modifiers],
                                          hotKeyID,
                                          GetEventDispatcherTarget(),
                                          0,
                                          &_hotKeyRef);
    if (status != noErr) {
      _hotKeyRef = nil;
      resolve([self jsonStringFromObject:@{@"success": @NO, @"message": @"Failed to register hotkey."}]);
      return;
    }

    resolve([self jsonStringFromObject:@{@"success": @YES}]);
  });
#else
  resolve([self jsonStringFromObject:@{@"success": @YES}]);
#endif
}

- (void)unregisterHotkey:(RCTPromiseResolveBlock)resolve reject:(__unused RCTPromiseRejectBlock)reject
{
#if TARGET_OS_OSX
  dispatch_async(dispatch_get_main_queue(), ^{
    [self unregisterHotkeyInternal];
    resolve([self jsonStringFromObject:@{@"success": @YES}]);
  });
#else
  resolve([self jsonStringFromObject:@{@"success": @YES}]);
#endif
}

#if TARGET_OS_OSX
- (void)applicationWillTerminate:(__unused NSNotification *)notification
{
  [self unregisterHotkeyInternal];
}

- (void)unregisterHotkeyInternal
{
  if (_hotKeyRef) {
    UnregisterEventHotKey(_hotKeyRef);
    _hotKeyRef = nil;
  }
}

- (BOOL)installEventHandlerIfNeeded
{
  if (_eventHandler) {
    return YES;
  }

  EventTypeSpec eventSpec = {kEventClassKeyboard, kEventHotKeyPressed};
  OSStatus status = InstallEventHandler(GetEventDispatcherTarget(),
                                        RNGlobalHotkeyHandleEvent,
                                        1,
                                        &eventSpec,
                                        (__bridge void *)self,
                                        &_eventHandler);
  return status == noErr;
}

- (void)removeEventHandler
{
  if (_eventHandler) {
    RemoveEventHandler(_eventHandler);
    _eventHandler = nil;
  }
}

- (void)handleHotkeyEvent:(EventRef)eventRef
{
  if (!_hasListeners || !eventRef) {
    return;
  }

  EventHotKeyID hotKeyID;
  OSStatus status = GetEventParameter(eventRef,
                                      kEventParamDirectObject,
                                      typeEventHotKeyID,
                                      nil,
                                      sizeof(EventHotKeyID),
                                      nil,
                                      &hotKeyID);
  if (status == noErr && hotKeyID.id == 1) {
    [self sendEventWithName:@"onHotkeyPressed" body:@{@"id": @(hotKeyID.id)}];
  }
}

- (UInt32)carbonModifiersFromReactModifiers:(NSUInteger)modifiers
{
  UInt32 carbonModifiers = 0;
  if (modifiers & NSEventModifierFlagCommand) {
    carbonModifiers |= cmdKey;
  }
  if (modifiers & NSEventModifierFlagShift) {
    carbonModifiers |= shiftKey;
  }
  if (modifiers & NSEventModifierFlagOption) {
    carbonModifiers |= optionKey;
  }
  if (modifiers & NSEventModifierFlagControl) {
    carbonModifiers |= controlKey;
  }
  return carbonModifiers;
}

static OSStatus RNGlobalHotkeyHandleEvent(EventHandlerCallRef nextHandler, EventRef eventRef, void *userData)
{
  RNGlobalHotkey *module = (__bridge RNGlobalHotkey *)userData;
  [module handleHotkeyEvent:eventRef];
  return noErr;
}
#endif

@end
