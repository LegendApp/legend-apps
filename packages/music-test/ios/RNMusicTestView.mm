#import "RNMusicTestView.h"

#import <react/renderer/components/RNMusicTestSpec/ComponentDescriptors.h>
#import <react/renderer/components/RNMusicTestSpec/Props.h>
#import <react/renderer/components/RNMusicTestSpec/RCTComponentViewHelpers.h>

using namespace facebook::react;

@interface RNMusicTestView () <RCTMusicTestViewViewProtocol>
@end

@implementation RNMusicTestView {
#if TARGET_OS_OSX
  NSTextField *_label;
#else
  UILabel *_label;
#endif
}

- (instancetype)init
{
  if (self = [super init]) {
#if TARGET_OS_OSX
    _label = [NSTextField labelWithString:@"Music Test Native"];
    _label.alignment = NSTextAlignmentCenter;
#else
    _label = [UILabel new];
    _label.text = @"Music Test Native";
    _label.textAlignment = NSTextAlignmentCenter;
#endif
    [self addSubview:_label];
  }
  return self;
}

- (void)layoutSubviews
{
  [super layoutSubviews];
  _label.frame = self.bounds;
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<MusicTestViewComponentDescriptor>();
}

@end
