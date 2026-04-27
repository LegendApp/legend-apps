#import "RNNativeMenu.h"

#import <React/RCTBridgeModule.h>
#import <React/RCTUtils.h>
#import <TargetConditionals.h>

#if TARGET_OS_OSX
#import <AppKit/AppKit.h>
#endif

@interface RNNativeMenu ()
@property (nonatomic, strong) NSMutableDictionary<NSString *, NSArray *> *ownerMenus;
@property (nonatomic, strong) NSMutableDictionary<NSString *, id> *menuItemsByKey;
@end

@implementation RNNativeMenu

RCT_EXPORT_MODULE(NativeMenu)

- (instancetype)init
{
  if (self = [super init]) {
    _ownerMenus = [NSMutableDictionary new];
    _menuItemsByKey = [NSMutableDictionary new];
  }
  return self;
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[@"NativeMenuAction"];
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeMenuSpecJSI>(params);
}

- (NSArray *)parseArrayJSON:(NSString *)json
{
  NSData *data = [json dataUsingEncoding:NSUTF8StringEncoding];
  if (!data) {
    return @[];
  }

  id value = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
  return [value isKindOfClass:[NSArray class]] ? value : @[];
}

- (NSString *)itemKeyForOwner:(NSString *)ownerId itemId:(NSString *)itemId
{
  return [NSString stringWithFormat:@"%@:%@", ownerId ?: @"", itemId ?: @""];
}

- (void)configureMenus:(NSString *)ownerId menusJson:(NSString *)menusJson
{
#if TARGET_OS_OSX
  RCTExecuteOnMainQueue(^{
    [self clearMenus:ownerId];

    NSMenu *mainMenu = NSApp.mainMenu;
    if (!mainMenu || ownerId.length == 0) {
      return;
    }

    NSMutableArray<NSMenuItem *> *installedRoots = [NSMutableArray array];
    NSArray *menus = [self parseArrayJSON:menusJson];

    for (NSDictionary *menuConfig in menus) {
      if (![menuConfig isKindOfClass:[NSDictionary class]]) {
        continue;
      }

      NSString *menuId = [menuConfig[@"id"] isKindOfClass:[NSString class]] ? menuConfig[@"id"] : nil;
      NSString *title = [menuConfig[@"title"] isKindOfClass:[NSString class]] ? menuConfig[@"title"] : menuId;
      if (menuId.length == 0 || title.length == 0) {
        continue;
      }

      NSMenuItem *rootItem = [[NSMenuItem alloc] initWithTitle:title action:nil keyEquivalent:@""];
      NSMenu *submenu = [[NSMenu alloc] initWithTitle:title];
      rootItem.submenu = submenu;

      NSArray *items = [menuConfig[@"items"] isKindOfClass:[NSArray class]] ? menuConfig[@"items"] : @[];
      for (NSDictionary *itemConfig in items) {
        if (![itemConfig isKindOfClass:[NSDictionary class]]) {
          continue;
        }
        [self appendItem:itemConfig ownerId:ownerId menuId:menuId toMenu:submenu];
      }

      NSInteger insertIndex = [self insertionIndexForMenuConfig:menuConfig mainMenu:mainMenu];
      [mainMenu insertItem:rootItem atIndex:insertIndex];
      [installedRoots addObject:rootItem];
    }

    self.ownerMenus[ownerId] = installedRoots;
  });
#endif
}

- (void)updateMenuItems:(NSString *)ownerId patchesJson:(NSString *)patchesJson
{
#if TARGET_OS_OSX
  RCTExecuteOnMainQueue(^{
    NSArray *patches = [self parseArrayJSON:patchesJson];
    for (NSDictionary *patch in patches) {
      if (![patch isKindOfClass:[NSDictionary class]]) {
        continue;
      }
      NSString *itemId = [patch[@"id"] isKindOfClass:[NSString class]] ? patch[@"id"] : nil;
      NSMenuItem *item = self.menuItemsByKey[[self itemKeyForOwner:ownerId itemId:itemId]];
      if (!item) {
        continue;
      }
      [self applyItemConfig:patch toMenuItem:item];
    }
  });
#endif
}

- (void)clearMenus:(NSString *)ownerId
{
#if TARGET_OS_OSX
  RCTExecuteOnMainQueue(^{
    NSArray<NSMenuItem *> *items = self.ownerMenus[ownerId] ?: @[];
    for (NSMenuItem *item in items) {
      [item.menu removeItem:item];
    }
    [self.ownerMenus removeObjectForKey:ownerId];

    NSString *prefix = [NSString stringWithFormat:@"%@:", ownerId ?: @""];
    for (NSString *key in self.menuItemsByKey.allKeys.copy) {
      if ([key hasPrefix:prefix]) {
        [self.menuItemsByKey removeObjectForKey:key];
      }
    }
  });
#endif
}

