#import <Foundation/Foundation.h>
#import "LegendWindowRegistry.h"

@interface TestModule : NSObject
@property (nonatomic, strong) LegendWindowRegistry *registry;
@end
@implementation TestModule
- (instancetype)init {
  if (self = [super init]) _registry = LegendWindowRegistry.sharedRegistry;
  return self;
}
@end

int main() {
  @autoreleasepool {
    __weak NSObject *surface;
    __weak TestModule *oldModule;
    @autoreleasepool {
      TestModule *module = [TestModule new];
      oldModule = module;
      NSObject *root = [NSObject new];
      surface = root;
      module.registry.rootViews[@"document"] = root;
      module.registry.moduleNames[@"document"] = @"DocumentWindow";
      module.registry.windowOptions[@"document"] = @{@"restoreOnLaunch": @YES};
      [module.registry.closeRequestIdentifiers addObject:@"document"];
    }
    NSCAssert(oldModule == nil, @"Registry must not retain the obsolete runtime module");
    NSCAssert(surface != nil, @"A native surface must survive its runtime module");
    TestModule *replacement = [TestModule new];
    NSCAssert(replacement.registry.rootViews[@"document"] == surface, @"Reload must adopt the same surface");
    NSCAssert([replacement.registry.moduleNames[@"document"] isEqual:@"DocumentWindow"], @"Module identity must survive reload");
    NSCAssert([replacement.registry.closeRequestIdentifiers containsObject:@"document"], @"Close policy must survive reload");
    NSCAssert([replacement.registry.windowOptions[@"document"][@"restoreOnLaunch"] boolValue], @"Restoration policy must survive reload");
    [replacement.registry.rootViews removeObjectForKey:@"document"];
    NSCAssert(surface == nil, @"Closing a window must release its registry-owned surface");
    puts("Window registry survives runtime replacement and releases closed surfaces.");
  }
}
