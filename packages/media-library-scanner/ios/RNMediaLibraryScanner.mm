#import "RNMediaLibraryScanner.h"

#import <RNFileScanner/RNFileScannerCore.h>
#import <RNMediaTags/RNMediaTagsCore.h>
#import <React/RCTBridgeModule.h>

@implementation RNMediaLibraryScanner {
  BOOL _hasListeners;
}

RCT_EXPORT_MODULE(NativeMediaLibraryScanner)

- (NSArray<NSString *> *)supportedEvents
{
  return @[@"onMediaScanBatch", @"onMediaScanProgress", @"onMediaScanComplete"];
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
  return std::make_shared<facebook::react::NativeMediaLibraryScannerSpecJSI>(params);
}

- (RNFileScannerOptions *)scanOptionsFromJSON:(NSString *)optionsJson
{
  id rawValue = RNFileScannerJSONObjectFromString(optionsJson);
  NSDictionary *rawOptions = [rawValue isKindOfClass:NSDictionary.class] ? rawValue : @{};

  NSArray *audioExtensions = [rawOptions[@"allowedExtensions"] isKindOfClass:NSArray.class]
    ? rawOptions[@"allowedExtensions"]
    : RNMediaTagsDefaultAudioExtensions();
  NSMutableArray *scanExtensions = [NSMutableArray arrayWithArray:audioExtensions];
  [scanExtensions addObjectsFromArray:RNMediaTagsPlaylistExtensions()];

  RNFileScannerOptions *options = [RNFileScannerOptions new];
  options.allowedExtensions = RNFileScannerExtensionsFromArray(scanExtensions, @[]);
  options.batchSize = [rawOptions[@"batchSize"] unsignedIntegerValue] ?: 32;
  options.includeHidden = [rawOptions[@"includeHidden"] boolValue];
  options.includeStats = NO;
  options.skipLookup = RNFileScannerSkipLookupFromArray(rawOptions[@"skip"]);
  return options;
}

- (void)scanMediaLibrary:(NSString *)pathsJson
                cacheDir:(NSString *)cacheDir
            optionsJson:(NSString *)optionsJson
                resolve:(RCTPromiseResolveBlock)resolve
                 reject:(RCTPromiseRejectBlock)reject
{
  id rawPathsValue = RNFileScannerJSONObjectFromString(pathsJson);
  NSArray *rawPaths = [rawPathsValue isKindOfClass:NSArray.class] ? rawPathsValue : @[];
  id rawOptionsValue = RNFileScannerJSONObjectFromString(optionsJson);
  NSDictionary *rawOptions = [rawOptionsValue isKindOfClass:NSDictionary.class] ? rawOptionsValue : @{};
  RNFileScannerOptions *options = [self scanOptionsFromJSON:optionsJson];
  BOOL includeArtwork = [rawOptions[@"includeArtwork"] boolValue];
  NSArray *audioExtensionsArray = [rawOptions[@"allowedExtensions"] isKindOfClass:NSArray.class]
    ? rawOptions[@"allowedExtensions"]
    : RNMediaTagsDefaultAudioExtensions();
  NSSet *audioExtensions = RNFileScannerExtensionsFromArray(audioExtensionsArray, RNMediaTagsDefaultAudioExtensions());

  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    NSMutableArray<NSDictionary *> *playlists = [NSMutableArray array];
    NSDictionary *fileResult = RNFileScannerRun(
      rawPaths,
      options,
      ^NSDictionary *(NSURL *fileURL, NSString *rootPath, NSUInteger rootIndex, NSString *relativePath, BOOL skipped) {
        NSString *extension = fileURL.pathExtension.lowercaseString ?: @"";
        if (RNMediaTagsIsPlaylistExtension(extension)) {
          @synchronized(playlists) {
            [playlists addObject:@{
              @"rootIndex": @(rootIndex),
              @"relativePath": relativePath ?: fileURL.path ?: @"",
              @"fileName": fileURL.lastPathComponent ?: relativePath ?: fileURL.path ?: @"",
              @"absolutePath": fileURL.path ?: @"",
            }];
          }
          return nil;
        }

        if (!RNMediaTagsIsAudioExtension(extension, audioExtensions)) {
          return nil;
        }

        NSMutableDictionary *track = [@{
          @"rootIndex": @(rootIndex),
          @"relativePath": relativePath ?: fileURL.path ?: @"",
          @"fileName": fileURL.lastPathComponent ?: relativePath ?: fileURL.path ?: @"",
        } mutableCopy];

        if (skipped) {
          track[@"skipped"] = @YES;
          return track;
        }

        NSDictionary *tags = RNMediaTagsRead(fileURL, cacheDir ?: @"", includeArtwork, audioExtensions);
        [track addEntriesFromDictionary:tags ?: @{}];
        return track;
      },
      ^(NSArray<NSDictionary *> *items, NSUInteger rootIndex, NSUInteger completedRoots, NSUInteger totalRoots) {
        if (!self->_hasListeners) {
          return;
        }
        dispatch_async(dispatch_get_main_queue(), ^{
          [self sendEventWithName:@"onMediaScanBatch"
                             body:@{
                               @"tracks": items,
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
          [self sendEventWithName:@"onMediaScanProgress"
                             body:@{
                               @"rootIndex": @(rootIndex),
                               @"completedRoots": @(completedRoots),
                               @"totalRoots": @(totalRoots),
                             }];
        });
      });

    NSDictionary *result = @{
      @"totalTracks": fileResult[@"totalFiles"] ?: @0,
      @"totalRoots": fileResult[@"totalRoots"] ?: @0,
      @"errors": fileResult[@"errors"] ?: @[],
      @"playlists": playlists,
    };

    dispatch_async(dispatch_get_main_queue(), ^{
      if (self->_hasListeners) {
        [self sendEventWithName:@"onMediaScanComplete" body:result];
      }
      resolve(RNFileScannerJSONString(result));
    });
  });
}

@end
