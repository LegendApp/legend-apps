#include "../cpp/ChatDocument.hpp"
#include "../cpp/ChatPrefetch.hpp"

typedef NSString *_Nonnull (^ENRMNativeMarkdownProvider)(NSString *blockId);
extern void ENRMSetNativeMarkdownProvider(ENRMNativeMarkdownProvider _Nullable provider);

using margelo::nitro::legendapps::chathistory::ChatDocumentRegistry;
using margelo::nitro::legendapps::chathistory::prefetchChatFile;

static NSDictionary *initialChatFromBenchmarkArguments(void)
{
  static NSString * const prefix = @"--chat-history-benchmark=";
  for (NSString *argument in NSProcessInfo.processInfo.arguments) {
    if (![argument hasPrefix:prefix]) {
      continue;
    }
    NSString *encoded = [argument substringFromIndex:prefix.length];
    NSString *decoded = encoded.stringByRemovingPercentEncoding;
    NSData *data = [decoded dataUsingEncoding:NSUTF8StringEncoding];
    id value = data ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil] : nil;
    NSDictionary *config = [value isKindOfClass:NSDictionary.class] ? value : nil;
    NSArray *fixtures = [config[@"fixtures"] isKindOfClass:NSArray.class] ? config[@"fixtures"] : nil;
    return [fixtures.firstObject isKindOfClass:NSDictionary.class] ? fixtures.firstObject : nil;
  }
  return nil;
}

static NSDictionary *initialChatFromSavedSettings(void)
{
  NSDictionary *info = NSBundle.mainBundle.infoDictionary;
  NSString *displayName = [info[@"CFBundleDisplayName"] isKindOfClass:NSString.class] ? info[@"CFBundleDisplayName"] : nil;
  NSString *bundleName = [info[@"CFBundleName"] isKindOfClass:NSString.class] ? info[@"CFBundleName"] : nil;
  NSString *bundleIdentifier = NSBundle.mainBundle.bundleIdentifier;
  NSString *folderName = displayName.length > 0
    ? displayName
    : (bundleName.length > 0 ? bundleName : bundleIdentifier);
  NSURL *applicationSupport = [[NSFileManager defaultManager] URLsForDirectory:NSApplicationSupportDirectory
                                                                     inDomains:NSUserDomainMask].firstObject;
  if (applicationSupport == nil || folderName.length == 0) {
    return nil;
  }
  NSURL *settingsURL = [[[applicationSupport URLByAppendingPathComponent:folderName isDirectory:YES]
    URLByAppendingPathComponent:@"chat-history" isDirectory:YES]
    URLByAppendingPathComponent:@"settings.json" isDirectory:NO];
  NSData *data = [NSData dataWithContentsOfURL:settingsURL];
  id value = data ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil] : nil;
  NSDictionary *settings = [value isKindOfClass:NSDictionary.class] ? value : nil;
  return [settings[@"selectedChat"] isKindOfClass:NSDictionary.class] ? settings[@"selectedChat"] : nil;
}

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

@interface RNChatHistoryPrefetch : NSObject
@end

@implementation RNChatHistoryPrefetch

+ (void)prepareInitialChat
{
  NSDictionary *chat = initialChatFromBenchmarkArguments() ?: initialChatFromSavedSettings();
  NSString *provider = [chat[@"provider"] isKindOfClass:NSString.class] ? chat[@"provider"] : nil;
  NSString *path = [chat[@"path"] isKindOfClass:NSString.class] ? chat[@"path"] : nil;
  if (provider.length > 0 && path.length > 0 && [NSFileManager.defaultManager isReadableFileAtPath:path]) {
    prefetchChatFile(std::string(provider.UTF8String), std::string(path.UTF8String));
  }
}

@end

@implementation RNChatHistoryMarkdownProvider

+ (void)load
{
  ENRMSetNativeMarkdownProvider(^NSString *(NSString *blockId) {
    return chatMarkdownForBlockId(blockId);
  });
}

@end
