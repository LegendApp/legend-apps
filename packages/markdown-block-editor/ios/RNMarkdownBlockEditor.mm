#import "RNMarkdownBlockEditor.h"

#import <react/renderer/components/RNMarkdownBlockEditorSpec/ComponentDescriptors.h>
#import <react/renderer/components/RNMarkdownBlockEditorSpec/EventEmitters.h>
#import <react/renderer/components/RNMarkdownBlockEditorSpec/Props.h>
#import <react/renderer/components/RNMarkdownBlockEditorSpec/RCTComponentViewHelpers.h>

#import <ReactNativeEnrichedMarkdown/ENRMNativeMarkdownProvider.h>

#include <RNMarkdownParser/MarkdownDocumentRegistry.hpp>

#include <cmath>

using namespace facebook::react;

static SEL setValueSelector()
{
  return NSSelectorFromString(@"setValue:");
}

static SEL focusSelector()
{
  return NSSelectorFromString(@"focus");
}

static SEL setSelectionSelector()
{
  return NSSelectorFromString(@"setSelection:end:");
}

static SEL setSelectionForWindowPointSelector()
{
  return NSSelectorFromString(@"setSelectionForWindowPointX:y:");
}

static SEL setHangingMarkdownPrefixLengthSelector()
{
  return NSSelectorFromString(@"setHangingMarkdownPrefixLength:");
}

static SEL measureSizeSelector()
{
  return NSSelectorFromString(@"measureSize:");
}

static SEL mouseDownSelector()
{
  return @selector(mouseDown:);
}

static NSString *const ENRMMarkdownTextInputContentSizeDidChangeNotification =
  @"ENRMMarkdownTextInputContentSizeDidChangeNotification";

static NSRange hangingPrefixRangeForMarkdown(NSString *markdown)
{
  NSRange prefixRange = NSMakeRange(NSNotFound, 0);

  if (markdown.length > 0) {
    static NSRegularExpression *headingPrefixRegex = nil;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
      headingPrefixRegex = [NSRegularExpression regularExpressionWithPattern:@"^[ \\t]{0,3}#{1,6}[ \\t]+"
                                                                      options:0
                                                                        error:nil];
    });

    NSTextCheckingResult *match = [headingPrefixRegex firstMatchInString:markdown
                                                                 options:0
                                                                   range:NSMakeRange(0, markdown.length)];
    if (match != nil) {
      prefixRange = match.range;
    }
  }

  return prefixRange;
}

static NSInteger hangingPrefixLengthForMarkdown(NSString *markdown)
{
  NSRange prefixRange = hangingPrefixRangeForMarkdown(markdown);
  return prefixRange.location != NSNotFound ? (NSInteger)NSMaxRange(prefixRange) : 0;
}

static void callSetValue(id target, NSString *markdown)
{
  SEL selector = setValueSelector();
  if (![target respondsToSelector:selector]) {
    return;
  }

  void (*send)(id, SEL, NSString *) = (void (*)(id, SEL, NSString *))[target methodForSelector:selector];
  send(target, selector, markdown);
}

static void callFocus(id target)
{
  SEL selector = focusSelector();
  if (![target respondsToSelector:selector]) {
    return;
  }

  void (*send)(id, SEL) = (void (*)(id, SEL))[target methodForSelector:selector];
  send(target, selector);
}

static void callSetSelection(id target, NSInteger start, NSInteger end)
{
  SEL selector = setSelectionSelector();
  if (![target respondsToSelector:selector]) {
    return;
  }

  void (*send)(id, SEL, NSInteger, NSInteger) = (void (*)(id, SEL, NSInteger, NSInteger))[target methodForSelector:selector];
  send(target, selector, start, end);
}

static void callSetSelectionForWindowPoint(id target, NSPoint windowPoint)
{
  SEL selector = setSelectionForWindowPointSelector();
  if ([target respondsToSelector:selector]) {
    void (*send)(id, SEL, CGFloat, CGFloat) = (void (*)(id, SEL, CGFloat, CGFloat))[target methodForSelector:selector];
    send(target, selector, windowPoint.x, windowPoint.y);
  }
}

static void callSetHangingMarkdownPrefixLength(id target, NSInteger prefixLength)
{
  SEL selector = setHangingMarkdownPrefixLengthSelector();
  if ([target respondsToSelector:selector]) {
    void (*send)(id, SEL, NSInteger) = (void (*)(id, SEL, NSInteger))[target methodForSelector:selector];
    send(target, selector, prefixLength);
  }
}

static CGFloat measuredInputHeight(id target, CGFloat width)
{
  SEL selector = measureSizeSelector();
  if (![target respondsToSelector:selector] || width <= 0) {
    return 0;
  }

  CGSize (*send)(id, SEL, CGFloat) = (CGSize (*)(id, SEL, CGFloat))[target methodForSelector:selector];
  CGSize measuredSize = send(target, selector, width);
  return std::isfinite(measuredSize.height) && measuredSize.height > 0 ? ceil(measuredSize.height) : 0;
}

