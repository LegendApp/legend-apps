#import "RNRecentDocuments.h"

#import "RNRecentDocumentEvents.h"
#import <React/RCTBridgeModule.h>
#import <React/RCTUtils.h>
#import <TargetConditionals.h>

#if TARGET_OS_OSX
#import <AppKit/AppKit.h>
#if __has_include(<RNDesktopApp/SparkDesktop.h>)
#import <RNDesktopApp/SparkDesktop.h>
#endif
#import <Carbon/Carbon.h>
#endif

static NSString *const RNRecentDocumentOpenEvent = @"RecentDocumentOpen";

@implementation RNRecentDocuments {
  BOOL _hasListeners;
  NSMutableArray<NSURL *> *_pendingOpenDocumentURLs;
  NSMutableSet<NSString *> *_deliveredSparkEvents;
}

RCT_EXPORT_MODULE(NativeRecentDocuments)
- (dispatch_queue_t)methodQueue { return dispatch_get_main_queue(); }

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

- (instancetype)init
{
  if (self = [super init]) {
    _pendingOpenDocumentURLs = [NSMutableArray new];
    _deliveredSparkEvents = [NSMutableSet new];
#if TARGET_OS_OSX
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(handleOpenDocumentNotification:)
                                                 name:RNRecentDocumentOpenNotification
                                               object:nil];
#if __has_include(<RNDesktopApp/SparkDesktop.h>)
    [NSNotificationCenter.defaultCenter addObserver:self selector:@selector(sparkDesktopEvent:) name:SparkDesktopEvent object:nil];
#else
    [[NSAppleEventManager sharedAppleEventManager] setEventHandler:self
                                                      andSelector:@selector(handleOpenDocumentsEvent:withReplyEvent:)
                                                    forEventClass:kCoreEventClass
                                                       andEventID:kAEOpenDocuments];
#endif
#endif
  }
  return self;
}

- (void)dealloc
{
#if TARGET_OS_OSX
  [[NSNotificationCenter defaultCenter] removeObserver:self
                                                  name:RNRecentDocumentOpenNotification
                                                object:nil];
#if __has_include(<RNDesktopApp/SparkDesktop.h>)
  [NSNotificationCenter.defaultCenter removeObserver:self name:SparkDesktopEvent object:nil];
#else
  [[NSAppleEventManager sharedAppleEventManager] removeEventHandlerForEventClass:kCoreEventClass
                                                                      andEventID:kAEOpenDocuments];
#endif
#endif
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[RNRecentDocumentOpenEvent];
}

- (void)startObserving
{
  _hasListeners = YES;

#if TARGET_OS_OSX
#if __has_include(<RNDesktopApp/SparkDesktop.h>)
  for (NSDictionary *event in SparkPendingURLs()) [self deliverSparkEvent:event];
#endif
  NSArray<NSURL *> *pendingURLs = [_pendingOpenDocumentURLs copy];
  [_pendingOpenDocumentURLs removeAllObjects];

  for (NSURL *url in pendingURLs) {
    [self emitOpenDocumentURL:url];
  }
#endif
}

- (void)stopObserving
{
  _hasListeners = NO;
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeRecentDocumentsSpecJSI>(params);
}

- (void)noteRecentDocument:(NSString *)path
{
#if TARGET_OS_OSX
  RCTExecuteOnMainQueue(^{
    NSURL *url = [self fileURLForPath:path];
    if (url) {
      [[NSDocumentController sharedDocumentController] noteNewRecentDocumentURL:url];
    }
  });
#endif
}

#if TARGET_OS_OSX
- (NSURL *)fileURLForPath:(NSString *)path
{
  if (path.length == 0) {
    return nil;
  }

  NSString *expandedPath = [path stringByExpandingTildeInPath];
  NSURL *inputURL = [NSURL URLWithString:expandedPath];
  NSURL *fileURL = inputURL.isFileURL ? inputURL : [NSURL fileURLWithPath:expandedPath];
  return fileURL.path.length > 0 ? fileURL : nil;
}

- (void)emitOpenDocumentURL:(NSURL *)url
{
  if (url.path.length == 0) {
    return;
  }

  if (!_hasListeners) {
    [_pendingOpenDocumentURLs addObject:url];
    return;
  }

  [self sendEventWithName:RNRecentDocumentOpenEvent body:@{@"path": url.path}];
}

#if __has_include(<RNDesktopApp/SparkDesktop.h>)
- (void)deliverSparkEvent:(NSDictionary *)event {
  if (![event[@"type"] isEqual:@"openFile"] || [_deliveredSparkEvents containsObject:event[@"id"]]) return;
  [_deliveredSparkEvents addObject:event[@"id"]];
  if (_deliveredSparkEvents.count > 200) {
    NSSet *queued = [NSSet setWithArray:[SparkPendingURLs() valueForKey:@"id"]];
    [_deliveredSparkEvents intersectSet:queued];
    [_deliveredSparkEvents addObject:event[@"id"]];
  }
  [self emitOpenDocumentURL:[NSURL URLWithString:event[@"url"]]];
}
- (void)sparkDesktopEvent:(NSNotification *)notification { [self deliverSparkEvent:notification.userInfo]; }
#endif

- (void)handleOpenDocumentNotification:(NSNotification *)notification
{
  NSURL *url = notification.userInfo[RNRecentDocumentURLKey];
  if ([url isKindOfClass:[NSURL class]]) {
    [self emitOpenDocumentURL:url];
  }
}

- (void)handleOpenDocumentsEvent:(NSAppleEventDescriptor *)event withReplyEvent:(__unused NSAppleEventDescriptor *)replyEvent
{
  NSAppleEventDescriptor *descriptor = [event paramDescriptorForKeyword:keyDirectObject];
  if (!descriptor) {
    return;
  }

  NSInteger count = descriptor.numberOfItems;
  if (count == 0) {
    NSURL *url = descriptor.fileURLValue;
    if (url) {
      [self emitOpenDocumentURL:url];
    }
    return;
  }

  for (NSInteger index = 1; index <= count; index += 1) {
    NSAppleEventDescriptor *item = [descriptor descriptorAtIndex:index];
    NSURL *url = item.fileURLValue;
    if (url) {
      [self emitOpenDocumentURL:url];
    }
  }
}
#endif

@end
