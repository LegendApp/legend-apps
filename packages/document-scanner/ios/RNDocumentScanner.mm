#import "RNDocumentScanner.h"

#import <RNFileScanner/RNFileScannerCore.h>
#import <React/RCTBridgeModule.h>

@implementation RNDocumentScanner {
  BOOL _hasListeners;
}

RCT_EXPORT_MODULE(NativeDocumentScanner)

- (NSArray<NSString *> *)supportedEvents
{
  return @[@"onDocumentScanBatch", @"onDocumentScanProgress", @"onDocumentScanComplete"];
}

- (void)startObserving
{
  _hasListeners = YES;
}

- (void)stopObserving
{
  _hasListeners = NO;
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeDocumentScannerSpecJSI>(params);
}

- (RNFileScannerOptions *)scanOptionsFromJSON:(NSString *)optionsJson
{
  id rawValue = RNFileScannerJSONObjectFromString(optionsJson);
  NSDictionary *rawOptions = [rawValue isKindOfClass:NSDictionary.class] ? rawValue : @{};

  RNFileScannerOptions *options = [RNFileScannerOptions new];
  options.allowedExtensions = RNFileScannerExtensionsFromArray(rawOptions[@"allowedExtensions"], @[@"md", @"mdx"]);
  options.batchSize = [rawOptions[@"batchSize"] unsignedIntegerValue] ?: 64;
  options.includeHidden = [rawOptions[@"includeHidden"] boolValue];
  options.includeStats = rawOptions[@"includeStats"] ? [rawOptions[@"includeStats"] boolValue] : YES;
  options.skipLookup = RNFileScannerSkipLookupFromArray(rawOptions[@"skip"]);
  return options;
}

- (void)scanDocuments:(NSString *)pathsJson
          optionsJson:(NSString *)optionsJson
              resolve:(RCTPromiseResolveBlock)resolve
               reject:(RCTPromiseRejectBlock)reject
{
  id rawPathsValue = RNFileScannerJSONObjectFromString(pathsJson);
  NSArray *rawPaths = [rawPathsValue isKindOfClass:NSArray.class] ? rawPathsValue : @[];
  RNFileScannerOptions *options = [self scanOptionsFromJSON:optionsJson];

  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    NSDictionary *fileResult = RNFileScannerRun(
      rawPaths,
      options,
      nil,
      ^(NSArray<NSDictionary *> *items, NSUInteger rootIndex, NSUInteger completedRoots, NSUInteger totalRoots) {
        if (!self->_hasListeners) {
          return;
        }
        dispatch_async(dispatch_get_main_queue(), ^{
          [self sendEventWithName:@"onDocumentScanBatch"
                             body:@{
                               @"documents": items,
                               @"rootIndex": @(rootIndex),
                               @"completedRoots": @(completedRoots),
                               @"totalRoots": @(totalRoots),
                             }];
        });
      },
      ^(NSUInteger rootIndex, NSUInteger completedRoots, NSUInteger totalRoots) {
        if (!self->_hasListeners) {
          return;
        }
        dispatch_async(dispatch_get_main_queue(), ^{
          [self sendEventWithName:@"onDocumentScanProgress"
                             body:@{
                               @"rootIndex": @(rootIndex),
                               @"completedRoots": @(completedRoots),
                               @"totalRoots": @(totalRoots),
                             }];
        });
      });

    NSDictionary *result = @{
      @"totalDocuments": fileResult[@"totalFiles"] ?: @0,
      @"totalRoots": fileResult[@"totalRoots"] ?: @0,
      @"errors": fileResult[@"errors"] ?: @[],
    };

    dispatch_async(dispatch_get_main_queue(), ^{
      if (self->_hasListeners) {
        [self sendEventWithName:@"onDocumentScanComplete" body:result];
      }
      resolve(RNFileScannerJSONString(result));
    });
  });
}

@end
