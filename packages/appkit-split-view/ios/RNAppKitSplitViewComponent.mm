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
  NSView *_sidebarView;
  NSView *_mainView;
  NSTextField *_sidebarLabel;
  NSTextField *_mainLabel;
#else
  UILabel *_sidebarLabel;
  UILabel *_mainLabel;
#endif
}

- (instancetype)init
{
  if (self = [super init]) {
#if TARGET_OS_OSX
    _splitView = [NSSplitView new];
    _splitView.dividerStyle = NSSplitViewDividerStyleThin;
    _splitView.vertical = YES;
    _splitView.translatesAutoresizingMaskIntoConstraints = NO;

    _sidebarView = [self makePanelViewWithSidebar:YES];
    _mainView = [self makePanelViewWithSidebar:NO];
    _sidebarLabel = [self makeLabel:@"Sidebar"];
    _mainLabel = [self makeLabel:@"Main Content"];

    [_sidebarView addSubview:_sidebarLabel];
    [_mainView addSubview:_mainLabel];
    [_splitView addArrangedSubview:_sidebarView];
    [_splitView addArrangedSubview:_mainView];
    [self addSubview:_splitView];
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
- (NSView *)makePanelViewWithSidebar:(BOOL)isSidebar
{
  Class glassClass = NSClassFromString(@"NSGlassEffectView");
  if (glassClass) {
    NSView *glassView = [glassClass new];
    glassView.wantsLayer = YES;
    return glassView;
  }

  NSVisualEffectView *view = [NSVisualEffectView new];
  view.material = isSidebar ? NSVisualEffectMaterialSidebar : NSVisualEffectMaterialContentBackground;
  view.blendingMode = NSVisualEffectBlendingModeWithinWindow;
  view.state = NSVisualEffectStateActive;
  return view;
}

- (NSTextField *)makeLabel:(NSString *)text
{
  NSTextField *label = [NSTextField labelWithString:text];
  label.alignment = NSTextAlignmentCenter;
  label.font = [NSFont systemFontOfSize:18 weight:NSFontWeightSemibold];
  return label;
}
#endif

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps
{
  const auto &newProps = *std::static_pointer_cast<AppKitSplitViewProps const>(props);

#if TARGET_OS_OSX
  _sidebarLabel.stringValue = [NSString stringWithUTF8String:newProps.sidebarTitle.c_str()];
  _mainLabel.stringValue = [NSString stringWithUTF8String:newProps.mainTitle.c_str()];
#else
  _sidebarLabel.text = [NSString stringWithUTF8String:newProps.sidebarTitle.c_str()];
  _mainLabel.text = [NSString stringWithUTF8String:newProps.mainTitle.c_str()];
#endif

  [super updateProps:props oldProps:oldProps];
}

- (void)layoutSubviews
{
  [super layoutSubviews];
#if TARGET_OS_OSX
  _splitView.frame = self.bounds;
  CGFloat sidebarWidth = MIN(280, MAX(180, self.bounds.size.width * 0.28));
  [_splitView setPosition:sidebarWidth ofDividerAtIndex:0];
  _sidebarLabel.frame = NSInsetRect(_sidebarView.bounds, 16, 16);
  _mainLabel.frame = NSInsetRect(_mainView.bounds, 16, 16);
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
