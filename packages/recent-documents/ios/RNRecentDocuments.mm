#import "RNRecentDocuments.h"

#import "RNRecentDocumentEvents.h"
#import <React/RCTBridgeModule.h>
#import <React/RCTUtils.h>
#import <TargetConditionals.h>

#if TARGET_OS_OSX
#import <AppKit/AppKit.h>
#import <Carbon/Carbon.h>
#endif

static NSString *const RNRecentDocumentOpenEvent = @"RecentDocumentOpen";

@implementation RNRecentDocuments {
  BOOL _hasListeners;
  NSMutableArray<NSURL *> *_pendingOpenDocumentURLs;
}

RCT_EXPORT_MODULE(NativeRecentDocuments)

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

- (instancetype)init
{
  if (self = [super init]) {
    _pendingOpenDocumentURLs = [NSMutableArray new];
#if TARGET_OS_OSX
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(handleOpenDocumentNotification:)
                                                 name:RNRecentDocumentOpenNotification
                                               object:nil];
    [[NSAppleEventManager sharedAppleEventManager] setEventHandler:self
                                                      andSelector:@selector(handleOpenDocumentsEvent:withReplyEvent:)
                                                    forEventClass:kCoreEventClass
                                                       andEventID:kAEOpenDocuments];
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
  [[NSAppleEventManager sharedAppleEventManager] removeEventHandlerForEventClass:kCoreEventClass
                                                                      andEventID:kAEOpenDocuments];
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
