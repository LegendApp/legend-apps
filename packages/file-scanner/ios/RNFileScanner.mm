#import "RNFileScanner.h"
#import "RNFileScannerCore.h"

#import <React/RCTBridgeModule.h>

@implementation RNFileScanner {
  BOOL _hasListeners;
}

RCT_EXPORT_MODULE(NativeFileScanner)

- (NSArray<NSString *> *)supportedEvents
{
  return @[@"onFileScanBatch", @"onFileScanProgress", @"onFileScanComplete"];
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
  return std::make_shared<facebook::react::NativeFileScannerSpecJSI>(params);
}

- (RNFileScannerOptions *)scanOptionsFromJSON:(NSString *)optionsJson
{
  id rawValue = RNFileScannerJSONObjectFromString(optionsJson);
  NSDictionary *rawOptions = [rawValue isKindOfClass:NSDictionary.class] ? rawValue : @{};

  RNFileScannerOptions *options = [RNFileScannerOptions new];
  options.allowedExtensions = RNFileScannerExtensionsFromArray(rawOptions[@"allowedExtensions"], @[]);
  options.batchSize = [rawOptions[@"batchSize"] unsignedIntegerValue] ?: 64;
  options.includeHidden = [rawOptions[@"includeHidden"] boolValue];
  options.includeStats = [rawOptions[@"includeStats"] boolValue];
  options.skipLookup = RNFileScannerSkipLookupFromArray(rawOptions[@"skip"]);
  return options;
}

- (void)scanFiles:(NSString *)pathsJson
      optionsJson:(NSString *)optionsJson
          resolve:(RCTPromiseResolveBlock)resolve
           reject:(RCTPromiseRejectBlock)reject
{
  id rawPathsValue = RNFileScannerJSONObjectFromString(pathsJson);
  NSArray *rawPaths = [rawPathsValue isKindOfClass:NSArray.class] ? rawPathsValue : @[];
  RNFileScannerOptions *options = [self scanOptionsFromJSON:optionsJson];

  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    NSDictionary *result = RNFileScannerRun(
      rawPaths,
      options,
      nil,
      ^(NSArray<NSDictionary *> *items, NSUInteger rootIndex, NSUInteger completedRoots, NSUInteger totalRoots) {
        if (!self->_hasListeners) {
          return;
        }
        dispatch_async(dispatch_get_main_queue(), ^{
          [self sendEventWithName:@"onFileScanBatch"
                             body:@{
                               @"files": items,
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
          [self sendEventWithName:@"onFileScanProgress"
                             body:@{
                               @"rootIndex": @(rootIndex),
                               @"completedRoots": @(completedRoots),
                               @"totalRoots": @(totalRoots),
                             }];
        });
      });

    dispatch_async(dispatch_get_main_queue(), ^{
      if (self->_hasListeners) {
        [self sendEventWithName:@"onFileScanComplete" body:result];
      }
      resolve(RNFileScannerJSONString(result));
    });
  });
}

@end
