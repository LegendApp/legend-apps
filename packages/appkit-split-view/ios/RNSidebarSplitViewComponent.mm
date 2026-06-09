#import "RNSidebarSplitViewComponent.h"

#import <react/renderer/components/RNAppKitSplitViewSpec/ComponentDescriptors.h>
#import <react/renderer/components/RNAppKitSplitViewSpec/EventEmitters.h>
#import <react/renderer/components/RNAppKitSplitViewSpec/Props.h>
#import <react/renderer/components/RNAppKitSplitViewSpec/RCTComponentViewHelpers.h>

using namespace facebook::react;

#if TARGET_OS_OSX
static NSAppearance *RNSidebarSplitViewAppearanceForName(NSString *appearanceName)
{
  if ([appearanceName isEqualToString:@"light"]) {
    return [NSAppearance appearanceNamed:NSAppearanceNameAqua];
  }

  if ([appearanceName isEqualToString:@"dark"]) {
    return [NSAppearance appearanceNamed:NSAppearanceNameDarkAqua];
  }

  return nil;
}
#endif

#if TARGET_OS_OSX
@interface RNSidebarSplitViewComponent () <RCTSidebarSplitViewViewProtocol>
@end
#else
@interface RNSidebarSplitViewComponent () <RCTSidebarSplitViewViewProtocol>
@end
#endif

@implementation RNSidebarSplitViewComponent {
#if TARGET_OS_OSX
  NSSplitViewController *_splitViewController;
  NSViewController *_sidebarViewController;
  NSViewController *_contentViewController;
  NSSplitViewItem *_sidebarItem;
  NSSplitViewItem *_contentItem;
  NSView *_sidebarContainer;
  NSView *_contentContainer;
  RCTUIView<RCTComponentViewProtocol> *_sidebarReactView;
  RCTUIView<RCTComponentViewProtocol> *_contentReactView;
  id _resizeObserver;
  LayoutMetrics _currentLayoutMetrics;
  LayoutMetrics _sidebarReactLayoutMetrics;
  LayoutMetrics _contentReactLayoutMetrics;
  CGFloat _sidebarMinWidth;
  CGFloat _contentMinWidth;
  CGFloat _lastSidebarWidth;
  CGFloat _lastContentWidth;
  CGFloat _lastHeight;
  NSString *_appearanceName;
#else
  UIView *_sidebarContainer;
  UIView *_contentContainer;
#endif
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    _props = std::make_shared<const SidebarSplitViewProps>();

#if TARGET_OS_OSX
    _currentLayoutMetrics = EmptyLayoutMetrics;
    _sidebarReactLayoutMetrics = EmptyLayoutMetrics;
    _contentReactLayoutMetrics = EmptyLayoutMetrics;
    _sidebarMinWidth = 180;
    _contentMinWidth = 320;
    _lastSidebarWidth = -1;
    _lastContentWidth = -1;
    _lastHeight = -1;
    _appearanceName = @"system";
    _sidebarContainer = [NSView new];
    _contentContainer = [NSView new];
    _sidebarContainer.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    _contentContainer.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;

    _sidebarViewController = [NSViewController new];
    _contentViewController = [NSViewController new];
    _sidebarViewController.view = _sidebarContainer;
    _contentViewController.view = _contentContainer;

    _sidebarItem = [NSSplitViewItem sidebarWithViewController:_sidebarViewController];
    _contentItem = [NSSplitViewItem splitViewItemWithViewController:_contentViewController];
    _sidebarItem.canCollapse = NO;
    _contentItem.canCollapse = NO;
    [self updateSplitItemSizing];

    if (@available(macOS 11.0, *)) {
      _sidebarItem.allowsFullHeightLayout = YES;
      _contentItem.allowsFullHeightLayout = YES;
    }

    _splitViewController = [NSSplitViewController new];
    _splitViewController.splitView.vertical = YES;
    _splitViewController.splitView.dividerStyle = NSSplitViewDividerStyleThin;
    _splitViewController.view.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    [_splitViewController addSplitViewItem:_sidebarItem];
    [_splitViewController addSplitViewItem:_contentItem];
    [self applyAppearance];

    _resizeObserver = [[NSNotificationCenter defaultCenter]
      addObserverForName:NSSplitViewDidResizeSubviewsNotification
                  object:_splitViewController.splitView
                   queue:NSOperationQueue.mainQueue
              usingBlock:^(__unused NSNotification *notification) {
                [self splitViewDidResize];
              }];

    [self addSubview:_splitViewController.view];
#else
    _sidebarContainer = [UIView new];
    _contentContainer = [UIView new];
    [self addSubview:_sidebarContainer];
    [self addSubview:_contentContainer];
#endif
  }
  return self;
}

