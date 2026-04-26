#import "RNAppKitSplitViewComponent.h"

#import <react/renderer/components/RNAppKitSplitViewSpec/ComponentDescriptors.h>
#import <react/renderer/components/RNAppKitSplitViewSpec/Props.h>
#import <react/renderer/components/RNAppKitSplitViewSpec/RCTComponentViewHelpers.h>

using namespace facebook::react;

@interface RNAppKitSplitViewComponent () <RCTAppKitSplitViewViewProtocol>
@end

@implementation RNAppKitSplitViewComponent {
#if TARGET_OS_OSX
  NSSplitView *_splitView;
  NSView *_sidebarPanelView;
  NSView *_mainPanelView;
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
    _splitView = [NSSplitView new];
    _splitView.dividerStyle = NSSplitViewDividerStyleThin;
    _splitView.vertical = YES;
    _splitView.translatesAutoresizingMaskIntoConstraints = NO;
    _splitView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;

    _sidebarLabel = [self makeLabel:@"Sidebar"];
    _mainLabel = [self makeLabel:@"Main Content"];

    [self addSubview:_splitView];
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

  if (_sidebarPanelView) {
    [_splitView removeArrangedSubview:_sidebarPanelView];
    [_sidebarPanelView removeFromSuperview];
  }
  if (_mainPanelView) {
    [_splitView removeArrangedSubview:_mainPanelView];
    [_mainPanelView removeFromSuperview];
  }

  _usesLiquidGlass = usesLiquidGlass;
  NSView *sidebarContentView = nil;
  NSView *mainContentView = nil;
  _sidebarPanelView = [self makePanelViewWithSidebar:YES usesLiquidGlass:usesLiquidGlass contentView:&sidebarContentView];
  _mainPanelView = [self makePanelViewWithSidebar:NO usesLiquidGlass:usesLiquidGlass contentView:&mainContentView];
  _sidebarContentView = sidebarContentView;
  _mainContentView = mainContentView;

  [_sidebarContentView addSubview:_sidebarLabel];
  [_mainContentView addSubview:_mainLabel];
  [_splitView addArrangedSubview:_sidebarPanelView];
  [_splitView addArrangedSubview:_mainPanelView];

  [self setNeedsLayout:YES];
}

- (NSView *)makePanelViewWithSidebar:(BOOL)isSidebar
                     usesLiquidGlass:(BOOL)usesLiquidGlass
                          contentView:(NSView **)contentView
{
  if (usesLiquidGlass) {
    if (@available(macOS 26.0, *)) {
      NSGlassEffectView *glassView = [NSGlassEffectView new];
      NSView *glassContentView = [NSView new];
      glassContentView.wantsLayer = YES;
      glassView.contentView = glassContentView;
      glassView.cornerRadius = 0;
      glassView.style = isSidebar ? NSGlassEffectViewStyleRegular : NSGlassEffectViewStyleClear;
      *contentView = glassContentView;
      return glassView;
    }
  }

  NSVisualEffectView *view = [NSVisualEffectView new];
  view.material = isSidebar ? NSVisualEffectMaterialSidebar : NSVisualEffectMaterialContentBackground;
  view.blendingMode = NSVisualEffectBlendingModeWithinWindow;
  view.state = NSVisualEffectStateActive;
  view.wantsLayer = YES;
  *contentView = view;
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
  _splitView.frame = self.bounds;
  CGFloat sidebarWidth = MIN(280, MAX(180, self.bounds.size.width * 0.28));
  [_splitView setPosition:sidebarWidth ofDividerAtIndex:0];
  [_splitView layoutSubtreeIfNeeded];
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
