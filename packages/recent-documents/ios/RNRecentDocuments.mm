#import "RNRecentDocuments.h"

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
}

RCT_EXPORT_MODULE(NativeRecentDocuments)

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

- (instancetype)init
{
  if (self = [super init]) {
#if TARGET_OS_OSX
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
  if (!_hasListeners || url.path.length == 0) {
    return;
  }

  [self sendEventWithName:RNRecentDocumentOpenEvent body:@{@"path": url.path}];
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