- (void)clearAllMenus
{
#if TARGET_OS_OSX
  RCTExecuteOnMainQueue(^{
    for (NSString *ownerId in self.ownerMenus.allKeys.copy) {
      [self clearMenus:ownerId];
    }
  });
#endif
}

#if TARGET_OS_OSX
- (NSInteger)insertionIndexForMenuConfig:(NSDictionary *)menuConfig mainMenu:(NSMenu *)mainMenu
{
  NSDictionary *placement = [menuConfig[@"placement"] isKindOfClass:[NSDictionary class]] ? menuConfig[@"placement"] : nil;
  NSString *before = [placement[@"before"] isKindOfClass:[NSString class]] ? placement[@"before"] : nil;
  NSString *after = [placement[@"after"] isKindOfClass:[NSString class]] ? placement[@"after"] : nil;

  if (before.length > 0) {
    NSInteger index = [mainMenu indexOfItemWithTitle:before];
    if (index >= 0) {
      return index;
    }
  }

  if (after.length > 0) {
    NSInteger index = [mainMenu indexOfItemWithTitle:after];
    if (index >= 0) {
      return MIN(index + 1, mainMenu.numberOfItems);
    }
  }

  NSInteger windowIndex = [mainMenu indexOfItemWithTitle:@"Window"];
  return windowIndex >= 0 ? windowIndex : mainMenu.numberOfItems;
}

- (void)appendItem:(NSDictionary *)config ownerId:(NSString *)ownerId menuId:(NSString *)menuId toMenu:(NSMenu *)menu
{
  if ([config[@"separator"] boolValue]) {
    [menu addItem:[NSMenuItem separatorItem]];
    return;
  }

  NSString *itemId = [config[@"id"] isKindOfClass:[NSString class]] ? config[@"id"] : nil;
  NSString *title = [config[@"title"] isKindOfClass:[NSString class]] ? config[@"title"] : itemId;
  if (itemId.length == 0 || title.length == 0) {
    return;
  }

  NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:title action:@selector(handleMenuAction:) keyEquivalent:@""];
  item.target = self;
  item.representedObject = @{
    @"ownerId": ownerId ?: @"",
    @"menuId": menuId ?: @"",
    @"itemId": itemId ?: @"",
    @"payload": [config[@"payload"] isKindOfClass:[NSDictionary class]] ? config[@"payload"] : @{},
  };
  [self applyItemConfig:config toMenuItem:item];
  [menu addItem:item];
  self.menuItemsByKey[[self itemKeyForOwner:ownerId itemId:itemId]] = item;
}

- (void)applyItemConfig:(NSDictionary *)config toMenuItem:(NSMenuItem *)item
{
  NSString *title = [config[@"title"] isKindOfClass:[NSString class]] ? config[@"title"] : nil;
  if (title) {
    item.title = title;
  }

  NSNumber *enabled = [config[@"enabled"] isKindOfClass:[NSNumber class]] ? config[@"enabled"] : nil;
  if (enabled) {
    item.enabled = enabled.boolValue;
  }

  NSNumber *checked = [config[@"checked"] isKindOfClass:[NSNumber class]] ? config[@"checked"] : nil;
  if (checked) {
    item.state = checked.boolValue ? NSControlStateValueOn : NSControlStateValueOff;
  }

  NSDictionary *shortcut = [config[@"shortcut"] isKindOfClass:[NSDictionary class]] ? config[@"shortcut"] : nil;
  if (shortcut || config[@"shortcut"] == (id)kCFNull) {
    NSString *key = [shortcut[@"key"] isKindOfClass:[NSString class]] ? shortcut[@"key"] : @"";
    NSNumber *modifiers = [shortcut[@"modifiers"] isKindOfClass:[NSNumber class]] ? shortcut[@"modifiers"] : @0;
    item.keyEquivalent = key ?: @"";
    item.keyEquivalentModifierMask = key.length > 0 ? modifiers.unsignedIntegerValue : 0;
  }
}

- (void)handleMenuAction:(NSMenuItem *)sender
{
  NSDictionary *payload = [sender.representedObject isKindOfClass:[NSDictionary class]] ? sender.representedObject : @{};
  [self sendEventWithName:@"NativeMenuAction" body:payload];
}
#endif

@end
