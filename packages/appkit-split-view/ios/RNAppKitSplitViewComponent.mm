#import "RNAppKitSplitViewComponent.h"

#import <react/renderer/components/RNAppKitSplitViewSpec/ComponentDescriptors.h>
#import <react/renderer/components/RNAppKitSplitViewSpec/Props.h>
#import <react/renderer/components/RNAppKitSplitViewSpec/RCTComponentViewHelpers.h>

using namespace facebook::react;

@interface RNAppKitSplitViewComponent () <RCTAppKitSplitViewViewProtocol>
@end

@implementation RNAppKitSplitViewComponent {
#if TARGET_OS_OSX
  NSSplitViewController *_splitViewController;
  NSViewController *_sidebarViewController;
  NSViewController *_mainViewController;
  NSSplitViewItem *_sidebarSplitViewItem;
  NSSplitViewItem *_mainSplitViewItem;
  NSView *_sidebarContentView;
  NSView *_mainContentView;
  NSTextField *_sidebarLabel;
  NSTextField *_mainLabel;
  BOOL _usesLiquidGlass;
#else
  UILabel *_sidebarLabel;
  UILabel *_mainLabel;
#endif
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    _props = std::make_shared<const AppKitSplitViewProps>();

#if TARGET_OS_OSX
    _splitViewController = [NSSplitViewController new];
    _splitViewController.splitView.dividerStyle = NSSplitViewDividerStyleThin;
    _splitViewController.splitView.vertical = YES;
    _splitViewController.view.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;

    _sidebarLabel = [self makeLabel:@"Sidebar"];
    _mainLabel = [self makeLabel:@"Main Content"];

    [self addSubview:_splitViewController.view];
    [self rebuildPanelsWithLiquidGlass:NO];
#else
    _sidebarLabel = [UILabel new];
    _sidebarLabel.text = @"Sidebar";
    _mainLabel = [UILabel new];
    _mainLabel.text = @"Main Content";
    [self addSubview:_sidebarLabel];
    [self addSubview:_mainLabel];
#endif
  }
  return self;
}

#if TARGET_OS_OSX
- (void)rebuildPanelsWithLiquidGlass:(BOOL)usesLiquidGlass
{
  [_sidebarLabel removeFromSuperview];
  [_mainLabel removeFromSuperview];
  _splitViewController.splitViewItems = @[];

  _usesLiquidGlass = usesLiquidGlass;

  _sidebarContentView = [self makeContentViewWithSidebar:YES usesLiquidGlass:usesLiquidGlass];
  _mainContentView = [self makeContentViewWithSidebar:NO usesLiquidGlass:usesLiquidGlass];
  _sidebarViewController = [NSViewController new];
  _mainViewController = [NSViewController new];
  _sidebarViewController.view = _sidebarContentView;
  _mainViewController.view = _mainContentView;

  _sidebarSplitViewItem = usesLiquidGlass
    ? [NSSplitViewItem sidebarWithViewController:_sidebarViewController]
    : [NSSplitViewItem splitViewItemWithViewController:_sidebarViewController];
  _mainSplitViewItem = [NSSplitViewItem splitViewItemWithViewController:_mainViewController];

  _sidebarSplitViewItem.minimumThickness = 180;
  _sidebarSplitViewItem.maximumThickness = 320;
  _sidebarSplitViewItem.preferredThicknessFraction = 0.22;

  if (@available(macOS 26.0, *)) {
    _mainSplitViewItem.automaticallyAdjustsSafeAreaInsets = usesLiquidGlass;
  }

  [_sidebarContentView addSubview:_sidebarLabel];
  [_mainContentView addSubview:_mainLabel];
  [_splitViewController addSplitViewItem:_sidebarSplitViewItem];
  [_splitViewController addSplitViewItem:_mainSplitViewItem];

  [self setNeedsLayout:YES];
}

- (NSView *)makeContentViewWithSidebar:(BOOL)isSidebar usesLiquidGlass:(BOOL)usesLiquidGlass
{
  if (!usesLiquidGlass && isSidebar) {
    NSVisualEffectView *view = [NSVisualEffectView new];
    view.material = NSVisualEffectMaterialSidebar;
    view.blendingMode = NSVisualEffectBlendingModeWithinWindow;
    view.state = NSVisualEffectStateActive;
    view.wantsLayer = YES;
    return view;
  }

  NSView *view = [NSView new];
  view.wantsLayer = YES;
  view.layer.backgroundColor = isSidebar ? NSColor.clearColor.CGColor : NSColor.windowBackgroundColor.CGColor;
  return view;
}

- (NSTextField *)makeLabel:(NSString *)text
{
  NSTextField *label = [NSTextField labelWithString:text];
  label.alignment = NSTextAlignmentCenter;
  label.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  label.textColor = NSColor.labelColor;
  label.font = [NSFont systemFontOfSize:18 weight:NSFontWeightSemibold];
  return label;
}
#endif

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps
{
  const auto &newProps = *std::static_pointer_cast<AppKitSplitViewProps const>(props);

#if TARGET_OS_OSX
  if (newProps.usesLiquidGlass != _usesLiquidGlass) {
    [self rebuildPanelsWithLiquidGlass:newProps.usesLiquidGlass];
  }

  _sidebarLabel.stringValue = [NSString stringWithUTF8String:newProps.sidebarTitle.c_str()];
  _mainLabel.stringValue = [NSString stringWithUTF8String:newProps.mainTitle.c_str()];
#else
  _sidebarLabel.text = [NSString stringWithUTF8String:newProps.sidebarTitle.c_str()];
  _mainLabel.text = [NSString stringWithUTF8String:newProps.mainTitle.c_str()];
#endif

  [super updateProps:props oldProps:oldProps];
}

- (void)updateLayoutMetrics:(const LayoutMetrics &)layoutMetrics
           oldLayoutMetrics:(const LayoutMetrics &)oldLayoutMetrics
{
  [super updateLayoutMetrics:layoutMetrics oldLayoutMetrics:oldLayoutMetrics];
  [self layoutSubviews];
}

- (void)layoutSubviews
{
  [super layoutSubviews];
#if TARGET_OS_OSX
  _splitViewController.view.frame = self.bounds;
  CGFloat sidebarWidth = MIN(280, MAX(180, self.bounds.size.width * 0.28));
  [_splitViewController.splitView setPosition:sidebarWidth ofDividerAtIndex:0];
  [_splitViewController.splitView layoutSubtreeIfNeeded];
  _sidebarLabel.frame = NSInsetRect(_sidebarContentView.bounds, 16, 16);
  _mainLabel.frame = NSInsetRect(_mainContentView.bounds, 16, 16);
#else
  CGFloat width = self.bounds.size.width;
  _sidebarLabel.frame = CGRectMake(0, 0, width * 0.35, self.bounds.size.height);
  _mainLabel.frame = CGRectMake(width * 0.35, 0, width * 0.65, self.bounds.size.height);
#endif
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<AppKitSplitViewComponentDescriptor>();
}

@end
