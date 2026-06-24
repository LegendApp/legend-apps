#import "RNDragDrop.h"

#import <react/renderer/components/RNDragDropSpec/ComponentDescriptors.h>
#import <react/renderer/components/RNDragDropSpec/EventEmitters.h>
#import <react/renderer/components/RNDragDropSpec/Props.h>
#import <react/renderer/components/RNDragDropSpec/RCTComponentViewHelpers.h>

using namespace facebook::react;

#if TARGET_OS_OSX
static NSPasteboardType const RNDragDropTrackPasteboardType = @"app.legend.desktop.tracks";

static NSArray<NSString *> *RNDragDropDefaultAudioExtensions(void)
{
  return @[@"mp3", @"wav", @"m4a", @"aac", @"flac", @"aif", @"aiff", @"aifc", @"caf"];
}

static std::vector<std::string> RNDragDropStringVector(NSArray<NSString *> *strings)
{
  std::vector<std::string> result;
  for (NSString *value in strings) {
    if ([value isKindOfClass:NSString.class]) {
      result.push_back(value.UTF8String ?: "");
    }
  }
  return result;
}

static NSString *RNDragDropTracksJSONFromPasteboard(NSPasteboard *pasteboard)
{
  NSData *trackData = [pasteboard dataForType:RNDragDropTrackPasteboardType];
  NSString *tracksJson = @"";
  if (trackData) {
    NSString *rawValue = [[NSString alloc] initWithData:trackData encoding:NSUTF8StringEncoding];
    if (rawValue.length > 0) {
      tracksJson = rawValue;
    }
  }
  return tracksJson;
}

struct RNDragDropFilePayload {
  NSMutableArray<NSString *> *directories;
  NSMutableArray<NSString *> *files;
  NSMutableArray<NSString *> *urls;
};
#endif

@interface RNDragDropView () <RCTDragDropViewViewProtocol>
@end

@interface RNTrackDragSource () <RCTTrackDragSourceViewProtocol>
@end

@implementation RNDragDropView {
#if TARGET_OS_OSX
  NSArray<NSString *> *_allowedFileTypes;
  NSString *_currentTrackPayloadJson;
  BOOL _isDragOver;
  BOOL _currentDragIsTrack;
#endif
}

- (instancetype)init
{
  if (self = [super init]) {
    _props = std::make_shared<const DragDropViewProps>();
#if TARGET_OS_OSX
    _allowedFileTypes = RNDragDropDefaultAudioExtensions();
    [self registerForDraggedTypes:@[NSPasteboardTypeFileURL, NSPasteboardTypeString, NSPasteboardTypeURL, RNDragDropTrackPasteboardType]];
#endif
  }
  return self;
}

#if TARGET_OS_OSX
- (BOOL)isFlipped
{
  return YES;
}

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps
{
  const auto &newProps = *std::static_pointer_cast<DragDropViewProps const>(props);
  NSMutableArray<NSString *> *allowed = [NSMutableArray array];
  for (const auto &extension : newProps.allowedFileTypes) {
    NSString *value = [NSString stringWithUTF8String:extension.c_str()];
    if (value.length > 0) {
      [allowed addObject:value.lowercaseString];
    }
  }
  _allowedFileTypes = allowed.count > 0 ? allowed : RNDragDropDefaultAudioExtensions();
  [super updateProps:props oldProps:oldProps];
}

- (void)addURLString:(NSString *)urlString toPayload:(RNDragDropFilePayload *)payload
{
  if (urlString.length > 0 && ![payload->urls containsObject:urlString]) {
    [payload->urls addObject:urlString];
  }
}