static BOOL isEnrichedMarkdownInput(id view)
{
  return [view respondsToSelector:setValueSelector()] && [view respondsToSelector:mouseDownSelector()];
}

static NSString *nativeMarkdownForBlockId(NSString *blockId)
{
  if (blockId.length == 0) {
    return @"";
  }

  const std::string markdown =
      margelo::nitro::legenddesktop::markdownparser::markdownForRegisteredBlockId(std::string([blockId UTF8String]));
  return [[NSString alloc] initWithBytes:markdown.data()
                                  length:markdown.size()
                                encoding:NSUTF8StringEncoding] ?: @"";
}

struct MarkdownBlockSpacingConfig {
  CGFloat marginTop = 0;
  CGFloat marginBottom = 0;
};

struct MarkdownLayoutSpacingConfig {
  MarkdownBlockSpacingConfig blockquote;
  MarkdownBlockSpacingConfig codeBlock;
  MarkdownBlockSpacingConfig fallback;
  MarkdownBlockSpacingConfig heading[7];
  MarkdownBlockSpacingConfig list;
  MarkdownBlockSpacingConfig paragraph;
  MarkdownBlockSpacingConfig table;
  MarkdownBlockSpacingConfig thematicBreak;
};

static CGFloat numberValueForKey(NSDictionary *dictionary, NSString *key)
{
  id value = dictionary[key];
  return [value respondsToSelector:@selector(doubleValue)] ? (CGFloat)[value doubleValue] : 0;
}

static MarkdownBlockSpacingConfig blockSpacingConfigFromDictionary(id value)
{
  MarkdownBlockSpacingConfig spacing;
  if ([value isKindOfClass:NSDictionary.class]) {
    NSDictionary *dictionary = (NSDictionary *)value;
    spacing.marginTop = numberValueForKey(dictionary, @"marginTop");
    spacing.marginBottom = numberValueForKey(dictionary, @"marginBottom");
  }
  return spacing;
}

static MarkdownLayoutSpacingConfig layoutSpacingConfigFromJson(NSString *json)
{
  MarkdownLayoutSpacingConfig config;
  if (json.length == 0) {
    return config;
  }

  NSData *data = [json dataUsingEncoding:NSUTF8StringEncoding];
  if (data == nil) {
    return config;
  }

  id parsed = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
  if (![parsed isKindOfClass:NSDictionary.class]) {
    return config;
  }

  NSDictionary *root = (NSDictionary *)parsed;
  id blockSpacingValue = root[@"blockSpacing"];
  if (![blockSpacingValue isKindOfClass:NSDictionary.class]) {
    return config;
  }

  NSDictionary *blockSpacing = (NSDictionary *)blockSpacingValue;
  config.blockquote = blockSpacingConfigFromDictionary(blockSpacing[@"blockquote"]);
  config.codeBlock = blockSpacingConfigFromDictionary(blockSpacing[@"codeBlock"]);
  config.fallback = blockSpacingConfigFromDictionary(blockSpacing[@"fallback"]);
  config.list = blockSpacingConfigFromDictionary(blockSpacing[@"list"]);
  config.paragraph = blockSpacingConfigFromDictionary(blockSpacing[@"paragraph"]);
  config.table = blockSpacingConfigFromDictionary(blockSpacing[@"table"]);
  config.thematicBreak = blockSpacingConfigFromDictionary(blockSpacing[@"thematicBreak"]);

  id headingValue = blockSpacing[@"heading"];
  if ([headingValue isKindOfClass:NSDictionary.class]) {
    NSDictionary *heading = (NSDictionary *)headingValue;
    for (NSInteger level = 1; level <= 6; level += 1) {
      config.heading[level] = blockSpacingConfigFromDictionary(heading[[NSString stringWithFormat:@"%ld", (long)level]]);
    }
  }

  return config;
}

static std::string stringForNSString(NSString *value)
{
  return value.length == 0 ? std::string() : std::string([value UTF8String] ?: "");
}

static MarkdownBlockSpacingConfig spacingForBlockMetadata(
    const MarkdownLayoutSpacingConfig& config,
    const margelo::nitro::legenddesktop::markdownparser::RegisteredMarkdownBlockMetadata& metadata)
{
  if (metadata.id.empty()) {
    return config.fallback;
  }

  if (metadata.type == "heading") {
    NSInteger headingLevel = (NSInteger)metadata.headingLevel;
    return headingLevel >= 1 && headingLevel <= 6 ? config.heading[headingLevel] : config.fallback;
  }
  if (metadata.type == "paragraph") {
    return config.paragraph;
  }
  if (metadata.type == "codeBlock") {
    return config.codeBlock;
  }
  if (metadata.type == "quote") {
    return config.blockquote;
  }
  if (metadata.type == "unorderedList" || metadata.type == "orderedList" || metadata.type == "listItem") {
    return config.list;
  }
  if (metadata.type == "thematicBreak") {
    return config.thematicBreak;
  }
  if (
      metadata.type == "table" ||
      metadata.type == "tableHead" ||
      metadata.type == "tableBody" ||
      metadata.type == "tableRow" ||
      metadata.type == "tableHeaderCell" ||
      metadata.type == "tableCell") {
    return config.table;
  }

  return config.fallback;
}

