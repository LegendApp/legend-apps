#import "RNSFSymbol.h"

#import <react/renderer/components/RNSFSymbolSpec/ComponentDescriptors.h>
#import <react/renderer/components/RNSFSymbolSpec/Props.h>
#import <react/renderer/components/RNSFSymbolSpec/RCTComponentViewHelpers.h>

using namespace facebook::react;

@interface RNSFSymbol () <RCTSFSymbolViewProtocol>
@end

@implementation RNSFSymbol {
#if TARGET_OS_OSX
  NSImageView *_imageView;
#else
  UIImageView *_imageView;
#endif
  NSString *_symbolName;
  CGFloat _size;
  CGFloat _yOffset;
}

- (instancetype)init
{
  if (self = [super init]) {
    _props = std::make_shared<const SFSymbolProps>();
    _symbolName = @"";
    _size = 24;
    _yOffset = 0;
#if TARGET_OS_OSX
    _imageView = [NSImageView new];
    _imageView.imageScaling = NSImageScaleProportionallyDown;
#else
    _imageView = [UIImageView new];
    _imageView.contentMode = UIViewContentModeScaleAspectFit;
#endif
    [self addSubview:_imageView];
  }
  return self;
}

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps
{
  const auto &newProps = *std::static_pointer_cast<SFSymbolProps const>(props);
  _symbolName = [NSString stringWithUTF8String:newProps.name.c_str()];
  _size = newProps.size == 0 ? 24 : newProps.size;
  _yOffset = newProps.yOffset;

#if TARGET_OS_OSX
  NSString *scale = [NSString stringWithUTF8String:newProps.scale.c_str()];
  NSImageSymbolScale symbolScale = NSImageSymbolScaleMedium;
  if ([scale isEqualToString:@"small"]) {
    symbolScale = NSImageSymbolScaleSmall;
  } else if ([scale isEqualToString:@"large"]) {
    symbolScale = NSImageSymbolScaleLarge;
  }

  NSImage *image = _symbolName.length > 0
    ? [NSImage imageWithSystemSymbolName:_symbolName accessibilityDescription:_symbolName]
    : nil;
  [image setTemplate:YES];
  _imageView.image = image;
  _imageView.symbolConfiguration = [NSImageSymbolConfiguration configurationWithPointSize:_size
                                                                                  weight:NSFontWeightRegular
                                                                                   scale:symbolScale];
  _imageView.contentTintColor = newProps.color
    ? [NSColor colorWithRed:(CGFloat)redFromColor(newProps.color) / 255.0
                      green:(CGFloat)greenFromColor(newProps.color) / 255.0
                       blue:(CGFloat)blueFromColor(newProps.color) / 255.0
                      alpha:(CGFloat)alphaFromColor(newProps.color) / 255.0]
    : NSColor.labelColor;
#else
  if (@available(iOS 13.0, *)) {
    UIImageSymbolScale symbolScale = UIImageSymbolScaleMedium;
    NSString *scale = [NSString stringWithUTF8String:newProps.scale.c_str()];
    if ([scale isEqualToString:@"small"]) {
      symbolScale = UIImageSymbolScaleSmall;
    } else if ([scale isEqualToString:@"large"]) {
      symbolScale = UIImageSymbolScaleLarge;
    }
    UIImageSymbolConfiguration *configuration =
      [UIImageSymbolConfiguration configurationWithPointSize:_size weight:UIImageSymbolWeightRegular scale:symbolScale];
    _imageView.image = [[[UIImage systemImageNamed:_symbolName] imageWithConfiguration:configuration]
      imageWithRenderingMode:UIImageRenderingModeAlwaysTemplate];
    _imageView.tintColor = newProps.color
      ? [UIColor colorWithRed:(CGFloat)redFromColor(newProps.color) / 255.0
                        green:(CGFloat)greenFromColor(newProps.color) / 255.0
                         blue:(CGFloat)blueFromColor(newProps.color) / 255.0
                        alpha:(CGFloat)alphaFromColor(newProps.color) / 255.0]
      : UIColor.labelColor;
  }
#endif

  [self setNeedsLayout:YES];
  [super updateProps:props oldProps:oldProps];
}

- (void)layoutSubviews
{
  [super layoutSubviews];
  CGFloat side = MIN(self.bounds.size.width, self.bounds.size.height);
  CGFloat x = (self.bounds.size.width - side) / 2;
  CGFloat y = (self.bounds.size.height - side) / 2 + _yOffset;
  _imageView.frame = CGRectMake(x, y, side, side);
}

- (void)updateLayoutMetrics:(const LayoutMetrics &)layoutMetrics
           oldLayoutMetrics:(const LayoutMetrics &)oldLayoutMetrics
{
  [super updateLayoutMetrics:layoutMetrics oldLayoutMetrics:oldLayoutMetrics];
  [self layoutSubviews];
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<SFSymbolComponentDescriptor>();
}

@end
