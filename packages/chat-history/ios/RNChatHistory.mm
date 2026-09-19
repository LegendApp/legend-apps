#include "../cpp/ChatDocument.hpp"
#include "../cpp/ChatStartupLoad.hpp"

#import <Foundation/Foundation.h>
#import <AppKit/AppKit.h>

typedef NSString *_Nonnull (^ENRMNativeMarkdownProvider)(NSString *blockId);
extern void ENRMSetNativeMarkdownProvider(ENRMNativeMarkdownProvider _Nullable provider);

using margelo::nitro::legendapps::chathistory::ChatDocumentRegistry;

static NSString *chatMarkdownForBlockId(NSString *blockId)
{
  if (blockId.length == 0) {
    return @"";
  }
  const std::string markdown = ChatDocumentRegistry::shared().markdownForBlockId(std::string([blockId UTF8String]));
  return [[NSString alloc] initWithBytes:markdown.data()
                                  length:markdown.size()
                                encoding:NSUTF8StringEncoding] ?: @"";
}

@interface RNChatHistoryMarkdownProvider : NSObject
@end

@implementation RNChatHistoryMarkdownProvider

+ (void)load
{
  ENRMSetNativeMarkdownProvider(^NSString *(NSString *blockId) {
    return chatMarkdownForBlockId(blockId);
  });
}

@end

// Only launch arguments and the tiny selection record are read here. Catalog
// discovery and transcript parsing run on workers while React Native starts.
static void startChatHistoryLoad(void)
{
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    for (NSString *argument in NSProcessInfo.processInfo.arguments) {
      if ([argument hasPrefix:@"--chat-history-benchmark="]) {
        NSString *encoded = [argument substringFromIndex:[@"--chat-history-benchmark=" length]];
        NSData *data = [encoded.stringByRemovingPercentEncoding dataUsingEncoding:NSUTF8StringEncoding];
        id config = data ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil] : nil;
        if ([config isKindOfClass:NSDictionary.class] && [config[@"version"] isEqual:@2]) {
          id targets = config[@"targets"];
          id target = [targets isKindOfClass:NSArray.class] && [targets count] == 2 ? targets[0] : nil;
          NSString *identifier = [target isKindOfClass:NSDictionary.class] ? target[@"id"] : nil;
          NSString *provider = [target isKindOfClass:NSDictionary.class] ? target[@"provider"] : nil;
          if ([identifier isKindOfClass:NSString.class] && identifier.length > 0
              && ([provider isEqual:@"codex"] || [provider isEqual:@"claude"])
              && [identifier hasPrefix:[provider stringByAppendingString:@":"]]) {
            // Same full catalog and pinned-ID lookup as JS, after process launch.
            // No fixture path, persisted document, or skipped discovery work.
            margelo::nitro::legendapps::chathistory::startChatStartupCatalog(1000000, identifier.UTF8String, true, true);
          }
        }
        return;
      }
    }
    NSDictionary *info = NSBundle.mainBundle.infoDictionary;
    NSString *folder = info[@"CFBundleDisplayName"];
    if (![folder isKindOfClass:NSString.class] || folder.length == 0) {
      folder = info[@"CFBundleName"];
    }
    if (![folder isKindOfClass:NSString.class] || folder.length == 0) {
      folder = NSBundle.mainBundle.bundleIdentifier ?: @"Legend Desktop";
    }
    NSURL *root = [NSFileManager.defaultManager URLsForDirectory:NSApplicationSupportDirectory
                                                     inDomains:NSUserDomainMask].firstObject;
    NSURL *settingsURL = [[root URLByAppendingPathComponent:folder isDirectory:YES]
        URLByAppendingPathComponent:@"chat-history/settings.json"];
    NSData *data = settingsURL ? [NSData dataWithContentsOfURL:settingsURL] : nil;
    id settings = data ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil] : nil;
    id selected = [settings isKindOfClass:NSDictionary.class] ? settings[@"selectedChat"] : nil;
    NSString *selectedId = [settings isKindOfClass:NSDictionary.class] ? settings[@"selectedId"] : nil;
    if (![selected isKindOfClass:NSDictionary.class]) {
      margelo::nitro::legendapps::chathistory::startChatStartupCatalog(20,
          [selectedId isKindOfClass:NSString.class] ? selectedId.UTF8String : "");
      return;
    }
    NSString *provider = selected[@"provider"];
    NSString *path = selected[@"path"];
    if ([selectedId isKindOfClass:NSString.class] && ![selectedId isEqual:selected[@"id"]]) {
      margelo::nitro::legendapps::chathistory::startChatStartupCatalog(20, selectedId.UTF8String);
      return;
    }
    if (([provider isEqual:@"codex"] || [provider isEqual:@"claude"])
        && [path isKindOfClass:NSString.class] && path.length > 0
        && [selected[@"id"] isKindOfClass:NSString.class]
        && [selected[@"title"] isKindOfClass:NSString.class]
        && [selected[@"updatedAt"] isKindOfClass:NSNumber.class]) {
      margelo::nitro::legendapps::chathistory::startChatStartupLoad(provider.UTF8String, path.UTF8String);
      // A saved selection already starts parsing independently of discovery.
      margelo::nitro::legendapps::chathistory::startChatStartupCatalog(20, "", false);
    } else {
      margelo::nitro::legendapps::chathistory::startChatStartupCatalog(20,
          [selectedId isKindOfClass:NSString.class] ? selectedId.UTF8String : "");
    }
  });
}

@interface RNChatHistoryStartup : NSObject
@end

@implementation RNChatHistoryStartup

+ (void)load
{
  [NSNotificationCenter.defaultCenter addObserver:self
                                        selector:@selector(applicationWillFinishLaunching:)
                                            name:NSApplicationWillFinishLaunchingNotification
                                          object:nil];
}

+ (void)applicationWillFinishLaunching:(NSNotification *)notification
{
  [NSNotificationCenter.defaultCenter removeObserver:self
                                               name:NSApplicationWillFinishLaunchingNotification
                                             object:nil];
  NSString *appId = NSProcessInfo.processInfo.environment[@"LEGEND_APP"]
      ?: NSBundle.mainBundle.infoDictionary[@"LegendAppId"];
  if ([appId isEqualToString:@"chat-history"]) {
    startChatHistoryLoad();
  }
}

@end