static NSEdgeInsets rowPaddingForBlockIds(
    const MarkdownLayoutSpacingConfig& config,
    NSString *blockId,
    NSString *previousBlockId,
    NSString *nextBlockId)
{
  const auto metadata = margelo::nitro::legenddesktop::markdownparser::metadataForRegisteredBlockId(stringForNSString(blockId));
  const MarkdownBlockSpacingConfig spacing = spacingForBlockMetadata(config, metadata);
  CGFloat paddingTop = 0;
  if (previousBlockId.length > 0) {
    const auto previousMetadata = margelo::nitro::legenddesktop::markdownparser::metadataForRegisteredBlockId(stringForNSString(previousBlockId));
    const MarkdownBlockSpacingConfig previousSpacing = spacingForBlockMetadata(config, previousMetadata);
    paddingTop = MAX(previousSpacing.marginBottom, spacing.marginTop);
  }

  CGFloat paddingBottom = nextBlockId.length > 0 ? 0 : spacing.marginBottom;
  return NSEdgeInsetsMake(MAX(0, paddingTop), 0, MAX(0, paddingBottom), 0);
}

static void registerNativeMarkdownProvider()
{
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    ENRMSetNativeMarkdownProvider(^NSString *(NSString *blockId) {
      return nativeMarkdownForBlockId(blockId);
    });
  });
}

@interface RNMarkdownEditorHost () <RCTMarkdownEditorHostViewProtocol>
@end

@implementation RNMarkdownEditorHost {
  RCTUIView<RCTComponentViewProtocol> *_overlayInput;
  __weak NSView *_overlayInputHomeSuperview;
  NSMapTable<NSString *, RNMarkdownBlockActivationView *> *_activationViews;
  NSString *_activeBlockId;
  NSString *_layoutConfigJson;
  NSString *_lastLoadedBlockId;
  NSString *_lastLoadedMarkdown;
  BOOL _isPositioningOverlay;
  MarkdownLayoutSpacingConfig _layoutSpacingConfig;
  NSScrollView *_observedScrollView;
  id _overlayScrollWheelMonitor;
}

+ (void)load
{
  registerNativeMarkdownProvider();
}

- (instancetype)init
{
  if (self = [super init]) {
    registerNativeMarkdownProvider();
    _props = std::make_shared<const MarkdownEditorHostProps>();
    _activationViews = [NSMapTable strongToWeakObjectsMapTable];
    [self installOverlayScrollWheelMonitorIfNeeded];
  }
  return self;
}

- (void)mountChildComponentView:(RCTUIView<RCTComponentViewProtocol> *)childComponentView
                          index:(NSInteger)index
{
  [super mountChildComponentView:childComponentView index:index];

  if (isEnrichedMarkdownInput(childComponentView)) {
    _overlayInput = childComponentView;
    _overlayInputHomeSuperview = childComponentView.superview;
    _overlayInput.hidden = YES;
    [_overlayInput setPostsFrameChangedNotifications:YES];
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(overlayInputFrameDidChange:)
                                                 name:NSViewFrameDidChangeNotification
                                               object:_overlayInput];
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(overlayInputContentSizeDidChange:)
                                                 name:ENRMMarkdownTextInputContentSizeDidChangeNotification
                                               object:_overlayInput];
  }
}

- (void)unmountChildComponentView:(RCTUIView<RCTComponentViewProtocol> *)childComponentView
                            index:(NSInteger)index
{
  if (childComponentView == _overlayInput) {
    // The overlay input may be reparented next to the active block while editing.
    // RCTViewComponentView asserts that a child is still at its original indexed
    // parent during unmount, so remove this managed overlay child directly.
    [self showActiveBlockContents];
    [[NSNotificationCenter defaultCenter] removeObserver:self
                                                    name:NSViewFrameDidChangeNotification
                                                  object:_overlayInput];
    [[NSNotificationCenter defaultCenter] removeObserver:self
                                                    name:ENRMMarkdownTextInputContentSizeDidChangeNotification
                                                  object:_overlayInput];
    [self stopObservingScrollView];
    [childComponentView removeFromSuperview];
    _overlayInput = nil;
    _overlayInputHomeSuperview = nil;
    _activeBlockId = nil;
    _lastLoadedBlockId = nil;
    _lastLoadedMarkdown = nil;
    _isPositioningOverlay = NO;
    return;
  }

  [super unmountChildComponentView:childComponentView index:index];
}

