#import "RNMarkdownBlockEditor.h"

#import <react/renderer/components/RNMarkdownBlockEditorSpec/ComponentDescriptors.h>
#import <react/renderer/components/RNMarkdownBlockEditorSpec/EventEmitters.h>
#import <react/renderer/components/RNMarkdownBlockEditorSpec/Props.h>
#import <react/renderer/components/RNMarkdownBlockEditorSpec/RCTComponentViewHelpers.h>

using namespace facebook::react;

static const CGFloat RNMarkdownBlockEditorOverlayVerticalInset = 4.0;

static SEL setValueSelector()
{
  return NSSelectorFromString(@"setValue:");
}

static SEL focusSelector()
{
  return NSSelectorFromString(@"focus");
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

static NSTextView *findTextView(NSView *view)
{
  if ([view isKindOfClass:NSTextView.class]) {
    return (NSTextView *)view;
  }

  if ([view isKindOfClass:NSScrollView.class]) {
    NSView *documentView = ((NSScrollView *)view).documentView;
    if (documentView != nil) {
      NSTextView *textView = findTextView(documentView);
      if (textView != nil) {
        return textView;
      }
    }
  }

  for (NSView *subview in view.subviews) {
    NSTextView *textView = findTextView(subview);
    if (textView != nil) {
      return textView;
    }
  }

  return nil;
}

static NSUInteger characterIndexForEvent(NSTextView *textView, NSEvent *event)
{
  NSPoint pointInTextView = [textView convertPoint:event.locationInWindow fromView:nil];
  pointInTextView.x -= textView.textContainerInset.width;
  pointInTextView.y -= textView.textContainerInset.height;

  NSLayoutManager *layoutManager = textView.layoutManager;
  NSTextContainer *textContainer = textView.textContainer;
  if (layoutManager == nil || textContainer == nil || layoutManager.numberOfGlyphs == 0) {
    return textView.string.length;
  }

  NSUInteger glyphIndex = [layoutManager glyphIndexForPoint:pointInTextView inTextContainer:textContainer];
  glyphIndex = MIN(glyphIndex, layoutManager.numberOfGlyphs - 1);
  NSUInteger characterIndex = [layoutManager characterIndexForGlyphAtIndex:glyphIndex];
  return MIN(characterIndex, textView.string.length);
}

static NSRange wordRangeAtIndex(NSString *string, NSUInteger index)
{
  if (string.length == 0) {
    return NSMakeRange(0, 0);
  }

  NSCharacterSet *wordCharacters = [NSCharacterSet alphanumericCharacterSet];
  NSUInteger clampedIndex = MIN(index, string.length - 1);

  if (![wordCharacters characterIsMember:[string characterAtIndex:clampedIndex]] && clampedIndex > 0) {
    NSUInteger previousIndex = clampedIndex - 1;
    if ([wordCharacters characterIsMember:[string characterAtIndex:previousIndex]]) {
      clampedIndex = previousIndex;
    }
  }

  if (![wordCharacters characterIsMember:[string characterAtIndex:clampedIndex]]) {
    return NSMakeRange(index, 0);
  }

  NSUInteger start = clampedIndex;
  while (start > 0 && [wordCharacters characterIsMember:[string characterAtIndex:start - 1]]) {
    start--;
  }

  NSUInteger end = clampedIndex + 1;
  while (end < string.length && [wordCharacters characterIsMember:[string characterAtIndex:end]]) {
    end++;
  }

  return NSMakeRange(start, end - start);
}

static void selectTextForEvent(NSView *view, NSEvent *event)
{
  NSTextView *textView = findTextView(view);
  if (textView == nil) {
    callFocus(view);
    return;
  }

  [textView.window makeFirstResponder:textView];
  NSUInteger characterIndex = characterIndexForEvent(textView, event);

  if (event.clickCount >= 2) {
    textView.selectedRange = wordRangeAtIndex(textView.string, characterIndex);
    return;
  }

  textView.selectedRange = NSMakeRange(characterIndex, 0);
}

static BOOL isEnrichedMarkdownInput(id view)
{
  return [view respondsToSelector:setValueSelector()] && [view respondsToSelector:@selector(mouseDown:)];
}

@interface RNMarkdownEditorHost () <RCTMarkdownEditorHostViewProtocol>
@end

@implementation RNMarkdownEditorHost {
  RCTUIView<RCTComponentViewProtocol> *_overlayInput;
  NSMapTable<NSString *, RNMarkdownBlockActivationView *> *_activationViews;
  NSString *_activeBlockId;
  NSString *_lastLoadedBlockId;
  BOOL _isPositioningOverlay;
}

- (instancetype)init
{
  if (self = [super init]) {
    _props = std::make_shared<const MarkdownEditorHostProps>();
    _activationViews = [NSMapTable strongToWeakObjectsMapTable];
  }
  return self;
}

- (void)mountChildComponentView:(RCTUIView<RCTComponentViewProtocol> *)childComponentView
                          index:(NSInteger)index
{
  [super mountChildComponentView:childComponentView index:index];

  if (isEnrichedMarkdownInput(childComponentView)) {
    _overlayInput = childComponentView;
    _overlayInput.hidden = YES;
    [_overlayInput setPostsFrameChangedNotifications:YES];
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(overlayInputFrameDidChange:)
                                                 name:NSViewFrameDidChangeNotification
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
    _overlayInput = nil;
  }

  [super unmountChildComponentView:childComponentView index:index];
}

- (void)dealloc
{
  if (_overlayInput != nil) {
    [[NSNotificationCenter defaultCenter] removeObserver:self
                                                    name:NSViewFrameDidChangeNotification
                                                  object:_overlayInput];
  }
}

- (void)registerActivationView:(RNMarkdownBlockActivationView *)view
{
  if (view.blockId.length == 0) {
    return;
  }
  [_activationViews setObject:view forKey:view.blockId];
  if (_activeBlockId != nil && [_activeBlockId isEqualToString:view.blockId]) {
    [self showOverlayForBlockView:view markdown:view.markdown event:nil loadValue:_lastLoadedBlockId == nil || ![_lastLoadedBlockId isEqualToString:view.blockId]];
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

- (nullable RNMarkdownBlockActivationView *)activeBlockView
{
  if (_activeBlockId.length == 0) {
    return nil;
  }
  return [_activationViews objectForKey:_activeBlockId];
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

- (NSRect)overlayFrameForBlockView:(RNMarkdownBlockActivationView *)view
{
  if (_overlayInput == nil || _overlayInput.superview == nil || view.window == nil) {
    return NSZeroRect;
  }

  NSRect frame = [view convertRect:view.bounds toView:_overlayInput.superview];
  frame.origin.y += RNMarkdownBlockEditorOverlayVerticalInset;
  frame.size.height = MAX(1.0, frame.size.height - RNMarkdownBlockEditorOverlayVerticalInset * 2.0);
  return frame;
}

- (void)positionOverlayForBlockView:(RNMarkdownBlockActivationView *)view
{
  if (_overlayInput == nil || _overlayInput.superview == nil || view.window == nil) {
    return;
  }

  NSRect frame = [self overlayFrameForBlockView:view];
  if (NSEqualRects(_overlayInput.frame, frame)) {
    return;
  }

  _isPositioningOverlay = YES;
  _overlayInput.frame = frame;
  _isPositioningOverlay = NO;
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

  NSRect targetFrame = [self overlayFrameForBlockView:view];
  if (NSEqualRects(_overlayInput.frame, targetFrame)) {
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
  [self showOverlayForBlockView:view markdown:view.markdown event:event loadValue:YES];

  auto eventEmitter = std::static_pointer_cast<const MarkdownEditorHostEventEmitter>(_eventEmitter);
  if (eventEmitter) {
    NSRect frame = [self overlayFrameForBlockView:view];
    eventEmitter->onBeginEditing({
      .blockId = std::string([view.blockId UTF8String] ?: ""),
      .height = frame.size.height,
      .width = frame.size.width,
      .x = frame.origin.x,
      .y = frame.origin.y,
    });
  }
}

- (void)showOverlayForBlockView:(RNMarkdownBlockActivationView *)view
                       markdown:(NSString *)markdown
                          event:(nullable NSEvent *)event
                      loadValue:(BOOL)loadValue
{
  if (_overlayInput == nil || _overlayInput.superview == nil || view.window == nil) {
    return;
  }

  NSView *overlaySuperview = _overlayInput.superview;
  NSRect frame = [self overlayFrameForBlockView:view];
  [self setBlockView:view contentsHidden:YES];
  _isPositioningOverlay = YES;
  _overlayInput.frame = frame;
  _overlayInput.hidden = NO;
  _isPositioningOverlay = NO;
  [_overlayInput removeFromSuperview];
  [overlaySuperview addSubview:_overlayInput positioned:NSWindowAbove relativeTo:nil];

  if (loadValue) {
    callSetValue(_overlayInput, markdown ?: @"");
    _lastLoadedBlockId = [view.blockId copy];
  }

  if (event != nil) {
    selectTextForEvent(_overlayInput, event);
  } else {
    callFocus(_overlayInput);
  }
}

- (void)hideOverlay
{
  _overlayInput.hidden = YES;
  [self showActiveBlockContents];
  _lastLoadedBlockId = nil;
  _activeBlockId = nil;
}

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps
{
  const auto &oldViewProps = *std::static_pointer_cast<MarkdownEditorHostProps const>(_props);
  const auto &newViewProps = *std::static_pointer_cast<MarkdownEditorHostProps const>(props);

  NSString *nextActiveBlockId = [NSString stringWithUTF8String:newViewProps.activeBlockId.c_str()];
  if (nextActiveBlockId.length == 0) {
    if (_activeBlockId != nil) {
      [self hideOverlay];
    }
  } else if (_activeBlockId == nil || ![_activeBlockId isEqualToString:nextActiveBlockId]) {
    RNMarkdownBlockActivationView *view = [_activationViews objectForKey:nextActiveBlockId];
    if (view != nil) {
      NSString *markdown = [NSString stringWithUTF8String:newViewProps.activeMarkdown.c_str()];
      [self showActiveBlockContents];
      _activeBlockId = [nextActiveBlockId copy];
      [self setBlockView:view contentsHidden:YES];
      [self showOverlayForBlockView:view markdown:markdown event:nil loadValue:YES];
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
  _overlayInput = nil;
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
  if (![_blockId isEqualToString:nextBlockId]) {
    [self setContentsHidden:NO];
    [self unregisterFromHost];
    _blockId = [nextBlockId copy];
    [self registerWithHostIfNeeded];
  }
  _markdown = [[NSString stringWithUTF8String:newViewProps.markdown.c_str()] copy];
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