#if TARGET_OS_OSX
- (BOOL)isFlipped
{
  return YES;
}

- (void)updateSplitItemSizing
{
  _sidebarItem.minimumThickness = MAX(120, _sidebarMinWidth);
  _sidebarItem.preferredThicknessFraction = 0.26;
  _contentItem.minimumThickness = MAX(240, _contentMinWidth);
}

- (void)applyAppearance
{
  NSAppearance *appearance = RNSidebarSplitViewAppearanceForName(_appearanceName);
  self.appearance = appearance;
  _splitViewController.view.appearance = appearance;
  _splitViewController.splitView.appearance = appearance;
  _sidebarContainer.appearance = appearance;
  _contentContainer.appearance = appearance;
  [_splitViewController.view setNeedsDisplay:YES];
  [_splitViewController.splitView setNeedsDisplay:YES];
  [_sidebarContainer setNeedsDisplay:YES];
  [_contentContainer setNeedsDisplay:YES];
}

- (void)syncReactSubviewFrames
{
  CGRect sidebarBounds = _sidebarContainer.bounds;
  CGRect contentBounds = _contentContainer.bounds;

  [self syncReactSubview:_sidebarReactView
             nativeBounds:sidebarBounds
    previousLayoutMetrics:&_sidebarReactLayoutMetrics];
  [self syncReactSubview:_contentReactView
             nativeBounds:contentBounds
    previousLayoutMetrics:&_contentReactLayoutMetrics];
}

- (void)syncReactSubview:(nullable RCTUIView<RCTComponentViewProtocol> *)subview
            nativeBounds:(CGRect)nativeBounds
   previousLayoutMetrics:(LayoutMetrics *)previousLayoutMetrics
{
  if (!subview) {
    return;
  }

  subview.translatesAutoresizingMaskIntoConstraints = YES;
  subview.frame = nativeBounds;
  LayoutMetrics nextLayoutMetrics = _currentLayoutMetrics;
  if (nextLayoutMetrics == EmptyLayoutMetrics) {
    nextLayoutMetrics = LayoutMetrics{};
  }
  nextLayoutMetrics.frame = facebook::react::Rect{
    facebook::react::Point{0, 0},
    facebook::react::Size{(Float)nativeBounds.size.width, (Float)nativeBounds.size.height},
  };
  nextLayoutMetrics.contentInsets = {};
  nextLayoutMetrics.borderWidth = {};
  nextLayoutMetrics.overflowInset = {};

  [subview updateLayoutMetrics:nextLayoutMetrics oldLayoutMetrics:*previousLayoutMetrics];
  [subview finalizeUpdates:RNComponentViewUpdateMaskLayoutMetrics];
  *previousLayoutMetrics = nextLayoutMetrics;
  subview.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  [subview setNeedsLayout:YES];
  [subview layoutSubtreeIfNeeded];
}

- (void)splitViewDidResize
{
  const auto eventEmitter = std::static_pointer_cast<const SidebarSplitViewEventEmitter>(_eventEmitter);
  if (!eventEmitter) {
    return;
  }

  CGFloat sidebarWidth = 0;
  CGFloat contentWidth = 0;
  CGFloat sidebarHeight = 0;
  CGFloat contentHeight = 0;
  CGFloat height = 0;

  sidebarWidth = _sidebarContainer.bounds.size.width;
  contentWidth = _contentContainer.bounds.size.width;
  sidebarHeight = _sidebarContainer.bounds.size.height;
  contentHeight = _contentContainer.bounds.size.height;
  height = MAX(sidebarHeight, contentHeight);
  CGRect bounds = [self currentLayoutBounds];

  if (sidebarWidth <= 0 || contentWidth <= 0 || height <= 0 ||
      fabs(_contentContainer.bounds.size.height - bounds.size.height) >= 0.5) {
    return;
  }

  [self syncReactSubviewFrames];

  if (fabs(sidebarWidth - _lastSidebarWidth) < 0.5 &&
      fabs(contentWidth - _lastContentWidth) < 0.5 &&
      fabs(height - _lastHeight) < 0.5) {
    return;
  }

  _lastSidebarWidth = sidebarWidth;
  _lastContentWidth = contentWidth;
  _lastHeight = height;

  eventEmitter->onSplitViewDidResize(SidebarSplitViewEventEmitter::OnSplitViewDidResize{
    .contentHeight = contentHeight,
    .contentWidth = contentWidth,
    .height = height,
    .isVertical = true,
    .sidebarHeight = sidebarHeight,
    .sidebarWidth = sidebarWidth,
  });
}