- (void)dealloc
{
  if (_overlayInput != nil) {
    [[NSNotificationCenter defaultCenter] removeObserver:self
                                                    name:NSViewFrameDidChangeNotification
                                                  object:_overlayInput];
    [[NSNotificationCenter defaultCenter] removeObserver:self
                                                    name:ENRMMarkdownTextInputContentSizeDidChangeNotification
                                                  object:_overlayInput];
  }
  [self stopObservingScrollView];
  if (_overlayScrollWheelMonitor != nil) {
    [NSEvent removeMonitor:_overlayScrollWheelMonitor];
    _overlayScrollWheelMonitor = nil;
  }
}

- (void)registerActivationView:(RNMarkdownBlockActivationView *)view
{
  if (view.blockId.length == 0) {
    return;
  }
  [_activationViews setObject:view forKey:view.blockId];
  if (_activeBlockId != nil && [_activeBlockId isEqualToString:view.blockId]) {
    [self observeScrollViewForBlockView:view];
    [self showOverlayForBlockView:view
                         markdown:_lastLoadedMarkdown ?: [view currentMarkdown]
                            event:nil
                        loadValue:_lastLoadedBlockId == nil || ![_lastLoadedBlockId isEqualToString:view.blockId]];
    [self emitBeginEditingForBlockView:view];
  }
}

- (void)unregisterActivationView:(RNMarkdownBlockActivationView *)view
{
  if (view.blockId.length == 0) {
    return;
  }
  RNMarkdownBlockActivationView *registered = [_activationViews objectForKey:view.blockId];
  if (registered == view) {
    [self setBlockView:view contentsHidden:NO];
    [_activationViews removeObjectForKey:view.blockId];
  }
}

- (nullable RNMarkdownBlockActivationView *)findActivationViewWithBlockId:(NSString *)blockId
                                                                    inView:(NSView *)view
{
  RNMarkdownBlockActivationView *matchedView = nil;
  if ([view isKindOfClass:RNMarkdownBlockActivationView.class]) {
    RNMarkdownBlockActivationView *activationView = (RNMarkdownBlockActivationView *)view;
    if ([activationView.blockId isEqualToString:blockId]) {
      matchedView = activationView;
    }
  }

  if (matchedView == nil) {
    for (NSView *subview in view.subviews) {
      matchedView = [self findActivationViewWithBlockId:blockId inView:subview];
      if (matchedView != nil) {
        break;
      }
    }
  }

  return matchedView;
}

- (nullable RNMarkdownBlockActivationView *)activationViewForBlockId:(NSString *)blockId
{
  if (blockId.length == 0) {
    return nil;
  }

  RNMarkdownBlockActivationView *view = [_activationViews objectForKey:blockId];
  if (view == nil) {
    // Activation views can mount before their blockId prop is applied, so registration
    // may be missing until a programmatic focus change asks for the target block.
    view = [self findActivationViewWithBlockId:blockId inView:self];
    if (view != nil) {
      [_activationViews setObject:view forKey:blockId];
    }
  }
  return view;
}

- (nullable RNMarkdownBlockActivationView *)activeBlockView
{
  if (_activeBlockId.length == 0) {
    return nil;
  }
  return [self activationViewForBlockId:_activeBlockId];
}

- (nullable NSScrollView *)scrollViewForBlockView:(RNMarkdownBlockActivationView *)view
{
  NSView *ancestor = view.superview;
  while (ancestor != nil) {
    if ([ancestor isKindOfClass:NSScrollView.class]) {
      return (NSScrollView *)ancestor;
    }
    ancestor = ancestor.superview;
  }
  return nil;
}

- (void)stopObservingScrollView
{
  if (_observedScrollView == nil) {
    return;
  }
  [[NSNotificationCenter defaultCenter] removeObserver:self
                                                  name:NSViewBoundsDidChangeNotification
                                                object:_observedScrollView.contentView];
  _observedScrollView = nil;
}

- (void)observeScrollViewForBlockView:(RNMarkdownBlockActivationView *)view
{
  NSScrollView *scrollView = [self scrollViewForBlockView:view];
  if (_observedScrollView == scrollView) {
    return;
  }

  [self stopObservingScrollView];
  _observedScrollView = scrollView;
  if (_observedScrollView == nil) {
    return;
  }

  _observedScrollView.contentView.postsBoundsChangedNotifications = YES;
  [[NSNotificationCenter defaultCenter] addObserver:self
                                           selector:@selector(activeScrollViewBoundsDidChange:)
                                               name:NSViewBoundsDidChangeNotification
                                             object:_observedScrollView.contentView];
}

