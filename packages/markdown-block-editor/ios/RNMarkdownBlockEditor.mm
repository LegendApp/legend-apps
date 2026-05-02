#import "RNMarkdownBlockEditor.h"

#import <react/renderer/components/RNMarkdownBlockEditorSpec/ComponentDescriptors.h>
#import <react/renderer/components/RNMarkdownBlockEditorSpec/EventEmitters.h>
#import <react/renderer/components/RNMarkdownBlockEditorSpec/Props.h>
#import <react/renderer/components/RNMarkdownBlockEditorSpec/RCTComponentViewHelpers.h>

using namespace facebook::react;

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

static void callMouseDown(id target, NSEvent *event)
{
  SEL selector = @selector(mouseDown:);
  if (![target respondsToSelector:selector]) {
    return;
  }

  void (*send)(id, SEL, NSEvent *) = (void (*)(id, SEL, NSEvent *))[target methodForSelector:selector];
  send(target, selector, event);
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
  }
}

- (void)unmountChildComponentView:(RCTUIView<RCTComponentViewProtocol> *)childComponentView
                            index:(NSInteger)index
{
  if (childComponentView == _overlayInput) {
    _overlayInput = nil;
  }

  [super unmountChildComponentView:childComponentView index:index];
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
    [_activationViews removeObjectForKey:view.blockId];
  }
}

- (void)activateBlockView:(RNMarkdownBlockActivationView *)view withEvent:(NSEvent *)event
{
  if (view.blockId.length == 0 || _overlayInput == nil) {
    return;
  }

  _activeBlockId = [view.blockId copy];
  [self showOverlayForBlockView:view markdown:view.markdown event:event loadValue:YES];

  auto eventEmitter = std::static_pointer_cast<const MarkdownEditorHostEventEmitter>(_eventEmitter);
  if (eventEmitter) {
    eventEmitter->onBeginEditing({
      .blockId = std::string([view.blockId UTF8String] ?: ""),
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
  NSRect frame = [view convertRect:view.bounds toView:overlaySuperview];
  _overlayInput.frame = frame;
  _overlayInput.hidden = NO;
  [_overlayInput removeFromSuperview];
  [overlaySuperview addSubview:_overlayInput positioned:NSWindowAbove relativeTo:nil];

  if (loadValue) {
    callSetValue(_overlayInput, markdown ?: @"");
    _lastLoadedBlockId = [view.blockId copy];
  }

  if (event != nil) {
    callMouseDown(_overlayInput, event);
  } else {
    callFocus(_overlayInput);
  }
}

- (void)hideOverlay
{
  _activeBlockId = nil;
  _lastLoadedBlockId = nil;
  _overlayInput.hidden = YES;
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
      _activeBlockId = [nextActiveBlockId copy];
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
    RNMarkdownBlockActivationView *view = [_activationViews objectForKey:_activeBlockId];
    if (view != nil && _overlayInput != nil && _overlayInput.superview != nil) {
      _overlayInput.frame = [view convertRect:view.bounds toView:_overlayInput.superview];
    }
  }
}

- (void)prepareForRecycle
{
  [super prepareForRecycle];
  [_activationViews removeAllObjects];
  _overlayInput = nil;
  _activeBlockId = nil;
  _lastLoadedBlockId = nil;
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
}

- (instancetype)init
{
  if (self = [super init]) {
    _props = std::make_shared<const MarkdownBlockActivationViewProps>();
    _blockId = @"";
    _markdown = @"";
  }
  return self;
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
    [self unregisterFromHost];
    _blockId = [nextBlockId copy];
    [self registerWithHostIfNeeded];
  }
  _markdown = [[NSString stringWithUTF8String:newViewProps.markdown.c_str()] copy];

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
  _blockId = @"";
  _markdown = @"";
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<MarkdownBlockActivationViewComponentDescriptor>();
}

@end
