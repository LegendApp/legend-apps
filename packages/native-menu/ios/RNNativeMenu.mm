#import "RNNativeMenu.h"

#import <React/RCTBridgeModule.h>
#import <React/RCTUtils.h>
#import <TargetConditionals.h>

#if TARGET_OS_OSX
#import <AppKit/AppKit.h>
#endif

@interface RNNativeMenu ()
@property (nonatomic, strong) NSMutableDictionary<NSString *, NSArray *> *ownerMenus;
@property (nonatomic, strong) NSMutableDictionary<NSString *, NSArray *> *ownerMergedMenuItems;
@property (nonatomic, strong) NSMutableDictionary<NSString *, NSArray *> *ownerBoundMenuItems;
@property (nonatomic, strong) NSMutableDictionary<NSString *, id> *menuItemsByKey;
#if TARGET_OS_OSX
- (NSMenuItem *)appendItem:(NSDictionary *)config ownerId:(NSString *)ownerId menuId:(NSString *)menuId toMenu:(NSMenu *)menu;
- (NSMenuItem *)targetItemForConfig:(NSDictionary *)config inMenu:(NSMenu *)menu;
- (NSDictionary *)representedObjectForConfig:(NSDictionary *)config ownerId:(NSString *)ownerId menuId:(NSString *)menuId;
- (void)bindExistingItem:(NSMenuItem *)item
                  config:(NSDictionary *)config
                 ownerId:(NSString *)ownerId
                  menuId:(NSString *)menuId
            boundRecords:(NSMutableArray *)boundRecords;
- (void)restoreBoundItem:(NSDictionary *)record;
#endif
@end

@implementation RNNativeMenu

RCT_EXPORT_MODULE(NativeMenu)