- (BOOL)eventIsInsideOverlayInput:(NSEvent *)event
{
  if (_overlayInput == nil || _overlayInput.hidden || _overlayInput.window == nil || event.window != _overlayInput.window) {
    return NO;
  }

  NSPoint overlayPoint = [_overlayInput convertPoint:event.locationInWindow fromView:nil];
  return NSPointInRect(overlayPoint, _overlayInput.bounds);
}

- (void)installOverlayScrollWheelMonitorIfNeeded
{
  if (_overlayScrollWheelMonitor != nil) {
    return;
  }

  __weak RNMarkdownEditorHost *weakSelf = self;
  _overlayScrollWheelMonitor = [NSEvent addLocalMonitorForEventsMatchingMask:NSEventMaskScrollWheel
                                                                     handler:^NSEvent *_Nullable(NSEvent *event) {
    RNMarkdownEditorHost *strongSelf = weakSelf;
    if (strongSelf == nil || ![strongSelf eventIsInsideOverlayInput:event]) {
      return event;
    }

    RNMarkdownBlockActivationView *view = [strongSelf activeBlockView];
    NSScrollView *scrollView = view == nil ? nil : [strongSelf scrollViewForBlockView:view];
    if (scrollView == nil) {
      return event;
    }

    [scrollView scrollWheel:event];
    [strongSelf positionOverlayForBlockView:view];
    return nil;
  }];
}

- (void)setBlockView:(nullable RNMarkdownBlockActivationView *)view contentsHidden:(BOOL)contentsHidden
{
  if (view == nil) {
    return;
  }
  [view setContentsHidden:contentsHidden];
}

- (NSEdgeInsets)rowPaddingForActivationView:(RNMarkdownBlockActivationView *)view
{
  if (view == nil) {
    return NSEdgeInsetsMake(0, 0, 0, 0);
  }
  return rowPaddingForBlockIds(_layoutSpacingConfig, view.blockId, view.previousBlockId, view.nextBlockId);
}

- (CGFloat)rowHeightForActivationView:(RNMarkdownBlockActivationView *)view contentHeight:(CGFloat)contentHeight
{
  NSEdgeInsets padding = [self rowPaddingForActivationView:view];
  return MAX(0, contentHeight) + MAX(0, padding.top) + MAX(0, padding.bottom);
}

- (void)showActiveBlockContents
{
  [self setBlockView:[self activeBlockView] contentsHidden:NO];
}

- (nullable NSView *)overlaySuperviewForBlockView:(RNMarkdownBlockActivationView *)view
{
  if (view.superview != nil) {
    return view.superview;
  }
  if (_overlayInputHomeSuperview != nil) {
    return _overlayInputHomeSuperview;
  }
  return _overlayInput.superview;
}

- (NSRect)overlayFrameForBlockView:(RNMarkdownBlockActivationView *)view
                       inSuperview:(NSView *)overlaySuperview
{
  if (_overlayInput == nil || overlaySuperview == nil || view.window == nil) {
    return NSZeroRect;
  }

  NSRect frame = [view convertRect:view.contentBounds toView:overlaySuperview];
  if (_lastLoadedBlockId != nil && [_lastLoadedBlockId isEqualToString:view.blockId]) {
    CGFloat measuredHeight = measuredInputHeight(_overlayInput, frame.size.width);
    frame.size.height = measuredHeight > 0 ? measuredHeight : frame.size.height;
  }
  return frame;
}

- (void)positionOverlayForBlockView:(RNMarkdownBlockActivationView *)view
{
  NSView *overlaySuperview = [self overlaySuperviewForBlockView:view];
  if (_overlayInput == nil || overlaySuperview == nil || view.window == nil) {
    return;
  }

  NSRect frame = [self overlayFrameForBlockView:view inSuperview:overlaySuperview];
  if (_overlayInput.superview == overlaySuperview && NSEqualRects(_overlayInput.frame, frame)) {
    return;
  }

  _isPositioningOverlay = YES;
  if (_overlayInput.superview != overlaySuperview) {
    [_overlayInput removeFromSuperview];
  }
  [overlaySuperview addSubview:_overlayInput positioned:NSWindowAbove relativeTo:view];
  _overlayInput.frame = frame;
  _isPositioningOverlay = NO;
}

- (void)emitBeginEditingForBlockView:(RNMarkdownBlockActivationView *)view
{
  auto eventEmitter = std::static_pointer_cast<const MarkdownEditorHostEventEmitter>(_eventEmitter);
  if (!eventEmitter) {
    return;
  }

  NSView *overlaySuperview = [self overlaySuperviewForBlockView:view];
  NSRect frame = overlaySuperview == nil ? NSZeroRect : [self overlayFrameForBlockView:view inSuperview:overlaySuperview];
  eventEmitter->onBeginEditing({
    .blockId = std::string([view.blockId UTF8String] ?: ""),
    .height = frame.size.height,
    .rowHeight = [self rowHeightForActivationView:view contentHeight:frame.size.height],
    .width = frame.size.width,
    .x = frame.origin.x,
    .y = frame.origin.y,
  });
}

