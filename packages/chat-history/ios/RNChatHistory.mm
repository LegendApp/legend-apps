#include "../cpp/ChatDocument.hpp"

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
