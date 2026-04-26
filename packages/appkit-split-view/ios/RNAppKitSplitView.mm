#import "RNAppKitSplitView.h"

#import <React/RCTBridgeModule.h>
#import <React/RCTUtils.h>
#import <TargetConditionals.h>

@interface RNAppKitSplitViewMenuTarget : NSObject
@property (nonatomic, weak) RNAppKitSplitView *module;
@end

static RNAppKitSplitViewMenuTarget *RNAppKitSplitViewSharedMenuTarget;

@implementation RNAppKitSplitViewMenuTarget

#if TARGET_OS_OSX
- (void)selectPackage:(NSMenuItem *)sender
{
  NSString *packageId = sender.representedObject;
  if (packageId) {
    [self.module sendMenuAction:@{@"type": @"package", @"id": packageId}];
  }
}

- (void)selectTest:(NSMenuItem *)sender
{
  NSDictionary *payload = sender.representedObject;
  if (payload) {
    [self.module sendMenuAction:@{
      @"type": @"test",
      @"id": payload[@"id"] ?: @"",
      @"packageId": payload[@"packageId"] ?: @"",
    }];
  }
}
#endif

@end

@implementation RNAppKitSplitView

RCT_EXPORT_MODULE(NativeAppKitSplitView)

- (instancetype)init
{
  if (self = [super init]) {
    RNAppKitSplitViewSharedMenuTarget = [RNAppKitSplitViewMenuTarget new];
    RNAppKitSplitViewSharedMenuTarget.module = self;
  }
  return self;
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[@"AppKitSplitViewMenuAction"];
}

- (void)sendMenuAction:(NSDictionary *)payload
{
  [self sendEventWithName:@"AppKitSplitViewMenuAction" body:payload];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeAppKitSplitViewSpecJSI>(params);
}

- (void)configureKitchenSinkMenus:(NSString *)packagesJson testsJson:(NSString *)testsJson
{
#if TARGET_OS_OSX
  RCTExecuteOnMainQueue(^{
    NSArray *packages = [self parseJSONArray:packagesJson];
    NSArray *tests = [self parseJSONArray:testsJson];
    [self installPackagesMenu:packages testsMenu:tests];
  });
#endif
}

- (void)clearKitchenSinkMenus
{
#if TARGET_OS_OSX
  RCTExecuteOnMainQueue(^{
    NSMenu *mainMenu = NSApp.mainMenu;
    [self removeMenuNamed:@"Packages" fromMenu:mainMenu];
    [self removeMenuNamed:@"Test" fromMenu:mainMenu];
  });
#endif
}

- (NSArray *)parseJSONArray:(NSString *)json
{
  NSData *data = [json dataUsingEncoding:NSUTF8StringEncoding];
  if (!data) {
    return @[];
  }

  id value = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
  return [value isKindOfClass:[NSArray class]] ? value : @[];
}

#if TARGET_OS_OSX
- (void)installPackagesMenu:(NSArray *)packages testsMenu:(NSArray *)tests
{
  NSMenu *mainMenu = NSApp.mainMenu;
  if (!mainMenu) {
    return;
  }

  [self removeMenuNamed:@"Packages" fromMenu:mainMenu];
  [self removeMenuNamed:@"Test" fromMenu:mainMenu];

  NSMenuItem *packagesRoot = [[NSMenuItem alloc] initWithTitle:@"Packages" action:nil keyEquivalent:@""];
  NSMenu *packagesMenu = [[NSMenu alloc] initWithTitle:@"Packages"];
  packagesRoot.submenu = packagesMenu;

  for (NSDictionary *package in packages) {
    NSString *title = package[@"title"] ?: package[@"id"] ?: @"Package";
    NSString *packageId = package[@"id"] ?: title;
    NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:title action:@selector(selectPackage:) keyEquivalent:@""];
    item.target = RNAppKitSplitViewSharedMenuTarget;
    item.representedObject = packageId;
    [packagesMenu addItem:item];
  }

  NSMenuItem *testsRoot = [[NSMenuItem alloc] initWithTitle:@"Test" action:nil keyEquivalent:@""];
  NSMenu *testsMenu = [[NSMenu alloc] initWithTitle:@"Test"];
  testsRoot.submenu = testsMenu;

  for (NSDictionary *test in tests) {
    NSString *title = test[@"title"] ?: test[@"id"] ?: @"Test";
    NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:title action:@selector(selectTest:) keyEquivalent:@""];
    item.target = RNAppKitSplitViewSharedMenuTarget;
    item.representedObject = @{
      @"id": test[@"id"] ?: title,
      @"packageId": test[@"packageId"] ?: @"",
    };
    [testsMenu addItem:item];
  }

  NSInteger insertIndex = MAX(1, mainMenu.numberOfItems - 1);
  [mainMenu insertItem:packagesRoot atIndex:insertIndex];
  [mainMenu insertItem:testsRoot atIndex:insertIndex + 1];
}

- (void)removeMenuNamed:(NSString *)title fromMenu:(NSMenu *)menu
{
  NSMenuItem *existing = [menu itemWithTitle:title];
  if (existing) {
    [menu removeItem:existing];
  }
}
#endif

@end
