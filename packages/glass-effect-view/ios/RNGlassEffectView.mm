#import "RNGlassEffectView.h"

#import <react/renderer/components/RNGlassEffectViewSpec/ComponentDescriptors.h>
#import <react/renderer/components/RNGlassEffectViewSpec/Props.h>
#import <react/renderer/components/RNGlassEffectViewSpec/RCTComponentViewHelpers.h>

using namespace facebook::react;

@interface RNGlassEffectView () <RCTGlassEffectViewViewProtocol>
@end

@implementation RNGlassEffectView {
#if TARGET_OS_OSX
  NSVisualEffectView *_effectView;
#else
  UIView *_effectView;
#endif
}

- (instancetype)init
{
  if (self = [super init]) {
    _props = std::make_shared<const GlassEffectViewProps>();
#if TARGET_OS_OSX
    _effectView = [NSVisualEffectView new];
    _effectView.blendingMode = NSVisualEffectBlendingModeWithinWindow;
    _effectView.material = NSVisualEffectMaterialSidebar;
    _effectView.state = NSVisualEffectStateActive;
    _effectView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
#else
    _effectView = [UIView new];
    _effectView.backgroundColor = [UIColor colorWithWhite:1 alpha:0.7];
#endif
    [self insertSubview:_effectView atIndex:0];
  }
  return self;
}

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps
{
  const auto &newProps = *std::static_pointer_cast<GlassEffectViewProps const>(props);

#if TARGET_OS_OSX
  NSString *glassStyle = [NSString stringWithUTF8String:newProps.glassStyle.c_str()];
  _effectView.material = [glassStyle isEqualToString:@"clear"]
    ? NSVisualEffectMaterialHUDWindow
    : NSVisualEffectMaterialSidebar;
#endif

  [super updateProps:props oldProps:oldProps];
}

- (void)prepareForRecycle
{
  [super prepareForRecycle];

#if TARGET_OS_OSX
  _effectView.blendingMode = NSVisualEffectBlendingModeWithinWindow;
  _effectView.material = NSVisualEffectMaterialSidebar;
  _effectView.state = NSVisualEffectStateActive;
#else
  _effectView.backgroundColor = [UIColor colorWithWhite:1 alpha:0.7];
#endif
  [self setNeedsLayout:YES];
}

- (void)layoutSubviews
{
  [super layoutSubviews];
  _effectView.frame = self.bounds;
}

- (void)updateLayoutMetrics:(const LayoutMetrics &)layoutMetrics
           oldLayoutMetrics:(const LayoutMetrics &)oldLayoutMetrics
{
  [super updateLayoutMetrics:layoutMetrics oldLayoutMetrics:oldLayoutMetrics];
  [self layoutSubviews];
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<GlassEffectViewComponentDescriptor>();
}

@end
