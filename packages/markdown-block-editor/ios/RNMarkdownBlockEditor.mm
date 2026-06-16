#import "RNMarkdownBlockEditor.h"

#import <react/renderer/components/RNMarkdownBlockEditorSpec/ComponentDescriptors.h>
#import <react/renderer/components/RNMarkdownBlockEditorSpec/EventEmitters.h>
#import <react/renderer/components/RNMarkdownBlockEditorSpec/Props.h>
#import <react/renderer/components/RNMarkdownBlockEditorSpec/RCTComponentViewHelpers.h>

#include <cmath>

using namespace facebook::react;

static SEL setValueSelector()
{
  return NSSelectorFromString(@"setValue:");
}

static SEL setValuePreservingSelectionSelector()
{
  return NSSelectorFromString(@"setValuePreservingSelection:");
}

static SEL focusSelector()
{
  return NSSelectorFromString(@"focus");
}

static SEL setSelectionSelector()
{
  return NSSelectorFromString(@"setSelection:end:");
}

static SEL measureSizeSelector()
{
  return NSSelectorFromString(@"measureSize:");
}

static NSString *const ENRMMarkdownTextInputContentSizeDidChangeNotification =
  @"ENRMMarkdownTextInputContentSizeDidChangeNotification";

static NSString *blockStyleKeyForMarkdown(NSString *markdown)
{
  NSString *trimmedMarkdown = [markdown stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
  if ([trimmedMarkdown hasPrefix:@"```"] || [trimmedMarkdown hasPrefix:@"~~~"]) {
    return @"codeBlock";
  }

  NSUInteger headingLevel = 0;
  while (headingLevel < trimmedMarkdown.length && headingLevel < 6 && [trimmedMarkdown characterAtIndex:headingLevel] == '#') {
    headingLevel += 1;
  }
  if (
    headingLevel > 0 &&
    headingLevel < trimmedMarkdown.length &&
    [[NSCharacterSet whitespaceCharacterSet] characterIsMember:[trimmedMarkdown characterAtIndex:headingLevel]]
  ) {
    return [NSString stringWithFormat:@"h%lu", (unsigned long)headingLevel];
  }

  return @"paragraph";
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

static void callSetValuePreservingSelection(id target, NSString *markdown)
{
  SEL selector = setValuePreservingSelectionSelector();
  if (![target respondsToSelector:selector]) {
    callSetValue(target, markdown);
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

static NSInteger estimateSelectionForMarkdownPoint(NSString *markdown, NSPoint point, CGFloat width)
{
  if (markdown.length == 0) {
    return 0;
  }

  CGFloat lineHeight = 25;
  CGFloat averageCharacterWidth = 8;
  NSInteger visualLine = MAX(0, (NSInteger)floor(MAX((CGFloat)0, point.y) / lineHeight));
  NSInteger characterInVisualLine = MAX(0, (NSInteger)floor(MAX((CGFloat)0, point.x) / averageCharacterWidth));
  NSInteger charactersPerLine = MAX(20, (NSInteger)floor(MAX((CGFloat)1, width) / averageCharacterWidth));
  NSArray<NSString *> *lines = [markdown componentsSeparatedByString:@"\n"];
  NSInteger offset = 0;
  NSInteger currentVisualLine = 0;

  for (NSString *line in lines) {
    NSInteger lineLength = (NSInteger)line.length;
    NSInteger wrappedLineCount = MAX(1, (NSInteger)ceil((CGFloat)MAX(1, lineLength) / (CGFloat)charactersPerLine));
    if (visualLine < currentVisualLine + wrappedLineCount) {
      NSInteger wrappedLine = visualLine - currentVisualLine;
      NSInteger selection = offset + MIN(lineLength, wrappedLine * charactersPerLine + characterInVisualLine);
      return MIN((NSInteger)markdown.length, MAX(0, selection));
    }

    offset += lineLength + 1;
    currentVisualLine += wrappedLineCount;
  }

  return (NSInteger)markdown.length;
}

static BOOL isEnrichedMarkdownInput(id view)
{
  return [view respondsToSelector:setValueSelector()] && [view respondsToSelector:@selector(mouseDown:)];
}

@interface RNMarkdownEditorHost () <RCTMarkdownEditorHostViewProtocol>
@end

@implementation RNMarkdownEditorHost {
  RCTUIView<RCTComponentViewProtocol> *_overlayInput;
  __weak NSView *_overlayInputHomeSuperview;
  NSMapTable<NSString *, RNMarkdownBlockActivationView *> *_activationViews;
  NSString *_activeBlockId;
  NSString *_lastLoadedBlockId;
  BOOL _isPositioningOverlay;
  NSScrollView *_observedScrollView;
  id _overlayScrollWheelMonitor;
}

- (instancetype)init
{
  if (self = [super init]) {
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
    [[NSNotificationCenter defaultCenter] removeObserver:self
                                                    name:NSViewFrameDidChangeNotification
                                                  object:_overlayInput];
    [[NSNotificationCenter defaultCenter] removeObserver:self
                                                    name:ENRMMarkdownTextInputContentSizeDidChangeNotification
                                                  object:_overlayInput];
    _overlayInput = nil;
    _overlayInputHomeSuperview = nil;
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
    [self showOverlayForBlockView:view markdown:view.markdown event:nil loadValue:_lastLoadedBlockId == nil || ![_lastLoadedBlockId isEqualToString:view.blockId]];
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

  NSRect frame = [view convertRect:view.bounds toView:overlaySuperview];
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
}

- (void)overlayInputContentSizeDidChange:(NSNotification *)notification
{
  if (notification.object != _overlayInput || _overlayInput == nil || _overlayInput.hidden || _activeBlockId.length == 0) {
    return;
  }

  RNMarkdownBlockActivationView *view = [self activeBlockView];
  if (view != nil) {
    [self positionOverlayForBlockView:view];
    [self emitBeginEditingForBlockView:view];
  }
}

- (void)activeScrollViewBoundsDidChange:(NSNotification *)notification
{
  RNMarkdownBlockActivationView *view = [self activeBlockView];
  if (view == nil || _overlayInput == nil || _overlayInput.hidden || _overlayInput.superview == nil) {
    return;
  }

  [self positionOverlayForBlockView:view];
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
  [self showOverlayForBlockView:view markdown:view.markdown event:event loadValue:YES];
  [self emitBeginEditingForBlockView:view];
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

  [self setBlockView:view contentsHidden:YES];
  [self positionOverlayForBlockView:view];
  _overlayInput.hidden = NO;
  [overlaySuperview addSubview:_overlayInput positioned:NSWindowAbove relativeTo:view];

  if (loadValue) {
    callSetValue(_overlayInput, markdown ?: @"");
    _lastLoadedBlockId = [view.blockId copy];
  }

  callFocus(_overlayInput);
  if (event != nil) {
    NSPoint point = [view convertPoint:event.locationInWindow fromView:nil];
    if (!view.isFlipped) {
      point.y = NSHeight(view.bounds) - point.y;
    }
    NSInteger selection = estimateSelectionForMarkdownPoint(markdown ?: @"", point, _overlayInput.frame.size.width);
    callSetSelection(_overlayInput, selection, selection);
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
  _activeBlockId = nil;
}

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps
{
  const auto &oldViewProps = *std::static_pointer_cast<MarkdownEditorHostProps const>(_props);
  const auto &newViewProps = *std::static_pointer_cast<MarkdownEditorHostProps const>(props);

  NSString *nextActiveBlockId = [NSString stringWithUTF8String:newViewProps.activeBlockId.c_str()];
  NSString *nextActiveMarkdown = [NSString stringWithUTF8String:newViewProps.activeMarkdown.c_str()];
  if (nextActiveBlockId.length == 0) {
    if (_activeBlockId != nil) {
      [self hideOverlay];
    }
  } else if (_activeBlockId == nil || ![_activeBlockId isEqualToString:nextActiveBlockId]) {
    RNMarkdownBlockActivationView *view = [self activationViewForBlockId:nextActiveBlockId];
    if (view != nil) {
      NSString *markdown = nextActiveMarkdown;
      [self showActiveBlockContents];
      _activeBlockId = [nextActiveBlockId copy];
      [self setBlockView:view contentsHidden:YES];
      [self observeScrollViewForBlockView:view];
      [self showOverlayForBlockView:view markdown:markdown event:nil loadValue:YES];
      [self emitBeginEditingForBlockView:view];
    } else {
      _activeBlockId = [nextActiveBlockId copy];
      _lastLoadedBlockId = nil;
      [self stopObservingScrollView];
    }
  } else {
    NSString *oldStyleKey = blockStyleKeyForMarkdown([NSString stringWithUTF8String:oldViewProps.activeMarkdown.c_str()]);
    NSString *newStyleKey = blockStyleKeyForMarkdown(nextActiveMarkdown);
    if (![oldStyleKey isEqualToString:newStyleKey]) {
      callSetValuePreservingSelection(_overlayInput, nextActiveMarkdown ?: @"");
      _lastLoadedBlockId = [nextActiveBlockId copy];
      RNMarkdownBlockActivationView *view = [self activeBlockView];
      if (view != nil) {
        [self positionOverlayForBlockView:view];
        [self emitBeginEditingForBlockView:view];
      }
    }
  }

  if (oldViewProps.activeBlockId != newViewProps.activeBlockId && nextActiveBlockId.length == 0) {
    [self hideOverlay];
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
  _lastLoadedBlockId = nil;
  _isPositioningOverlay = NO;
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
    _props = std::make_shared<const MarkdownBlockActivationViewProps>();
    _blockId = @"";
    _markdown = @"";
    _contentsHidden = NO;
  }
  return self;
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
  NSString *nextMarkdown = [NSString stringWithUTF8String:newViewProps.markdown.c_str()];
  if (![_blockId isEqualToString:nextBlockId]) {
    [self setContentsHidden:NO];
    [self unregisterFromHost];
    _blockId = [nextBlockId copy];
    [self registerWithHostIfNeeded];
  }
  _markdown = [nextMarkdown copy];
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
  _markdown = @"";
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<MarkdownBlockActivationViewComponentDescriptor>();
}

@end