- (void)emitEditorFrameChangeForBlockView:(RNMarkdownBlockActivationView *)view
{
  auto eventEmitter = std::static_pointer_cast<const MarkdownEditorHostEventEmitter>(_eventEmitter);
  if (!eventEmitter) {
    return;
  }

  NSView *overlaySuperview = [self overlaySuperviewForBlockView:view];
  NSRect frame = overlaySuperview == nil ? NSZeroRect : [self overlayFrameForBlockView:view inSuperview:overlaySuperview];
  eventEmitter->onEditorFrameChange({
    .blockId = std::string([view.blockId UTF8String] ?: ""),
    .height = frame.size.height,
    .rowHeight = [self rowHeightForActivationView:view contentHeight:frame.size.height],
    .width = frame.size.width,
    .x = frame.origin.x,
    .y = frame.origin.y,
  });
}

- (void)overlayInputFrameDidChange:(NSNotification *)notification
{
  if (_isPositioningOverlay || _overlayInput == nil || _overlayInput.hidden || _activeBlockId.length == 0) {
    return;
  }

  RNMarkdownBlockActivationView *view = [self activeBlockView];
  if (view == nil || _overlayInput.superview == nil) {
    return;
  }

  NSView *overlaySuperview = [self overlaySuperviewForBlockView:view];
  if (overlaySuperview == nil) {
    return;
  }

  NSRect targetFrame = [self overlayFrameForBlockView:view inSuperview:overlaySuperview];
  if (NSEqualRects(_overlayInput.frame, targetFrame)) {
    return;
  }

  [self positionOverlayForBlockView:view];
  [self emitEditorFrameChangeForBlockView:view];
}

- (void)overlayInputContentSizeDidChange:(NSNotification *)notification
{
  if (notification.object != _overlayInput || _overlayInput == nil || _overlayInput.hidden || _activeBlockId.length == 0) {
    return;
  }

  RNMarkdownBlockActivationView *view = [self activeBlockView];
  if (view != nil) {
    [self positionOverlayForBlockView:view];
    [self emitEditorFrameChangeForBlockView:view];
  }
}

- (void)activeScrollViewBoundsDidChange:(NSNotification *)notification
{
  RNMarkdownBlockActivationView *view = [self activeBlockView];
  if (view == nil || _overlayInput == nil || _overlayInput.hidden || _overlayInput.superview == nil) {
    return;
  }

  [self positionOverlayForBlockView:view];
  [self emitEditorFrameChangeForBlockView:view];
}

- (void)activateBlockView:(RNMarkdownBlockActivationView *)view withEvent:(NSEvent *)event
{
  if (view.blockId.length == 0 || _overlayInput == nil) {
    return;
  }

  if (_activeBlockId != nil && ![_activeBlockId isEqualToString:view.blockId]) {
    [self showActiveBlockContents];
  }

  _activeBlockId = [view.blockId copy];
  [self setBlockView:view contentsHidden:YES];
  [self observeScrollViewForBlockView:view];
  [self showOverlayForBlockView:view markdown:[view currentMarkdown] event:event loadValue:YES];
  [self emitBeginEditingForBlockView:view];
  [self emitEditorFrameChangeForBlockView:view];
}

- (void)showOverlayForBlockView:(RNMarkdownBlockActivationView *)view
                       markdown:(NSString *)markdown
                          event:(nullable NSEvent *)event
                      loadValue:(BOOL)loadValue
{
  if (_overlayInput == nil || _overlayInput.superview == nil || view.window == nil) {
    return;
  }

  NSView *overlaySuperview = [self overlaySuperviewForBlockView:view];
  if (overlaySuperview == nil) {
    return;
  }

  if (loadValue) {
    callSetValue(_overlayInput, markdown ?: @"");
    _lastLoadedBlockId = [view.blockId copy];
    _lastLoadedMarkdown = [markdown copy];
  }

  [self setBlockView:view contentsHidden:YES];
  [self positionOverlayForBlockView:view];
  callSetHangingMarkdownPrefixLength(_overlayInput, hangingPrefixLengthForMarkdown(markdown ?: @""));
  _overlayInput.hidden = NO;

  callFocus(_overlayInput);
  if (event != nil) {
    NSPoint selectionPoint = event.locationInWindow;
    NSPoint localPoint = [view convertPoint:selectionPoint fromView:nil];
    NSRect contentBounds = view.contentBounds;
    if (NSHeight(contentBounds) > 0) {
      localPoint.y = MIN(MAX(localPoint.y, NSMinY(contentBounds)), NSMaxY(contentBounds));
      selectionPoint = [view convertPoint:localPoint toView:nil];
    }
    callSetSelectionForWindowPoint(_overlayInput, selectionPoint);
  }
}

