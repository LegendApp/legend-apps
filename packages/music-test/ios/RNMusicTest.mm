#import "RNMusicTest.h"

#import <React/RCTBridgeModule.h>

@implementation RNMusicTest

RCT_EXPORT_MODULE(NativeMusicTest)

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeMusicTestSpecJSI>(params);
}

- (NSString *)getString
{
  return @"Music Test Native";
}

@end
