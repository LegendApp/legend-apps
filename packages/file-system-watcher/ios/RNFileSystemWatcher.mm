#import "RNFileSystemWatcher.h"

#import <React/RCTBridgeModule.h>
#import <TargetConditionals.h>

#if TARGET_OS_OSX
#import <CoreServices/CoreServices.h>

static void RNFileSystemWatcherEventsCallback(ConstFSEventStreamRef streamRef,
                                              void *clientCallBackInfo,
                                              size_t numEvents,
                                              void *eventPaths,
                                              const FSEventStreamEventFlags eventFlags[],
                                              const FSEventStreamEventId eventIds[]);
#endif

@implementation RNFileSystemWatcher {
  BOOL _hasListeners;
  NSMutableArray<NSString *> *_watchedDirectories;
#if TARGET_OS_OSX
  FSEventStreamRef _eventStream;
#endif
}

RCT_EXPORT_MODULE(NativeFileSystemWatcher)

- (instancetype)init
{
  if (self = [super init]) {
    _watchedDirectories = [NSMutableArray new];
  }
  return self;
}

- (void)dealloc
{
#if TARGET_OS_OSX
  [self stopEventStream];
#endif
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[@"onDirectoryChanged"];
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
  return std::make_shared<facebook::react::NativeFileSystemWatcherSpecJSI>(params);
}

- (NSArray<NSString *> *)parseDirectoriesJSON:(NSString *)json
{
  NSData *data = [json dataUsingEncoding:NSUTF8StringEncoding];
  if (!data) {
    return @[];
  }

  id parsed = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
  if (![parsed isKindOfClass:NSArray.class]) {
    return @[];
  }

  NSMutableArray<NSString *> *directories = [NSMutableArray new];
  for (id value in (NSArray *)parsed) {
    if ([value isKindOfClass:NSString.class] && [value length] > 0) {
      [directories addObject:[value stringByStandardizingPath]];
    }
  }
  return directories;
}

- (void)setWatchedDirectories:(NSString *)directoriesJson
{
#if TARGET_OS_OSX
  dispatch_async(dispatch_get_main_queue(), ^{
    [self->_watchedDirectories removeAllObjects];
    [self->_watchedDirectories addObjectsFromArray:[self parseDirectoriesJSON:directoriesJson]];
    [self restartEventStream];
  });
#endif
}

- (void)isWatchingDirectory:(NSString *)directory
                    resolve:(RCTPromiseResolveBlock)resolve
                     reject:(__unused RCTPromiseRejectBlock)reject
{
  NSString *standardized = [directory stringByStandardizingPath];
  resolve(@([_watchedDirectories containsObject:standardized]));
}

#if TARGET_OS_OSX
- (void)restartEventStream
{
  [self stopEventStream];
  if (_watchedDirectories.count == 0) {
    return;
  }

  FSEventStreamContext context = {0, (__bridge void *)self, NULL, NULL, NULL};
  _eventStream = FSEventStreamCreate(NULL,
                                     RNFileSystemWatcherEventsCallback,
                                     &context,
                                     (__bridge CFArrayRef)[_watchedDirectories copy],
                                     kFSEventStreamEventIdSinceNow,
                                     0.2,
                                     kFSEventStreamCreateFlagUseCFTypes |
                                       kFSEventStreamCreateFlagFileEvents |
                                       kFSEventStreamCreateFlagNoDefer);
  if (!_eventStream) {
    return;
  }

  FSEventStreamScheduleWithRunLoop(_eventStream, CFRunLoopGetMain(), kCFRunLoopDefaultMode);
  FSEventStreamStart(_eventStream);
}

- (void)stopEventStream
{
  if (_eventStream) {
    FSEventStreamStop(_eventStream);
    FSEventStreamInvalidate(_eventStream);
    FSEventStreamRelease(_eventStream);
    _eventStream = NULL;
  }
}

- (void)handleEventPath:(NSString *)path flags:(FSEventStreamEventFlags)flags
{
  if (!_hasListeners || path.length == 0) {
    return;
  }

  NSString *standardizedPath = [path stringByStandardizingPath];
  NSString *rootPath = [_watchedDirectories firstObject];
  for (NSString *directory in _watchedDirectories) {
    if ([standardizedPath isEqualToString:directory] || [standardizedPath hasPrefix:[directory stringByAppendingString:@"/"]]) {
      rootPath = directory;
      break;
    }
  }

  NSString *type = @"change";
  if (flags & kFSEventStreamEventFlagItemRemoved) {
    type = @"delete";
  } else if (flags & kFSEventStreamEventFlagItemCreated) {
    type = @"add";
  }

  [self sendEventWithName:@"onDirectoryChanged"
                     body:@{
                       @"path": rootPath ?: @"",
                       @"filePath": standardizedPath,
                       @"type": type,
                     }];
}

static void RNFileSystemWatcherEventsCallback(ConstFSEventStreamRef streamRef,
                                              void *clientCallBackInfo,
                                              size_t numEvents,
                                              void *eventPaths,
                                              const FSEventStreamEventFlags eventFlags[],
                                              const FSEventStreamEventId eventIds[])
{
  RNFileSystemWatcher *watcher = (__bridge RNFileSystemWatcher *)clientCallBackInfo;
  NSArray *paths = (__bridge NSArray *)eventPaths;
  for (NSUInteger index = 0; index < numEvents; index++) {
    id path = paths[index];
    if ([path isKindOfClass:NSString.class]) {
      [watcher handleEventPath:path flags:eventFlags[index]];
    }
  }
}
#endif

@end