- (void)hideOverlay
{
  _overlayInput.hidden = YES;
  if (_overlayInput != nil && _overlayInputHomeSuperview != nil && _overlayInput.superview != _overlayInputHomeSuperview) {
    [_overlayInput removeFromSuperview];
    [_overlayInputHomeSuperview addSubview:_overlayInput positioned:NSWindowAbove relativeTo:nil];
  }
  [self stopObservingScrollView];
  _lastLoadedBlockId = nil;
  _lastLoadedMarkdown = nil;
  _activeBlockId = nil;
}

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps
{
  const auto &oldViewProps = *std::static_pointer_cast<MarkdownEditorHostProps const>(_props);
  const auto &newViewProps = *std::static_pointer_cast<MarkdownEditorHostProps const>(props);

  NSString *nextLayoutConfigJson = [NSString stringWithUTF8String:newViewProps.markdownLayoutConfigJson.c_str()];
  if (_layoutConfigJson == nil || ![_layoutConfigJson isEqualToString:nextLayoutConfigJson]) {
    _layoutConfigJson = [nextLayoutConfigJson copy];
    _layoutSpacingConfig = layoutSpacingConfigFromJson(_layoutConfigJson);
  }

  NSString *nextActiveBlockId = [NSString stringWithUTF8String:newViewProps.activeBlockId.c_str()];
  if (nextActiveBlockId.length == 0) {
    if (_activeBlockId != nil) {
      [self hideOverlay];
    }
  } else if (_activeBlockId == nil || ![_activeBlockId isEqualToString:nextActiveBlockId]) {
    RNMarkdownBlockActivationView *view = [self activationViewForBlockId:nextActiveBlockId];
    if (view != nil) {
      NSString *markdown = [view currentMarkdown];
      [self showActiveBlockContents];
      _activeBlockId = [nextActiveBlockId copy];
      [self setBlockView:view contentsHidden:YES];
      [self observeScrollViewForBlockView:view];
      [self showOverlayForBlockView:view markdown:markdown event:nil loadValue:YES];
      [self emitBeginEditingForBlockView:view];
      [self emitEditorFrameChangeForBlockView:view];
    } else {
      _activeBlockId = [nextActiveBlockId copy];
      _lastLoadedBlockId = nil;
      _lastLoadedMarkdown = nativeMarkdownForBlockId(nextActiveBlockId);
      [self stopObservingScrollView];
    }
  }

  if (oldViewProps.activeBlockId != newViewProps.activeBlockId && nextActiveBlockId.length == 0) {
    [self hideOverlay];
  }

  if (oldViewProps.markdownLayoutConfigJson != newViewProps.markdownLayoutConfigJson && _activeBlockId != nil) {
    RNMarkdownBlockActivationView *view = [self activeBlockView];
    if (view != nil && _overlayInput != nil && _overlayInput.superview != nil) {
      [self positionOverlayForBlockView:view];
      [self emitEditorFrameChangeForBlockView:view];
    }
  }

  [super updateProps:props oldProps:oldProps];
}

- (void)updateLayoutMetrics:(const LayoutMetrics &)layoutMetrics
           oldLayoutMetrics:(const LayoutMetrics &)oldLayoutMetrics
{
  [super updateLayoutMetrics:layoutMetrics oldLayoutMetrics:oldLayoutMetrics];

  if (_activeBlockId != nil) {
    RNMarkdownBlockActivationView *view = [self activeBlockView];
    if (view != nil && _overlayInput != nil && _overlayInput.superview != nil) {
      [self positionOverlayForBlockView:view];
      [self emitEditorFrameChangeForBlockView:view];
    }
  }
}

- (void)prepareForRecycle
{
  [super prepareForRecycle];
  for (RNMarkdownBlockActivationView *view in _activationViews.objectEnumerator) {
    [self setBlockView:view contentsHidden:NO];
  }
  [_activationViews removeAllObjects];
  [self stopObservingScrollView];
  _overlayInput = nil;
  _overlayInputHomeSuperview = nil;
  _activeBlockId = nil;
  _layoutConfigJson = nil;
  _lastLoadedBlockId = nil;
  _lastLoadedMarkdown = nil;
  _isPositioningOverlay = NO;
  _layoutSpacingConfig = MarkdownLayoutSpacingConfig();
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<MarkdownEditorHostComponentDescriptor>();
}

@end

@interface RNMarkdownBlockActivationView () <RCTMarkdownBlockActivationViewViewProtocol>
@end

@implementation RNMarkdownBlockActivationView {
  NSString *_registeredBlockId;
  BOOL _contentsHidden;
}

