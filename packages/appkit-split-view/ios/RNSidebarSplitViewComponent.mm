#import "RNSidebarSplitViewComponent.h"

#import <react/renderer/components/RNAppKitSplitViewSpec/ComponentDescriptors.h>
#import <react/renderer/components/RNAppKitSplitViewSpec/EventEmitters.h>
#import <react/renderer/components/RNAppKitSplitViewSpec/Props.h>
#import <react/renderer/components/RNAppKitSplitViewSpec/RCTComponentViewHelpers.h>

#if TARGET_OS_OSX
#import <QuartzCore/QuartzCore.h>
#endif

using namespace facebook::react;

#if TARGET_OS_OSX
@interface RNSidebarSplitViewTitlebarMaterialContainerView : NSView
@end

@implementation RNSidebarSplitViewTitlebarMaterialContainerView
- (nullable NSView *)hitTest:(NSPoint)point
{
  return nil;
}
@end

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

static NSColor *RNSidebarSplitViewColorFromHexString(NSString *value)
{
  if (![value isKindOfClass:NSString.class] || value.length == 0) {
    return nil;
  }

  NSString *hex = [value hasPrefix:@"#"] ? [value substringFromIndex:1] : value;
  if (hex.length != 6 && hex.length != 8) {
    return nil;
  }

  unsigned long long raw = 0;
  NSScanner *scanner = [NSScanner scannerWithString:hex];
  if (![scanner scanHexLongLong:&raw]) {
    return nil;
  }

  CGFloat red = 0;
  CGFloat green = 0;
  CGFloat blue = 0;
  CGFloat alpha = 1;
  if (hex.length == 8) {
    red = ((raw >> 24) & 0xff) / 255.0;
    green = ((raw >> 16) & 0xff) / 255.0;
    blue = ((raw >> 8) & 0xff) / 255.0;
    alpha = (raw & 0xff) / 255.0;
  } else {
    red = ((raw >> 16) & 0xff) / 255.0;
    green = ((raw >> 8) & 0xff) / 255.0;
    blue = (raw & 0xff) / 255.0;
  }

  return [NSColor colorWithSRGBRed:red green:green blue:blue alpha:alpha];
}

static CGFloat RNSidebarSplitViewClampedUnitValue(CGFloat value)
{
  return MIN(MAX(0, value), 1);
}

static NSVisualEffectMaterial RNSidebarSplitViewMaterialForName(NSString *value)
{
  if ([value isEqualToString:@"hudWindow"]) {
    return NSVisualEffectMaterialHUDWindow;
  }
  if ([value isEqualToString:@"sidebar"]) {
    return NSVisualEffectMaterialSidebar;
  }
  if ([value isEqualToString:@"windowBackground"]) {
    return NSVisualEffectMaterialWindowBackground;
  }
  if ([value isEqualToString:@"titlebar"]) {
    return NSVisualEffectMaterialTitlebar;
  }
  if ([value isEqualToString:@"glass"] || [value isEqualToString:@"headerView"]) {
    if (@available(macOS 10.14, *)) {
      return NSVisualEffectMaterialHeaderView;
    }
    return NSVisualEffectMaterialTitlebar;
  }
  return NSVisualEffectMaterialTitlebar;
}

static NSView *RNSidebarSplitViewCreateColorOverlay(NSRect frame, NSColor *color, CGFloat opacity)
{
  NSView *overlayView = [[NSView alloc] initWithFrame:frame];
  overlayView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  overlayView.wantsLayer = YES;
  overlayView.layer.backgroundColor = [color colorWithAlphaComponent:opacity].CGColor;
  return overlayView;
}

static NSView *RNSidebarSplitViewCreateMaterialContainer(NSRect frame, NSView *materialView, NSColor *overlayColor, CGFloat overlayOpacity)
{
  RNSidebarSplitViewTitlebarMaterialContainerView *containerView =
    [[RNSidebarSplitViewTitlebarMaterialContainerView alloc] initWithFrame:frame];
  containerView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  containerView.wantsLayer = YES;
  containerView.layer.backgroundColor = NSColor.clearColor.CGColor;
  containerView.layer.masksToBounds = YES;

  [containerView addSubview:materialView];
  if (overlayColor && overlayOpacity > 0) {
    [containerView addSubview:RNSidebarSplitViewCreateColorOverlay(containerView.bounds, overlayColor, overlayOpacity)];
  }

  return containerView;
}

