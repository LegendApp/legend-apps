#import <Foundation/Foundation.h>
NS_ASSUME_NONNULL_BEGIN
@interface LESourceSearchResult : NSObject
@property (nonatomic, copy) NSArray<NSTextCheckingResult *> *matches;
@property (nonatomic, strong) NSRegularExpression *expression;
@property (nonatomic) BOOL truncated;
@end
// Worker-only pure matching. The caller owns snapshot/cancellation policy.
FOUNDATION_EXPORT LESourceSearchResult *_Nullable LESearchSource(NSString *source, NSString *query, BOOL regex, BOOL caseSensitive, BOOL wholeWord, BOOL (^cancelled)(void), NSError **error);
NS_ASSUME_NONNULL_END
