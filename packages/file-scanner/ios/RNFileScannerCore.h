#import <Foundation/Foundation.h>

NS_ASSUME_NONNULL_BEGIN

@interface RNFileScannerOptions : NSObject
@property (nonatomic, copy) NSSet<NSString *> *allowedExtensions;
@property (nonatomic, assign) NSUInteger batchSize;
@property (nonatomic, assign) BOOL includeHidden;
@property (nonatomic, assign) BOOL includeStats;
@property (nonatomic, copy) NSDictionary<NSNumber *, NSSet<NSString *> *> *skipLookup;
@end

typedef NSDictionary *_Nullable (^RNFileScannerMapFileBlock)(NSURL *fileURL,
                                                             NSString *rootPath,
                                                             NSUInteger rootIndex,
                                                             NSString *relativePath,
                                                             BOOL skipped);
typedef void (^RNFileScannerEmitBatchBlock)(NSArray<NSDictionary *> *items,
                                            NSUInteger rootIndex,
                                            NSUInteger completedRoots,
                                            NSUInteger totalRoots);
typedef void (^RNFileScannerProgressBlock)(NSUInteger rootIndex,
                                           NSUInteger completedRoots,
                                           NSUInteger totalRoots);

NSString *RNFileScannerNormalizePath(NSString *path);
NSString *RNFileScannerRelativePath(NSString *fullPath, NSString *rootPath);
NSArray<NSString *> *RNFileScannerNormalizeRoots(NSArray<NSString *> *paths);
NSSet<NSString *> *RNFileScannerExtensionsFromArray(NSArray<NSString *> *_Nullable extensions,
                                                   NSArray<NSString *> *defaultExtensions);
NSDictionary<NSNumber *, NSSet<NSString *> *> *RNFileScannerSkipLookupFromArray(NSArray *_Nullable skipEntries);
NSDictionary *RNFileScannerDefaultFileItem(NSURL *fileURL,
                                           NSString *rootPath,
                                           NSUInteger rootIndex,
                                           NSString *relativePath,
                                           BOOL skipped,
                                           BOOL includeStats);
NSDictionary *RNFileScannerRun(NSArray<NSString *> *paths,
                               RNFileScannerOptions *options,
                               RNFileScannerMapFileBlock _Nullable mapFile,
                               RNFileScannerEmitBatchBlock emitBatch,
                               RNFileScannerProgressBlock emitProgress);
NSString *RNFileScannerJSONString(id object);
id RNFileScannerJSONObjectFromString(NSString *json);

NS_ASSUME_NONNULL_END