- (instancetype)init
{
  if (self = [super init]) {
    registerNativeMarkdownProvider();
    _props = std::make_shared<const MarkdownBlockActivationViewProps>();
    _blockId = @"";
    _contentsHidden = NO;
    _nextBlockId = @"";
    _previousBlockId = @"";
  }
  return self;
}

- (NSRect)contentBounds
{
  NSRect bounds = self.bounds;
  RNMarkdownEditorHost *host = [self editorHost];
  NSEdgeInsets padding = host == nil ? NSEdgeInsetsMake(0, 0, 0, 0) : [host rowPaddingForActivationView:self];
  CGFloat topPadding = MAX(0, padding.top);
  CGFloat bottomPadding = MAX(0, padding.bottom);
  CGFloat verticalPadding = MIN(NSHeight(bounds), topPadding + bottomPadding);
  NSRect contentBounds = bounds;
  contentBounds.size.height = MAX(0, NSHeight(bounds) - verticalPadding);
  contentBounds.origin.y += self.isFlipped ? topPadding : bottomPadding;
  return contentBounds;
}

- (void)resetCursorRects
{
  [super resetCursorRects];
  [self addCursorRect:self.bounds cursor:NSCursor.IBeamCursor];
}

- (void)applyContentsHidden
{
  for (NSView *subview in self.subviews) {
    subview.hidden = _contentsHidden;
  }
}

- (void)setContentsHidden:(BOOL)contentsHidden
{
  if (_contentsHidden == contentsHidden) {
    return;
  }
  _contentsHidden = contentsHidden;
  [self applyContentsHidden];
}

- (NSString *)currentMarkdown
{
  if (_blockId.length == 0) {
    return @"";
  }

  return nativeMarkdownForBlockId(_blockId);
}

- (void)mountChildComponentView:(RCTUIView<RCTComponentViewProtocol> *)childComponentView
                          index:(NSInteger)index
{
  [super mountChildComponentView:childComponentView index:index];
  childComponentView.hidden = _contentsHidden;
}

- (nullable RNMarkdownEditorHost *)editorHost
{
  NSView *view = self.superview;
  while (view != nil) {
    if ([view isKindOfClass:RNMarkdownEditorHost.class]) {
      return (RNMarkdownEditorHost *)view;
    }
    view = view.superview;
  }
  return nil;
}

- (void)registerWithHostIfNeeded
{
  RNMarkdownEditorHost *host = [self editorHost];
  if (host == nil || self.blockId.length == 0) {
    return;
  }
  [host registerActivationView:self];
  _registeredBlockId = [self.blockId copy];
}

- (void)unregisterFromHost
{
  RNMarkdownEditorHost *host = [self editorHost];
  if (host != nil && _registeredBlockId.length > 0) {
    NSString *currentBlockId = self.blockId;
    self.blockId = _registeredBlockId;
    [host unregisterActivationView:self];
    self.blockId = currentBlockId;
  }
  _registeredBlockId = nil;
}

- (void)viewWillMoveToSuperview:(nullable NSView *)newSuperview
{
  [super viewWillMoveToSuperview:newSuperview];
  if (newSuperview == nil) {
    [self unregisterFromHost];
  }
}

- (void)viewDidMoveToSuperview
{
  [super viewDidMoveToSuperview];
  [self registerWithHostIfNeeded];
}

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps
{
  const auto &newViewProps = *std::static_pointer_cast<MarkdownBlockActivationViewProps const>(props);

  NSString *nextBlockId = [NSString stringWithUTF8String:newViewProps.blockId.c_str()];
  if (![_blockId isEqualToString:nextBlockId]) {
    [self setContentsHidden:NO];
    [self unregisterFromHost];
    _blockId = [nextBlockId copy];
    [self registerWithHostIfNeeded];
  }
  self.nextBlockId = [NSString stringWithUTF8String:newViewProps.nextBlockId.c_str()];
  self.previousBlockId = [NSString stringWithUTF8String:newViewProps.previousBlockId.c_str()];
  [self setContentsHidden:newViewProps.contentsHidden];

  [super updateProps:props oldProps:oldProps];

}

- (void)mouseDown:(NSEvent *)event
{
  RNMarkdownEditorHost *host = [self editorHost];
  if (host == nil) {
    [super mouseDown:event];
    return;
  }

  [host activateBlockView:self withEvent:event];
}

- (nullable NSView *)hitTest:(NSPoint)point
{
  NSView *hitView = [super hitTest:point];
  return hitView == nil ? nil : self;
}

- (void)prepareForRecycle
{
  [self unregisterFromHost];
  [super prepareForRecycle];
  [self setContentsHidden:NO];
  _blockId = @"";
  _nextBlockId = @"";
  _previousBlockId = @"";
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<MarkdownBlockActivationViewComponentDescriptor>();
}

@end
