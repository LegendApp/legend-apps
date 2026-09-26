#import "LegendWindowRegistry.h"
#if TARGET_OS_OSX
@implementation LegendWindowRegistry
+ (instancetype)sharedRegistry
{
  static LegendWindowRegistry *registry;
  static dispatch_once_t once;
  dispatch_once(&once, ^{ registry = [self new]; });
  return registry;
}
- (instancetype)init
{
  if (self = [super init]) {
    _windows = [NSMutableDictionary new];
    _rootViews = [NSMutableDictionary new];
    _moduleNames = [NSMutableDictionary new];
    _titlebarAccessoryControllers = [NSMutableDictionary new];
    _titlebarMaterialViews = [NSMutableDictionary new];
    _toolbarItemConfigs = [NSMutableDictionary new];
    _windowBlurFilters = [NSMutableDictionary new];
    _windowOptions = [NSMutableDictionary new];
    _closeRequestIdentifiers = [NSMutableSet new];
  }
  return self;
}
@end
#endif