- (void)addPasteboardStringURLs:(NSPasteboard *)pasteboard toPayload:(RNDragDropFilePayload *)payload
{
  NSString *stringValue = [pasteboard stringForType:NSPasteboardTypeString];
  if (stringValue.length > 0) {
    NSArray<NSString *> *parts = [stringValue componentsSeparatedByCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
    for (NSString *part in parts) {
      NSURL *url = [NSURL URLWithString:part];
      if (url && (url.scheme.length > 0 || url.host.length > 0)) {
        [self addURLString:url.absoluteString toPayload:payload];
      }
    }
  }
}

- (RNDragDropFilePayload)filePayloadFromPasteboard:(NSPasteboard *)pasteboard
{
  RNDragDropFilePayload payload;
  payload.directories = [NSMutableArray array];
  payload.files = [NSMutableArray array];
  payload.urls = [NSMutableArray array];
  NSSet<NSString *> *extensions = [NSSet setWithArray:_allowedFileTypes ?: RNDragDropDefaultAudioExtensions()];
  NSArray<NSURL *> *urls = [pasteboard readObjectsForClasses:@[NSURL.class] options:nil] ?: @[];

  for (NSURL *url in urls) {
    if (url.fileURL) {
      NSNumber *isDirectory = nil;
      [url getResourceValue:&isDirectory forKey:NSURLIsDirectoryKey error:nil];
      if (isDirectory.boolValue) {
        [payload.directories addObject:url.path];
      } else if ([extensions containsObject:url.pathExtension.lowercaseString]) {
        [payload.files addObject:url.path];
      }
    } else {
      [self addURLString:url.absoluteString toPayload:&payload];
    }
  }
  [self addPasteboardStringURLs:pasteboard toPayload:&payload];
  return payload;
}

- (CGPoint)clampedLocationFromDraggingInfo:(id<NSDraggingInfo>)sender
{
  NSPoint location = [self convertPoint:sender.draggingLocation fromView:nil];
  return CGPointMake(MAX(0, MIN(location.x, self.bounds.size.width)), MAX(0, MIN(location.y, self.bounds.size.height)));
}

- (NSDragOperation)draggingEntered:(id<NSDraggingInfo>)sender
{
  const auto eventEmitter = std::static_pointer_cast<const DragDropViewEventEmitter>(_eventEmitter);
  NSPasteboard *pasteboard = sender.draggingPasteboard;
  NSString *tracksJson = RNDragDropTracksJSONFromPasteboard(pasteboard);
  if (tracksJson.length > 0) {
    _isDragOver = YES;
    _currentDragIsTrack = YES;
    _currentTrackPayloadJson = tracksJson;
    if (eventEmitter) {
      eventEmitter->onTrackDragEnter(DragDropViewEventEmitter::OnTrackDragEnter{.tracksJson = tracksJson.UTF8String ?: ""});
    }
    return NSDragOperationCopy;
  }

  RNDragDropFilePayload payload = [self filePayloadFromPasteboard:pasteboard];
  if (payload.files.count == 0 && payload.directories.count == 0 && payload.urls.count == 0) {
    return NSDragOperationNone;
  }

  _isDragOver = YES;
  _currentDragIsTrack = NO;
  _currentTrackPayloadJson = @"";
  if (eventEmitter) {
    eventEmitter->onDragEnter(DragDropViewEventEmitter::OnDragEnter{
      .directories = RNDragDropStringVector(payload.directories),
      .files = RNDragDropStringVector(payload.files),
      .urls = RNDragDropStringVector(payload.urls),
    });
  }
  return NSDragOperationCopy;
}

- (void)draggingExited:(id<NSDraggingInfo>)sender
{
  const auto eventEmitter = std::static_pointer_cast<const DragDropViewEventEmitter>(_eventEmitter);
  if (eventEmitter) {
    if (_currentDragIsTrack) {
      eventEmitter->onTrackDragLeave({});
    } else {
      eventEmitter->onDragLeave({});
    }
  }
  _isDragOver = NO;
  _currentDragIsTrack = NO;
  _currentTrackPayloadJson = @"";
}

- (NSDragOperation)draggingUpdated:(id<NSDraggingInfo>)sender
{
  if (_currentDragIsTrack) {
    const auto eventEmitter = std::static_pointer_cast<const DragDropViewEventEmitter>(_eventEmitter);
    if (eventEmitter) {
      CGPoint location = [self clampedLocationFromDraggingInfo:sender];
      eventEmitter->onTrackDragHover(DragDropViewEventEmitter::OnTrackDragHover{
        .tracksJson = (_currentTrackPayloadJson ?: @"").UTF8String ?: "",
        .x = location.x,
        .y = location.y,
      });
    }
  }
  return _isDragOver ? NSDragOperationCopy : NSDragOperationNone;
}

- (BOOL)performDragOperation:(id<NSDraggingInfo>)sender
{
  const auto eventEmitter = std::static_pointer_cast<const DragDropViewEventEmitter>(_eventEmitter);
  NSPasteboard *pasteboard = sender.draggingPasteboard;

  if (_currentDragIsTrack) {
    NSString *tracksJson = RNDragDropTracksJSONFromPasteboard(pasteboard);
    CGPoint location = [self clampedLocationFromDraggingInfo:sender];
    if (eventEmitter && tracksJson.length > 0) {
      eventEmitter->onTrackDrop(DragDropViewEventEmitter::OnTrackDrop{
        .tracksJson = tracksJson.UTF8String ?: "",
        .x = location.x,
        .y = location.y,
      });
    }
    _isDragOver = NO;
    _currentDragIsTrack = NO;
    _currentTrackPayloadJson = @"";
    return tracksJson.length > 0;
  }

  RNDragDropFilePayload payload = [self filePayloadFromPasteboard:pasteboard];
  BOOL hasPayload = payload.files.count > 0 || payload.directories.count > 0 || payload.urls.count > 0;
  if (eventEmitter && hasPayload) {
    eventEmitter->onDrop(DragDropViewEventEmitter::OnDrop{
      .directories = RNDragDropStringVector(payload.directories),
      .files = RNDragDropStringVector(payload.files),
      .urls = RNDragDropStringVector(payload.urls),
    });
  }
  _isDragOver = NO;
  _currentDragIsTrack = NO;
  _currentTrackPayloadJson = @"";
  return hasPayload;
}

- (void)concludeDragOperation:(id<NSDraggingInfo>)sender
{
  _isDragOver = NO;
  _currentDragIsTrack = NO;
  _currentTrackPayloadJson = @"";
}
#endif

- (void)prepareForRecycle
{
  [super prepareForRecycle];
#if TARGET_OS_OSX
  _allowedFileTypes = RNDragDropDefaultAudioExtensions();
  _currentTrackPayloadJson = @"";
  _isDragOver = NO;
  _currentDragIsTrack = NO;
#endif
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<DragDropViewComponentDescriptor>();
}

@end

@implementation RNTrackDragSource {
#if TARGET_OS_OSX
  NSString *_trackPayloadJson;
  NSPoint _initialMouseDownLocation;
  NSTimeInterval _mouseDownTimestamp;
  BOOL _hasMouseDown;
  BOOL _isDragging;
#endif
}

- (instancetype)init
{
  if (self = [super init]) {
    _props = std::make_shared<const TrackDragSourceProps>();
#if TARGET_OS_OSX
    self.wantsLayer = YES;
#endif
  }
  return self;
}

#if TARGET_OS_OSX
- (BOOL)isFlipped
{
  return YES;
}

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps
{
  const auto &newProps = *std::static_pointer_cast<TrackDragSourceProps const>(props);
  _trackPayloadJson = [NSString stringWithUTF8String:newProps.trackPayloadJson.c_str()];
  [super updateProps:props oldProps:oldProps];
}

- (void)mouseDown:(NSEvent *)event
{
  _initialMouseDownLocation = [self convertPoint:event.locationInWindow fromView:nil];
  _mouseDownTimestamp = event.timestamp;
  _hasMouseDown = YES;
  [super mouseDown:event];
}

- (void)mouseDragged:(NSEvent *)event
{
  [super mouseDragged:event];
  if (_isDragging || !_hasMouseDown || _trackPayloadJson.length == 0) {
    return;
  }

  NSPoint current = [self convertPoint:event.locationInWindow fromView:nil];
  CGFloat distance = hypot(current.x - _initialMouseDownLocation.x, current.y - _initialMouseDownLocation.y);
  NSTimeInterval elapsed = event.timestamp - _mouseDownTimestamp;
  if (distance < 8 || elapsed < 0.12) {
    return;
  }

  _isDragging = YES;
  const auto eventEmitter = std::static_pointer_cast<const TrackDragSourceEventEmitter>(_eventEmitter);
  if (eventEmitter) {
    eventEmitter->onDragStart({});
  }
  [self beginDragSessionWithEvent:event];
}

- (void)mouseUp:(NSEvent *)event
{
  [super mouseUp:event];
  _isDragging = NO;
  _hasMouseDown = NO;
}

- (void)beginDragSessionWithEvent:(NSEvent *)event
{
  NSData *data = [_trackPayloadJson dataUsingEncoding:NSUTF8StringEncoding];
  if (!data) {
    _isDragging = NO;
    return;
  }

  NSPasteboardItem *pasteboardItem = [NSPasteboardItem new];
  [pasteboardItem setData:data forType:RNDragDropTrackPasteboardType];
  NSDraggingItem *draggingItem = [[NSDraggingItem alloc] initWithPasteboardWriter:pasteboardItem];
  [draggingItem setDraggingFrame:self.bounds contents:[self snapshotImage]];
  [self beginDraggingSessionWithItems:@[draggingItem] event:event source:(id<NSDraggingSource>)self];
}

- (NSImage *)snapshotImage
{
  if (self.bounds.size.width <= 0 || self.bounds.size.height <= 0) {
    return [[NSImage alloc] initWithSize:NSMakeSize(120, 40)];
  }
  NSBitmapImageRep *rep = [self bitmapImageRepForCachingDisplayInRect:self.bounds];
  [self cacheDisplayInRect:self.bounds toBitmapImageRep:rep];
  NSImage *image = [[NSImage alloc] initWithSize:self.bounds.size];
  [image addRepresentation:rep];
  return image;
}

- (NSDragOperation)draggingSession:(NSDraggingSession *)session sourceOperationMaskForDraggingContext:(NSDraggingContext)context
{
  return NSDragOperationCopy;
}

- (void)draggingSession:(NSDraggingSession *)session endedAtPoint:(NSPoint)screenPoint operation:(NSDragOperation)operation
{
  _isDragging = NO;
  _hasMouseDown = NO;
}

- (BOOL)ignoreModifierKeysForDraggingSession:(NSDraggingSession *)session
{
  return YES;
}
#endif

- (void)prepareForRecycle
{
  [super prepareForRecycle];
#if TARGET_OS_OSX
  _trackPayloadJson = @"";
  _isDragging = NO;
  _hasMouseDown = NO;
#endif
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<TrackDragSourceComponentDescriptor>();
}

@end
