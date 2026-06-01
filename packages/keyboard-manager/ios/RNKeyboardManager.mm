#import "RNKeyboardManager.h"

#import <React/RCTBridgeModule.h>
#import <TargetConditionals.h>

#if TARGET_OS_OSX
#import <AppKit/AppKit.h>
#import <Carbon/Carbon.h>
#import <IOKit/hidsystem/IOLLEvent.h>
#import <IOKit/hidsystem/ev_keymap.h>
#endif

static NSInteger const RNKeyboardMediaPlayPause = 10001;
static NSInteger const RNKeyboardMediaNext = 10002;
static NSInteger const RNKeyboardMediaPrevious = 10003;

@implementation RNKeyboardManager {
  BOOL _hasListeners;
#if TARGET_OS_OSX
  id _localEventMonitor;
  NSMutableDictionary<NSString *, NSNumber *> *_eventResponses;
  dispatch_queue_t _eventResponseQueue;
#endif
}

RCT_EXPORT_MODULE(NativeKeyboardManager)

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

- (instancetype)init
{
  if (self = [super init]) {
#if TARGET_OS_OSX
    _eventResponses = [NSMutableDictionary dictionary];
    _eventResponseQueue = dispatch_queue_create("com.legenddesktop.keyboard.responses", DISPATCH_QUEUE_CONCURRENT);
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
  [self stopMonitoringInternal];
  [NSNotificationCenter.defaultCenter removeObserver:self];
#endif
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[@"onKeyDown", @"onKeyUp"];
}

- (void)startObserving
{
  _hasListeners = YES;
}

- (void)stopObserving
{
  _hasListeners = NO;
#if TARGET_OS_OSX
  [self stopMonitoringInternal];
#endif
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeKeyboardManagerSpecJSI>(params);
}

- (void)startMonitoringKeyboard:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
#if TARGET_OS_OSX
  dispatch_async(dispatch_get_main_queue(), ^{
    [self startMonitoringInternal];
    resolve(@YES);
  });
#else
  resolve(@NO);
#endif
}

- (void)stopMonitoringKeyboard:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
#if TARGET_OS_OSX
  dispatch_async(dispatch_get_main_queue(), ^{
    [self stopMonitoringInternal];
    resolve(@YES);
  });
#else
  resolve(@NO);
#endif
}

- (void)respondToKeyEvent:(NSString *)eventId handled:(BOOL)handled
{
#if TARGET_OS_OSX
  if (eventId.length == 0) {
    return;
  }
  dispatch_barrier_async(_eventResponseQueue, ^{
    self->_eventResponses[eventId] = @(handled);
  });
#endif
}

#if TARGET_OS_OSX
- (void)applicationWillTerminate:(NSNotification *)notification
{
  [self stopMonitoringInternal];
}

- (void)startMonitoringInternal
{
  [self stopMonitoringInternal];
  __weak RNKeyboardManager *weakSelf = self;
  NSEventMask eventMask = NSEventMaskKeyDown | NSEventMaskKeyUp | NSEventMaskSystemDefined;
  _localEventMonitor = [NSEvent addLocalMonitorForEventsMatchingMask:eventMask handler:^NSEvent *(NSEvent *event) {
    RNKeyboardManager *strongSelf = weakSelf;
    if (!strongSelf) {
      return event;
    }
    return [strongSelf handleKeyboardEvent:event];
  }];
}

- (void)stopMonitoringInternal
{
  if (_localEventMonitor) {
    [NSEvent removeMonitor:_localEventMonitor];
    _localEventMonitor = nil;
  }
}

- (NSEvent *)handleKeyboardEvent:(NSEvent *)event
{
  if (!_hasListeners) {
    return event;
  }

  if (event.type == NSEventTypeSystemDefined) {
    return [self handleSystemDefinedEvent:event];
  }

  if (event.type != NSEventTypeKeyDown && event.type != NSEventTypeKeyUp) {
    return event;
  }

  NSString *eventName = event.type == NSEventTypeKeyDown ? @"onKeyDown" : @"onKeyUp";
  BOOL handled = [self emitKeyboardEvent:eventName keyCode:event.keyCode modifiers:event.modifierFlags];
  return handled ? nil : event;
}

- (NSEvent *)handleSystemDefinedEvent:(NSEvent *)event
{
  if (event.subtype != NX_SUBTYPE_AUX_CONTROL_BUTTONS) {
    return event;
  }
  NSInteger data = event.data1;
  NSInteger keyCode = (data & 0xFFFF0000) >> 16;
  NSInteger keyFlags = data & 0x0000FFFF;
  NSInteger keyState = (keyFlags & 0xFF00) >> 8;
  NSNumber *mappedKeyCode = [self mappedMediaKeyCode:keyCode];
  if (!mappedKeyCode) {
    return event;
  }
  NSString *eventName = keyState == NX_KEYDOWN ? @"onKeyDown" : @"onKeyUp";
  BOOL handled = [self emitKeyboardEvent:eventName keyCode:mappedKeyCode.integerValue modifiers:0];
  return handled ? nil : event;
}

- (NSNumber *)mappedMediaKeyCode:(NSInteger)keyCode
{
  switch (keyCode) {
    case NX_KEYTYPE_PLAY:
      return @(RNKeyboardMediaPlayPause);
    case NX_KEYTYPE_FAST:
    case NX_KEYTYPE_NEXT:
      return @(RNKeyboardMediaNext);
    case NX_KEYTYPE_REWIND:
    case NX_KEYTYPE_PREVIOUS:
      return @(RNKeyboardMediaPrevious);
    default:
      return nil;
  }
}

- (BOOL)emitKeyboardEvent:(NSString *)eventName keyCode:(NSInteger)keyCode modifiers:(NSUInteger)modifiers
{
  NSString *eventId = NSUUID.UUID.UUIDString;
  [self sendEventWithName:eventName body:@{
    @"keyCode": @(keyCode),
    @"modifiers": @(modifiers),
    @"eventId": eventId,
  }];

  [NSThread sleepForTimeInterval:0.01];

  __block BOOL handled = NO;
  dispatch_sync(_eventResponseQueue, ^{
    handled = [self->_eventResponses[eventId] boolValue];
  });
  dispatch_barrier_async(_eventResponseQueue, ^{
    [self->_eventResponses removeObjectForKey:eventId];
  });
  return handled;
}
#endif

@end