API_AVAILABLE(macos(26.0))
static NSView *RNSidebarSplitViewCreateGlassMaterialView(NSRect frame, NSColor *overlayColor, CGFloat overlayOpacity)
{
  CGFloat overscan = 48;
  NSRect glassFrame = NSMakeRect(-overscan, 0, NSWidth(frame) + (overscan * 2), NSHeight(frame) + overscan);
  NSGlassEffectView *glassView = [[NSGlassEffectView alloc] initWithFrame:glassFrame];
  glassView.cornerRadius = 0;
  glassView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  glassView.wantsLayer = YES;
  glassView.layer.backgroundColor = NSColor.clearColor.CGColor;
  return RNSidebarSplitViewCreateMaterialContainer(frame, glassView, overlayColor, overlayOpacity);
}

static NSView *RNSidebarSplitViewCreateTitlebarMaterialView(NSString *materialName,
                                                            NSRect frame,
                                                            NSColor *overlayColor,
                                                            CGFloat overlayOpacity)
{
  if ([materialName isEqualToString:@"glass"]) {
    if (@available(macOS 26.0, *)) {
      return RNSidebarSplitViewCreateGlassMaterialView(frame, overlayColor, overlayOpacity);
    }
  }

  NSVisualEffectView *effectView = [[NSVisualEffectView alloc] initWithFrame:NSMakeRect(0, 0, NSWidth(frame), NSHeight(frame))];
  effectView.material = RNSidebarSplitViewMaterialForName(materialName);
  effectView.blendingMode = NSVisualEffectBlendingModeWithinWindow;
  effectView.state = NSVisualEffectStateFollowsWindowActiveState;
  effectView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  effectView.wantsLayer = YES;
  effectView.layer.backgroundColor = NSColor.clearColor.CGColor;
  return RNSidebarSplitViewCreateMaterialContainer(frame, effectView, overlayColor, overlayOpacity);
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
  CGFloat _sidebarWidth;
  CGFloat _contentMinWidth;
  BOOL _sidebarCollapsed;
  CGFloat _lastSidebarWidth;
  CGFloat _lastContentWidth;
  CGFloat _lastHeight;
  NSString *_appearanceName;
  CGFloat _contentTitlebarHeight;
  NSString *_contentTitlebarMaterialName;
  NSString *_contentTitlebarOverlayColorValue;
  CGFloat _contentTitlebarOverlayOpacity;
  NSView *_contentTitlebarMaterialView;
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
    _sidebarWidth = 0;
    _contentMinWidth = 320;
    _sidebarCollapsed = NO;
    _lastSidebarWidth = -1;
    _lastContentWidth = -1;
    _lastHeight = -1;
    _appearanceName = @"system";
    _contentTitlebarHeight = 0;
    _contentTitlebarMaterialName = @"none";
    _contentTitlebarOverlayOpacity = 0;
    _sidebarContainer = [NSView new];
    _contentContainer = [NSView new];
    _sidebarContainer.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    _contentContainer.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    _sidebarContainer.wantsLayer = YES;
    _contentContainer.wantsLayer = YES;
    _sidebarContainer.layer.masksToBounds = NO;
    _contentContainer.layer.masksToBounds = NO;
    _sidebarContainer.layer.zPosition = 10;
    _contentContainer.layer.zPosition = 0;

    _sidebarViewController = [NSViewController new];
    _contentViewController = [NSViewController new];
    _sidebarViewController.view = _sidebarContainer;
    _contentViewController.view = _contentContainer;

    _sidebarItem = [NSSplitViewItem sidebarWithViewController:_sidebarViewController];
    _contentItem = [NSSplitViewItem splitViewItemWithViewController:_contentViewController];
    _sidebarItem.canCollapse = YES;
    _contentItem.canCollapse = NO;
    [self updateSplitItemSizing];

    if (@available(macOS 11.0, *)) {
      _sidebarItem.allowsFullHeightLayout = YES;
      _contentItem.allowsFullHeightLayout = YES;
    }

    _splitViewController = [NSSplitViewController new];
    _splitViewController.minimumThicknessForInlineSidebars = 0;
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

- (CGFloat)preferredSidebarWidthForBounds:(CGRect)bounds
{
  CGFloat dividerThickness = _splitViewController.splitView.dividerThickness;
  CGFloat maxSidebarWidth = bounds.size.width - _contentMinWidth - dividerThickness;
  CGFloat preferredSidebarWidth = _sidebarWidth > 0 ? _sidebarWidth : _sidebarMinWidth;
  CGFloat sidebarWidth = MIN(MAX(_sidebarMinWidth, preferredSidebarWidth), maxSidebarWidth);
  return MAX(0, sidebarWidth);
}

- (void)updateSidebarCollapsed
{
  if (_sidebarItem.collapsed != _sidebarCollapsed) {
    _sidebarItem.collapsed = _sidebarCollapsed;
  }
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

- (void)removeContentTitlebarMaterial
{
  [_contentTitlebarMaterialView removeFromSuperview];
  _contentTitlebarMaterialView = nil;
}

- (void)layoutContentTitlebarMaterial
{
  if (_contentTitlebarHeight <= 0 ||
      _contentTitlebarMaterialName.length == 0 ||
      [_contentTitlebarMaterialName isEqualToString:@"none"] ||
      !_contentContainer.superview) {
    [self removeContentTitlebarMaterial];
    return;
  }

  NSRect splitFrameInContent = [_splitViewController.view convertRect:_splitViewController.view.bounds toView:_contentContainer];
  CGFloat materialHeight = MIN(_contentTitlebarHeight, NSHeight(splitFrameInContent));
  if (materialHeight <= 0 || NSWidth(splitFrameInContent) <= 0) {
    [self removeContentTitlebarMaterial];
    return;
  }

  CGFloat materialY = _contentContainer.isFlipped
    ? NSMinY(splitFrameInContent)
    : NSMaxY(splitFrameInContent) - materialHeight;
  NSRect materialFrame = NSMakeRect(NSMinX(splitFrameInContent), materialY, NSWidth(splitFrameInContent), materialHeight);

  if (!_contentTitlebarMaterialView) {
    NSColor *overlayColor = RNSidebarSplitViewColorFromHexString(_contentTitlebarOverlayColorValue);
    CGFloat overlayOpacity = RNSidebarSplitViewClampedUnitValue(_contentTitlebarOverlayOpacity);
    _contentTitlebarMaterialView = RNSidebarSplitViewCreateTitlebarMaterialView(
      _contentTitlebarMaterialName,
      materialFrame,
      overlayColor,
      overlayOpacity);
  } else {
    _contentTitlebarMaterialView.frame = materialFrame;
  }

  if (_contentTitlebarMaterialView.superview != _contentContainer) {
    [_contentTitlebarMaterialView removeFromSuperview];
    [_contentContainer addSubview:_contentTitlebarMaterialView positioned:NSWindowAbove relativeTo:_contentReactView];
  } else {
    [_contentContainer addSubview:_contentTitlebarMaterialView positioned:NSWindowAbove relativeTo:_contentReactView];
  }

  _sidebarContainer.layer.zPosition = 10;
  _contentContainer.layer.zPosition = 0;
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

  subview.hidden = nativeBounds.size.width <= 0 || nativeBounds.size.height <= 0;
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

- (void)emitSplitViewDidResizeWithSidebarWidth:(CGFloat)sidebarWidth
                                  contentWidth:(CGFloat)contentWidth
                                      contentX:(CGFloat)contentX
                                  sidebarHeight:(CGFloat)sidebarHeight
                                  contentHeight:(CGFloat)contentHeight
                                         height:(CGFloat)height
{
  const auto eventEmitter = std::static_pointer_cast<const SidebarSplitViewEventEmitter>(_eventEmitter);
  if (!eventEmitter) {
    return;
  }

  if (contentWidth <= 0 || height <= 0) {
    return;
  }

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
    .contentX = contentX,
    .height = height,
    .isVertical = true,
    .sidebarHeight = sidebarHeight,
    .sidebarWidth = sidebarWidth,
  });
}

- (BOOL)applyEstimatedSplitViewLayoutForBounds:(CGRect)bounds
{
  if (bounds.size.width <= 0 || bounds.size.height <= 0) {
    return NO;
  }

  CGFloat dividerThickness = _splitViewController.splitView.dividerThickness;
  CGFloat sidebarWidth = 0;
  if (!_sidebarCollapsed) {
    sidebarWidth = [self preferredSidebarWidthForBounds:bounds];
  }
  CGFloat contentX = sidebarWidth > 0 ? sidebarWidth + dividerThickness : 0;
  CGFloat contentWidth = MAX(0, bounds.size.width - contentX);
  if (contentWidth <= 0) {
    contentWidth = bounds.size.width;
    contentX = 0;
  }

  _splitViewController.view.frame = bounds;
  _splitViewController.splitView.frame = bounds;
  _sidebarContainer.frame = CGRectMake(0, 0, sidebarWidth, bounds.size.height);
  _contentContainer.frame = CGRectMake(contentX, 0, contentWidth, bounds.size.height);

  CGRect sidebarBounds = CGRectMake(0, 0, sidebarWidth, bounds.size.height);
  CGRect contentBounds = CGRectMake(0, 0, contentWidth, bounds.size.height);
  [self syncReactSubview:_sidebarReactView
           nativeBounds:sidebarBounds
  previousLayoutMetrics:&_sidebarReactLayoutMetrics];
  [self syncReactSubview:_contentReactView
           nativeBounds:contentBounds
  previousLayoutMetrics:&_contentReactLayoutMetrics];

  [self emitSplitViewDidResizeWithSidebarWidth:sidebarWidth
                                  contentWidth:contentWidth
                                      contentX:contentX
                                 sidebarHeight:bounds.size.height
                                 contentHeight:bounds.size.height
                                        height:bounds.size.height];
  return YES;
}

- (void)splitViewDidResize
{
  CGFloat sidebarWidth = _sidebarContainer.bounds.size.width;
  CGFloat contentWidth = _contentContainer.bounds.size.width;
  CGFloat contentX = [_contentContainer convertRect:_contentContainer.bounds toView:self].origin.x;
  CGFloat sidebarHeight = _sidebarContainer.bounds.size.height;
  CGFloat contentHeight = _contentContainer.bounds.size.height;
  CGFloat height = MAX(sidebarHeight, contentHeight);
  CGRect bounds = [self currentLayoutBounds];

  if (contentWidth <= 0 || height <= 0 ||
      fabs(_contentContainer.bounds.size.height - bounds.size.height) >= 0.5) {
    [self applyEstimatedSplitViewLayoutForBounds:bounds];
    return;
  }

  [self syncReactSubviewFrames];
  [self layoutContentTitlebarMaterial];
  [self emitSplitViewDidResizeWithSidebarWidth:sidebarWidth
                                  contentWidth:contentWidth
                                      contentX:contentX
                                 sidebarHeight:sidebarHeight
                                 contentHeight:contentHeight
                                        height:height];
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
  if (_sidebarCollapsed || bounds.size.width <= 0 || _splitViewController.splitView.subviews.count < 2) {
    return;
  }

  CGFloat sidebarWidth = [self preferredSidebarWidthForBounds:bounds];
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
  if (_contentContainer.bounds.size.width <= 0 ||
      _contentContainer.bounds.size.height <= 0 ||
      fabs(_contentContainer.bounds.size.height - bounds.size.height) >= 0.5) {
    [self applyEstimatedSplitViewLayoutForBounds:bounds];
  }
  [self updateSidebarCollapsed];
  [self applyDividerPositionForBounds:bounds];
  [_splitViewController.splitView adjustSubviews];
  [_splitViewController.view layoutSubtreeIfNeeded];
  [self layoutContentTitlebarMaterial];
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
    childComponentView.hidden = YES;
    [_sidebarContainer addSubview:childComponentView];
    if (_sidebarContainer.bounds.size.width <= 0 || _sidebarContainer.bounds.size.height <= 0) {
      [self applyEstimatedSplitViewLayoutForBounds:[self currentLayoutBounds]];
    } else {
      [self syncReactSubview:_sidebarReactView
                 nativeBounds:_sidebarContainer.bounds
        previousLayoutMetrics:&_sidebarReactLayoutMetrics];
    }
    dispatch_async(dispatch_get_main_queue(), ^{
      [self splitViewDidResize];
    });
    return;
  }

  if (index == 1) {
    [_contentReactView removeFromSuperview];
    _contentReactView = childComponentView;
    _contentReactLayoutMetrics = EmptyLayoutMetrics;
    childComponentView.hidden = YES;
    [_contentContainer addSubview:childComponentView];
    if (_contentContainer.bounds.size.width <= 0 || _contentContainer.bounds.size.height <= 0) {
      [self applyEstimatedSplitViewLayoutForBounds:[self currentLayoutBounds]];
    } else {
      [self syncReactSubview:_contentReactView
                 nativeBounds:_contentContainer.bounds
        previousLayoutMetrics:&_contentReactLayoutMetrics];
    }
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
  BOOL shouldRelayout =
    fabs(_sidebarMinWidth - newProps.sidebarMinWidth) >= 0.5 ||
    fabs(_sidebarWidth - newProps.sidebarWidth) >= 0.5 ||
    fabs(_contentMinWidth - newProps.contentMinWidth) >= 0.5 ||
    _sidebarCollapsed != newProps.sidebarCollapsed ||
    fabs(_contentTitlebarHeight - newProps.contentTitlebarHeight) >= 0.5;
  NSString *nextContentTitlebarMaterialName = [NSString stringWithUTF8String:newProps.contentTitlebarMaterial.c_str()];
  if (nextContentTitlebarMaterialName.length == 0) {
    nextContentTitlebarMaterialName = @"none";
  }
  NSString *nextContentTitlebarOverlayColorValue = [NSString stringWithUTF8String:newProps.contentTitlebarOverlayColor.c_str()];
  if (nextContentTitlebarOverlayColorValue.length == 0) {
    nextContentTitlebarOverlayColorValue = nil;
  }
  CGFloat nextContentTitlebarOverlayOpacity = RNSidebarSplitViewClampedUnitValue(newProps.contentTitlebarOverlayOpacity);
  BOOL shouldRecreateContentTitlebarMaterial =
    ![_contentTitlebarMaterialName isEqualToString:nextContentTitlebarMaterialName] ||
    !((_contentTitlebarOverlayColorValue == nextContentTitlebarOverlayColorValue) ||
      [_contentTitlebarOverlayColorValue isEqualToString:nextContentTitlebarOverlayColorValue]) ||
    fabs(_contentTitlebarOverlayOpacity - nextContentTitlebarOverlayOpacity) >= 0.001 ||
    fabs(_contentTitlebarHeight - newProps.contentTitlebarHeight) >= 0.5;
  _sidebarMinWidth = newProps.sidebarMinWidth;
  _sidebarWidth = newProps.sidebarWidth;
  _contentMinWidth = newProps.contentMinWidth;
  _sidebarCollapsed = newProps.sidebarCollapsed;
  _contentTitlebarHeight = newProps.contentTitlebarHeight;
  _contentTitlebarMaterialName = nextContentTitlebarMaterialName;
  _contentTitlebarOverlayColorValue = nextContentTitlebarOverlayColorValue;
  _contentTitlebarOverlayOpacity = nextContentTitlebarOverlayOpacity;
  if (shouldRecreateContentTitlebarMaterial) {
    [self removeContentTitlebarMaterial];
  }
  if (![_appearanceName isEqualToString:nextAppearanceName]) {
    _appearanceName = nextAppearanceName;
    [self applyAppearance];
  }
  [self updateSidebarCollapsed];
  [self updateSplitItemSizing];
#endif

  [super updateProps:props oldProps:oldProps];

#if TARGET_OS_OSX
  if (shouldRelayout || shouldRecreateContentTitlebarMaterial) {
    _lastSidebarWidth = -1;
    _lastContentWidth = -1;
    _lastHeight = -1;
    [self layoutSplitView];
  }
#endif
}

- (void)updateLayoutMetrics:(const LayoutMetrics &)layoutMetrics
           oldLayoutMetrics:(const LayoutMetrics &)oldLayoutMetrics
{
  [super updateLayoutMetrics:layoutMetrics oldLayoutMetrics:oldLayoutMetrics];

#if TARGET_OS_OSX
  _currentLayoutMetrics = layoutMetrics;
  [self applyEstimatedSplitViewLayoutForBounds:[self currentLayoutBounds]];
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
    dispatch_async(dispatch_get_main_queue(), ^{
      if (self.window) {
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
  _sidebarWidth = 0;
  _contentMinWidth = 320;
  _sidebarCollapsed = NO;
  _lastSidebarWidth = -1;
  _lastContentWidth = -1;
  _lastHeight = -1;
  _appearanceName = @"system";
  _contentTitlebarHeight = 0;
  _contentTitlebarMaterialName = @"none";
  _contentTitlebarOverlayColorValue = nil;
  _contentTitlebarOverlayOpacity = 0;
  [self removeContentTitlebarMaterial];
  [self applyAppearance];
  [self updateSidebarCollapsed];
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
