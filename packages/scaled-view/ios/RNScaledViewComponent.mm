#import "RNScaledViewComponent.h"

#import <react/renderer/components/RNScaledViewSpec/ComponentDescriptors.h>
#import <react/renderer/components/RNScaledViewSpec/Props.h>
#import <react/renderer/components/RNScaledViewSpec/RCTComponentViewHelpers.h>

using namespace facebook::react;

@interface RNScaledViewComponent () <RCTScaledViewViewProtocol>
@end

@implementation RNScaledViewComponent {
  CGFloat _contentHeight;
  CGFloat _contentWidth;
}

- (instancetype)initWithFrame:(CGRect)frame
{
  if (self = [super initWithFrame:frame]) {
    _props = std::make_shared<const ScaledViewProps>();
    _contentHeight = 0;
    _contentWidth = 0;
    self.wantsLayer = YES;
    self.layer.masksToBounds = YES;
  }
  return self;
}

- (void)applyContentBounds
{
  if (_contentWidth <= 0 || _contentHeight <= 0) {
    return;
  }

  NSRect nextBounds = NSMakeRect(0, 0, _contentWidth, _contentHeight);
  if (!NSEqualRects(self.bounds, nextBounds)) {
    self.bounds = nextBounds;
  }
}

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps
{
  const auto &newProps = *std::static_pointer_cast<ScaledViewProps const>(props);
  _contentHeight = newProps.contentHeight;
  _contentWidth = newProps.contentWidth;
  [super updateProps:props oldProps:oldProps];
  [self applyContentBounds];
}

- (void)updateLayoutMetrics:(const LayoutMetrics &)layoutMetrics
           oldLayoutMetrics:(const LayoutMetrics &)oldLayoutMetrics
{
  [super updateLayoutMetrics:layoutMetrics oldLayoutMetrics:oldLayoutMetrics];
  [self applyContentBounds];
}

- (void)layout
{
  [super layout];
  [self applyContentBounds];
}

- (void)prepareForRecycle
{
  [super prepareForRecycle];
  _contentHeight = 0;
  _contentWidth = 0;
  self.bounds = NSMakeRect(0, 0, NSWidth(self.frame), NSHeight(self.frame));
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<ScaledViewComponentDescriptor>();
}

@end