- (CGRect)currentLayoutBounds
{
  CGRect bounds = self.bounds;
  if ((bounds.size.width <= 0 || bounds.size.height <= 0) && _currentLayoutMetrics != EmptyLayoutMetrics) {
    bounds = CGRectMake(
      0,
      0,
      _currentLayoutMetrics.frame.size.width,
      _currentLayoutMetrics.frame.size.height);
  }
  return bounds;
}

- (void)applyDividerPositionForBounds:(CGRect)bounds
{
  if (bounds.size.width <= 0 || _splitViewController.splitView.subviews.count < 2) {
    return;
  }

  CGFloat dividerThickness = _splitViewController.splitView.dividerThickness;
  CGFloat maxSidebarWidth = bounds.size.width - _contentMinWidth - dividerThickness;
  CGFloat sidebarWidth = MIN(_sidebarMinWidth, maxSidebarWidth);
  if (sidebarWidth <= 0) {
    return;
  }

  [_splitViewController.splitView setPosition:sidebarWidth ofDividerAtIndex:0];
}

- (void)layoutSplitView
{
  CGRect bounds = [self currentLayoutBounds];
  _splitViewController.view.frame = bounds;
  _splitViewController.splitView.frame = bounds;
  [self applyDividerPositionForBounds:bounds];
  [_splitViewController.splitView adjustSubviews];
  [_splitViewController.view layoutSubtreeIfNeeded];
  [self splitViewDidResize];
}

- (void)updateEventEmitter:(const EventEmitter::Shared &)eventEmitter
{
  [super updateEventEmitter:eventEmitter];

  dispatch_async(dispatch_get_main_queue(), ^{
    [self splitViewDidResize];
  });
}
#endif

- (void)mountChildComponentView:(RCTUIView<RCTComponentViewProtocol> *)childComponentView
                          index:(NSInteger)index
{
#if TARGET_OS_OSX
  if (index == 0) {
    [_sidebarReactView removeFromSuperview];
    _sidebarReactView = childComponentView;
    _sidebarReactLayoutMetrics = EmptyLayoutMetrics;
    [_sidebarContainer addSubview:childComponentView];
    [self syncReactSubview:_sidebarReactView
               nativeBounds:_sidebarContainer.bounds
      previousLayoutMetrics:&_sidebarReactLayoutMetrics];
    dispatch_async(dispatch_get_main_queue(), ^{
      [self splitViewDidResize];
    });
    return;
  }

  if (index == 1) {
    [_contentReactView removeFromSuperview];
    _contentReactView = childComponentView;
    _contentReactLayoutMetrics = EmptyLayoutMetrics;
    [_contentContainer addSubview:childComponentView];
    [self syncReactSubview:_contentReactView
               nativeBounds:_contentContainer.bounds
      previousLayoutMetrics:&_contentReactLayoutMetrics];
    dispatch_async(dispatch_get_main_queue(), ^{
      [self splitViewDidResize];
    });
    return;
  }
#else
  if (index == 0) {
    [_sidebarContainer addSubview:childComponentView];
    return;
  }

  if (index == 1) {
    [_contentContainer addSubview:childComponentView];
    return;
  }
#endif

  [super mountChildComponentView:childComponentView index:index];
}