- (instancetype)init
{
  if (self = [super init]) {
    _ownerMenus = [NSMutableDictionary new];
    _ownerMergedMenuItems = [NSMutableDictionary new];
    _ownerBoundMenuItems = [NSMutableDictionary new];
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
    NSMutableArray<NSMenuItem *> *installedMergedItems = [NSMutableArray array];
    NSMutableArray<NSDictionary *> *installedBoundItems = [NSMutableArray array];
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

      NSMenuItem *rootItem = [mainMenu itemWithTitle:title];
      BOOL isMergedMenu = rootItem.submenu != nil;
      NSMenu *submenu = rootItem.submenu;

      if (!submenu) {
        rootItem = [[NSMenuItem alloc] initWithTitle:title action:nil keyEquivalent:@""];
        submenu = [[NSMenu alloc] initWithTitle:title];
        rootItem.submenu = submenu;
      }

      NSArray *items = [menuConfig[@"items"] isKindOfClass:[NSArray class]] ? menuConfig[@"items"] : @[];
      for (NSDictionary *itemConfig in items) {
        if (![itemConfig isKindOfClass:[NSDictionary class]]) {
          continue;
        }

        NSMenuItem *targetItem = [self targetItemForConfig:itemConfig inMenu:submenu];
        if (targetItem) {
          [self bindExistingItem:targetItem config:itemConfig ownerId:ownerId menuId:menuId boundRecords:installedBoundItems];
        } else {
          NSMenuItem *installedItem = [self appendItem:itemConfig ownerId:ownerId menuId:menuId toMenu:submenu];
          if (isMergedMenu && installedItem) {
            [installedMergedItems addObject:installedItem];
          }
        }
      }

      if (!isMergedMenu) {
        NSInteger insertIndex = [self insertionIndexForMenuConfig:menuConfig mainMenu:mainMenu];
        [mainMenu insertItem:rootItem atIndex:insertIndex];
        [installedRoots addObject:rootItem];
      }
    }

    self.ownerMenus[ownerId] = installedRoots;
    self.ownerMergedMenuItems[ownerId] = installedMergedItems;
    self.ownerBoundMenuItems[ownerId] = installedBoundItems;
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
    NSArray<NSDictionary *> *boundItems = self.ownerBoundMenuItems[ownerId] ?: @[];
    for (NSDictionary *record in boundItems) {
      [self restoreBoundItem:record];
    }
    [self.ownerBoundMenuItems removeObjectForKey:ownerId];

    NSArray<NSMenuItem *> *mergedItems = self.ownerMergedMenuItems[ownerId] ?: @[];
    for (NSMenuItem *item in mergedItems) {
      if (item.menu) {
        [item.menu removeItem:item];
      }
    }
    [self.ownerMergedMenuItems removeObjectForKey:ownerId];

    NSArray<NSMenuItem *> *rootItems = self.ownerMenus[ownerId] ?: @[];
    for (NSMenuItem *item in rootItems) {
      if (item.menu) {
        [item.menu removeItem:item];
      }
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
- (NSString *)normalizedMenuTitle:(NSString *)title
{
  return [title stringByReplacingOccurrencesOfString:@"..." withString:@"…"];
}

- (NSMenuItem *)targetItemForConfig:(NSDictionary *)config inMenu:(NSMenu *)menu
{
  NSString *targetTitle = [config[@"targetTitle"] isKindOfClass:[NSString class]] ? config[@"targetTitle"] : nil;
  if (targetTitle.length == 0) {
    return nil;
  }

  NSString *normalizedTargetTitle = [self normalizedMenuTitle:targetTitle];
  for (NSMenuItem *item in menu.itemArray) {
    if ([[self normalizedMenuTitle:item.title ?: @""] isEqualToString:normalizedTargetTitle]) {
      return item;
    }
  }
  return nil;
}

- (NSDictionary *)representedObjectForConfig:(NSDictionary *)config ownerId:(NSString *)ownerId menuId:(NSString *)menuId
{
  NSString *itemId = [config[@"id"] isKindOfClass:[NSString class]] ? config[@"id"] : @"";
  return @{
    @"ownerId": ownerId ?: @"",
    @"menuId": menuId ?: @"",
    @"itemId": itemId ?: @"",
    @"payload": [config[@"payload"] isKindOfClass:[NSDictionary class]] ? config[@"payload"] : @{},
  };
}

- (void)bindExistingItem:(NSMenuItem *)item
                  config:(NSDictionary *)config
                 ownerId:(NSString *)ownerId
                  menuId:(NSString *)menuId
            boundRecords:(NSMutableArray *)boundRecords
{
  NSString *itemId = [config[@"id"] isKindOfClass:[NSString class]] ? config[@"id"] : nil;
  if (itemId.length == 0) {
    return;
  }

  [boundRecords addObject:@{
    @"item": item,
    @"target": item.target ?: (id)kCFNull,
    @"action": item.action ? NSStringFromSelector(item.action) : @"",
    @"representedObject": item.representedObject ?: (id)kCFNull,
    @"enabled": @(item.enabled),
    @"state": @(item.state),
    @"title": item.title ?: @"",
    @"keyEquivalent": item.keyEquivalent ?: @"",
    @"keyEquivalentModifierMask": @(item.keyEquivalentModifierMask),
    @"submenu": item.submenu ?: (id)kCFNull,
  }];

  item.target = self;
  item.action = @selector(handleMenuAction:);
  item.representedObject = [self representedObjectForConfig:config ownerId:ownerId menuId:menuId];
  [self applyItemConfig:config toMenuItem:item];
  self.menuItemsByKey[[self itemKeyForOwner:ownerId itemId:itemId]] = item;
}

- (void)restoreBoundItem:(NSDictionary *)record
{
  NSMenuItem *item = [record[@"item"] isKindOfClass:[NSMenuItem class]] ? record[@"item"] : nil;
  if (!item) {
    return;
  }

  id target = record[@"target"];
  item.target = target == (id)kCFNull ? nil : target;

  NSString *action = [record[@"action"] isKindOfClass:[NSString class]] ? record[@"action"] : @"";
  item.action = action.length > 0 ? NSSelectorFromString(action) : nil;

  id representedObject = record[@"representedObject"];
  item.representedObject = representedObject == (id)kCFNull ? nil : representedObject;
  item.enabled = [record[@"enabled"] boolValue];
  item.state = [record[@"state"] integerValue];
  item.title = [record[@"title"] isKindOfClass:[NSString class]] ? record[@"title"] : item.title;
  item.keyEquivalent = [record[@"keyEquivalent"] isKindOfClass:[NSString class]] ? record[@"keyEquivalent"] : item.keyEquivalent;
  item.keyEquivalentModifierMask = [record[@"keyEquivalentModifierMask"] unsignedIntegerValue];

  id submenu = record[@"submenu"];
  item.submenu = submenu == (id)kCFNull ? nil : submenu;
}

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

- (NSMenuItem *)appendItem:(NSDictionary *)config ownerId:(NSString *)ownerId menuId:(NSString *)menuId toMenu:(NSMenu *)menu
{
  if ([config[@"separator"] boolValue]) {
    NSMenuItem *separator = [NSMenuItem separatorItem];
    [menu addItem:separator];
    return separator;
  }

  NSString *itemId = [config[@"id"] isKindOfClass:[NSString class]] ? config[@"id"] : nil;
  NSString *title = [config[@"title"] isKindOfClass:[NSString class]] ? config[@"title"] : itemId;
  if (itemId.length == 0 || title.length == 0) {
    return nil;
  }

  NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:title action:@selector(handleMenuAction:) keyEquivalent:@""];
  item.target = self;
  item.representedObject = [self representedObjectForConfig:config ownerId:ownerId menuId:menuId];
  [self applyItemConfig:config toMenuItem:item];
  [menu addItem:item];
  self.menuItemsByKey[[self itemKeyForOwner:ownerId itemId:itemId]] = item;
  return item;
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

- (BOOL)validateMenuItem:(NSMenuItem *)menuItem
{
  return menuItem.enabled;
}
#endif

@end
