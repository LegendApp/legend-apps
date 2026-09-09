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

// Only the tiny existing selection record is read here; transcript I/O and
// parsing run on a worker while React Native starts.
static void startChatHistoryLoad(void)
{
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    for (NSString *argument in NSProcessInfo.processInfo.arguments) {
      // Benchmarks deliberately discover pinned IDs instead of restoring state.
      if ([argument hasPrefix:@"--chat-history-benchmark="]) {
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
    if (![selected isKindOfClass:NSDictionary.class]) {
      return;
    }
    NSString *provider = selected[@"provider"];
    NSString *path = selected[@"path"];
    NSString *selectedId = settings[@"selectedId"];
    if ([selectedId isKindOfClass:NSString.class] && ![selectedId isEqual:selected[@"id"]]) {
      return;
    }
    if (([provider isEqual:@"codex"] || [provider isEqual:@"claude"])
        && [path isKindOfClass:NSString.class] && path.length > 0
        && [selected[@"id"] isKindOfClass:NSString.class]
        && [selected[@"title"] isKindOfClass:NSString.class]
        && [selected[@"updatedAt"] isKindOfClass:NSNumber.class]) {
      margelo::nitro::legendapps::chathistory::startChatStartupLoad(provider.UTF8String, path.UTF8String);
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
