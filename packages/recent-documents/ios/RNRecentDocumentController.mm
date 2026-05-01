#import "RNRecentDocumentEvents.h"

#import <TargetConditionals.h>

#if TARGET_OS_OSX
#import <AppKit/AppKit.h>

@interface RNRecentDocumentController : NSDocumentController
@end

@implementation RNRecentDocumentController

- (void)openDocumentWithContentsOfURL:(NSURL *)url
                              display:(BOOL)displayDocument
                    completionHandler:(void (^)(NSDocument *_Nullable document,
                                                 BOOL documentWasAlreadyOpen,
                                                 NSError *_Nullable error))completionHandler
{
  [self emitOpenDocumentURL:url];

  if (completionHandler) {
    completionHandler(nil, NO, nil);
  }
}

- (void)reopenDocumentForURL:(NSURL *)urlOrNil
           withContentsOfURL:(NSURL *)contentsURL
                     display:(BOOL)displayDocument
           completionHandler:(void (^)(NSDocument *_Nullable document,
                                        BOOL documentWasAlreadyOpen,
                                        NSError *_Nullable error))completionHandler
{
  [self emitOpenDocumentURL:contentsURL ?: urlOrNil];

  if (completionHandler) {
    completionHandler(nil, NO, nil);
  }
}

- (void)emitOpenDocumentURL:(NSURL *)url
{
  if (!url.isFileURL || url.path.length == 0) {
    return;
  }

  [[NSNotificationCenter defaultCenter] postNotificationName:RNRecentDocumentOpenNotification
                                                      object:self
                                                    userInfo:@{RNRecentDocumentURLKey : url}];
}

@end
#endif