- (void)unmountChildComponentView:(RCTUIView<RCTComponentViewProtocol> *)childComponentView
                            index:(NSInteger)index
{
#if TARGET_OS_OSX
  if (childComponentView == _sidebarReactView) {
    _sidebarReactView = nil;
    _sidebarReactLayoutMetrics = EmptyLayoutMetrics;
    [childComponentView removeFromSuperview];
    return;
  }

  if (childComponentView == _contentReactView) {
    _contentReactView = nil;
    _contentReactLayoutMetrics = EmptyLayoutMetrics;
    [childComponentView removeFromSuperview];
    return;
  }
#else
  if (index == 0 || index == 1) {
    [childComponentView removeFromSuperview];
    return;
  }
#endif

  [super unmountChildComponentView:childComponentView index:index];
}

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps
{
  const auto &newProps = *std::static_pointer_cast<SidebarSplitViewProps const>(props);

#if TARGET_OS_OSX
  NSString *nextAppearanceName = [NSString stringWithUTF8String:newProps.appearance.c_str()];
  if (nextAppearanceName.length == 0) {
    nextAppearanceName = @"system";
  }
  _sidebarMinWidth = newProps.sidebarMinWidth;
  _contentMinWidth = newProps.contentMinWidth;
  if (![_appearanceName isEqualToString:nextAppearanceName]) {
    _appearanceName = nextAppearanceName;
    [self applyAppearance];
  }
  [self updateSplitItemSizing];
#endif

  [super updateProps:props oldProps:oldProps];
}

- (void)updateLayoutMetrics:(const LayoutMetrics &)layoutMetrics
           oldLayoutMetrics:(const LayoutMetrics &)oldLayoutMetrics
{
  [super updateLayoutMetrics:layoutMetrics oldLayoutMetrics:oldLayoutMetrics];

#if TARGET_OS_OSX
  _currentLayoutMetrics = layoutMetrics;
  [self layoutSplitView];
#else
  CGFloat sidebarWidth = self.bounds.size.width * 0.26;
  _sidebarContainer.frame = CGRectMake(0, 0, sidebarWidth, self.bounds.size.height);
  _contentContainer.frame = CGRectMake(sidebarWidth, 0, self.bounds.size.width - sidebarWidth, self.bounds.size.height);
#endif
}

#if TARGET_OS_OSX
- (void)layout
{
  [super layout];

  [self layoutSplitView];
}

- (void)setFrameSize:(NSSize)newSize
{
  [super setFrameSize:newSize];

  [self layoutSplitView];
}

- (void)viewDidMoveToWindow
{
  [super viewDidMoveToWindow];

  if (self.window) {
    dispatch_after(dispatch_time(DISPATCH_TIME_NOW, (int64_t)(0.1 * NSEC_PER_SEC)), dispatch_get_main_queue(), ^{
      if (self.window) {
        _lastSidebarWidth = -1;
        _lastContentWidth = -1;
        _lastHeight = -1;
        [self layoutSplitView];
      }
    });
  }
}
#endif

- (void)layoutSubviews
{
  [super layoutSubviews];

#if TARGET_OS_OSX
  [self layoutSplitView];
#else
  CGFloat sidebarWidth = self.bounds.size.width * 0.26;
  _sidebarContainer.frame = CGRectMake(0, 0, sidebarWidth, self.bounds.size.height);
  _contentContainer.frame = CGRectMake(sidebarWidth, 0, self.bounds.size.width - sidebarWidth, self.bounds.size.height);
#endif
}

- (void)prepareForRecycle
{
  [super prepareForRecycle];

#if TARGET_OS_OSX
  [_sidebarReactView removeFromSuperview];
  [_contentReactView removeFromSuperview];
  _sidebarReactView = nil;
  _contentReactView = nil;
  _currentLayoutMetrics = EmptyLayoutMetrics;
  _sidebarReactLayoutMetrics = EmptyLayoutMetrics;
  _contentReactLayoutMetrics = EmptyLayoutMetrics;
  _sidebarMinWidth = 180;
  _contentMinWidth = 320;
  _lastSidebarWidth = -1;
  _lastContentWidth = -1;
  _lastHeight = -1;
  _appearanceName = @"system";
  [self applyAppearance];
  [self updateSplitItemSizing];
#else
  for (UIView *subview in _sidebarContainer.subviews) {
    [subview removeFromSuperview];
  }
  for (UIView *subview in _contentContainer.subviews) {
    [subview removeFromSuperview];
  }
#endif
}

- (void)dealloc
{
#if TARGET_OS_OSX
  if (_resizeObserver) {
    [[NSNotificationCenter defaultCenter] removeObserver:_resizeObserver];
  }
#endif
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<SidebarSplitViewComponentDescriptor>();
}

@end
