#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN
// File identity and atomic persistence, independent of editor/window UI.
@interface LESourceFileSession : NSObject
@property (atomic, copy, readonly) NSString *path;
@property (nonatomic, readonly) BOOL hasBOM;
+ (nullable NSDictionary *)signatureAtPath:(NSString *)path;
- (instancetype)initWithPath:(NSString *)path signature:(nullable NSDictionary *)signature hasBOM:(BOOL)hasBOM;
- (BOOL)hasExternalChanges;
// Run on a worker; callers serialize saves. Never overwrites a changed source.
- (BOOL)writeSource:(NSString *)source toPath:(NSString *)path error:(NSError **)error;
@end
NS_ASSUME_NONNULL_END
