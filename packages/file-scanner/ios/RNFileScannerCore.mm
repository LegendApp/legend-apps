#import "RNFileScannerCore.h"

@implementation RNFileScannerOptions

- (instancetype)init
{
  if (self = [super init]) {
    _allowedExtensions = [NSSet set];
    _batchSize = 64;
    _includeHidden = NO;
    _includeStats = NO;
    _skipLookup = @{};
  }
  return self;
}

@end

NSString *RNFileScannerNormalizePath(NSString *path)
{
  if (![path isKindOfClass:NSString.class] || path.length == 0) {
    return @"";
  }

  NSString *normalized = path;
  if ([normalized hasPrefix:@"file://"]) {
    NSURL *url = [NSURL URLWithString:normalized];
    if (url.path.length > 0) {
      normalized = url.path;
    }
  }

  normalized = [normalized stringByExpandingTildeInPath].stringByStandardizingPath;
  while ([normalized hasSuffix:@"/"] && normalized.length > 1) {
    normalized = [normalized substringToIndex:normalized.length - 1];
  }
  return normalized;
}

NSString *RNFileScannerRelativePath(NSString *fullPath, NSString *rootPath)
{
  NSString *normalizedFullPath = RNFileScannerNormalizePath(fullPath);
  NSString *normalizedRoot = RNFileScannerNormalizePath(rootPath);
  if (normalizedFullPath.length == 0 || normalizedRoot.length == 0) {
    return normalizedFullPath;
  }

  if ([normalizedFullPath isEqualToString:normalizedRoot]) {
    return normalizedFullPath.lastPathComponent ?: normalizedFullPath;
  }

  NSString *rootPrefix = [normalizedRoot stringByAppendingString:@"/"];
  if ([normalizedFullPath hasPrefix:rootPrefix]) {
    NSString *relativePath = [normalizedFullPath substringFromIndex:rootPrefix.length];
    return relativePath.length > 0 ? relativePath : (normalizedFullPath.lastPathComponent ?: normalizedFullPath);
  }

  return normalizedFullPath;
}

NSArray<NSString *> *RNFileScannerNormalizeRoots(NSArray<NSString *> *paths)
{
  NSMutableArray<NSString *> *roots = [NSMutableArray array];
  for (id rawPath in paths) {
    NSString *normalized = RNFileScannerNormalizePath([rawPath isKindOfClass:NSString.class] ? rawPath : @"");
    if (normalized.length > 0) {
      [roots addObject:normalized];
    }
  }
  return roots;
}

NSSet<NSString *> *RNFileScannerExtensionsFromArray(NSArray<NSString *> *extensions, NSArray<NSString *> *defaultExtensions)
{
  NSArray<NSString *> *source = extensions.count > 0 ? extensions : defaultExtensions;
  NSMutableSet<NSString *> *normalized = [NSMutableSet set];
  for (id value in source) {
    if (![value isKindOfClass:NSString.class]) {
      continue;
    }
    NSString *extension = [[(NSString *)value lowercaseString] stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
    if ([extension hasPrefix:@"."]) {
      extension = [extension substringFromIndex:1];
    }
    if (extension.length > 0) {
      [normalized addObject:extension];
    }
  }
  return normalized;
}

NSDictionary<NSNumber *, NSSet<NSString *> *> *RNFileScannerSkipLookupFromArray(NSArray *skipEntries)
{
  if (![skipEntries isKindOfClass:NSArray.class]) {
    return @{};
  }

  NSMutableDictionary<NSNumber *, NSMutableSet<NSString *> *> *lookup = [NSMutableDictionary dictionary];
  for (id rawEntry in skipEntries) {
    if (![rawEntry isKindOfClass:NSDictionary.class]) {
      continue;
    }
    NSDictionary *entry = (NSDictionary *)rawEntry;
    NSNumber *rootIndex = [entry[@"rootIndex"] isKindOfClass:NSNumber.class] ? entry[@"rootIndex"] : nil;
    NSString *relativePath = [entry[@"relativePath"] isKindOfClass:NSString.class] ? entry[@"relativePath"] : nil;
    if (!rootIndex || relativePath.length == 0) {
      continue;
    }
    NSNumber *rootKey = @([rootIndex unsignedIntegerValue]);
    NSMutableSet<NSString *> *rootSet = lookup[rootKey];
    if (!rootSet) {
      rootSet = [NSMutableSet set];
      lookup[rootKey] = rootSet;
    }
    [rootSet addObject:relativePath];
  }

  NSMutableDictionary<NSNumber *, NSSet<NSString *> *> *immutable = [NSMutableDictionary dictionaryWithCapacity:lookup.count];
  [lookup enumerateKeysAndObjectsUsingBlock:^(NSNumber *key, NSMutableSet<NSString *> *value, BOOL *stop) {
    immutable[key] = [value copy];
  }];
  return immutable;
}

NSDictionary *RNFileScannerDefaultFileItem(NSURL *fileURL,
                                           NSString *rootPath,
                                           NSUInteger rootIndex,
                                           NSString *relativePath,
                                           BOOL skipped,
                                           BOOL includeStats)
{
  NSMutableDictionary *item = [@{
    @"rootIndex": @(rootIndex),
    @"relativePath": relativePath ?: fileURL.path ?: @"",
    @"fileName": fileURL.lastPathComponent ?: relativePath ?: fileURL.path ?: @"",
    @"absolutePath": fileURL.path ?: @"",
    @"extension": fileURL.pathExtension.lowercaseString ?: @"",
  } mutableCopy];

  if (skipped) {
    item[@"skipped"] = @YES;
  }

  if (includeStats) {
    NSDictionary<NSFileAttributeKey, id> *attributes = [[NSFileManager defaultManager] attributesOfItemAtPath:fileURL.path error:nil];
    NSNumber *fileSize = attributes[NSFileSize];
    NSDate *modifiedDate = attributes[NSFileModificationDate];
    if ([fileSize isKindOfClass:NSNumber.class]) {
      item[@"size"] = fileSize;
    }
    if ([modifiedDate isKindOfClass:NSDate.class]) {
      item[@"modifiedTime"] = @([modifiedDate timeIntervalSince1970] * 1000.0);
    }
  }

  return item;
}

NSDictionary *RNFileScannerRun(NSArray<NSString *> *paths,
                               RNFileScannerOptions *options,
                               RNFileScannerMapFileBlock mapFile,
                               RNFileScannerEmitBatchBlock emitBatch,
                               RNFileScannerProgressBlock emitProgress)
{
  NSArray<NSString *> *roots = RNFileScannerNormalizeRoots(paths);
  NSUInteger totalRoots = roots.count;
  if (totalRoots == 0) {
    return @{@"totalFiles": @0, @"totalRoots": @0, @"errors": @[]};
  }

  RNFileScannerOptions *scanOptions = options ?: [RNFileScannerOptions new];
  NSUInteger batchSize = scanOptions.batchSize > 0 ? scanOptions.batchSize : 64;
  NSSet<NSString *> *allowedExtensions = scanOptions.allowedExtensions ?: [NSSet set];
  NSMutableArray<NSString *> *errors = [NSMutableArray array];
  NSUInteger totalFiles = 0;
  NSUInteger completedRoots = 0;
  NSFileManager *fileManager = [NSFileManager defaultManager];

  for (NSUInteger rootIndex = 0; rootIndex < roots.count; rootIndex++) {
    @autoreleasepool {
      NSString *rootPath = roots[rootIndex];
      BOOL isDirectory = NO;
      BOOL exists = [fileManager fileExistsAtPath:rootPath isDirectory:&isDirectory];
      if (!exists) {
        [errors addObject:[NSString stringWithFormat:@"Root not found: %@", rootPath]];
        completedRoots += 1;
        if (emitProgress) {
          emitProgress(rootIndex, completedRoots, totalRoots);
        }
        continue;
      }

      if (!isDirectory) {
        NSURL *fileURL = [NSURL fileURLWithPath:rootPath isDirectory:NO];
        NSString *extension = fileURL.pathExtension.lowercaseString ?: @"";
        if (allowedExtensions.count == 0 || [allowedExtensions containsObject:extension]) {
          NSString *relativePath = fileURL.lastPathComponent ?: rootPath;
          BOOL skipped = [scanOptions.skipLookup[@(rootIndex)] containsObject:relativePath];
          NSDictionary *item = mapFile
            ? mapFile(fileURL, rootPath.stringByDeletingLastPathComponent ?: rootPath, rootIndex, relativePath, skipped)
            : RNFileScannerDefaultFileItem(fileURL, rootPath.stringByDeletingLastPathComponent ?: rootPath, rootIndex, relativePath, skipped, scanOptions.includeStats);
          if (item) {
            totalFiles += 1;
            if (emitBatch) {
              emitBatch(@[item], rootIndex, completedRoots, totalRoots);
            }
          }
        }
        completedRoots += 1;
        if (emitProgress) {
          emitProgress(rootIndex, completedRoots, totalRoots);
        }
        continue;
      }

      NSDirectoryEnumerationOptions enumerationOptions = NSDirectoryEnumerationSkipsPackageDescendants;
      if (!scanOptions.includeHidden) {
        enumerationOptions |= NSDirectoryEnumerationSkipsHiddenFiles;
      }

      NSURL *rootURL = [NSURL fileURLWithPath:rootPath isDirectory:YES];
      NSDirectoryEnumerator<NSURL *> *enumerator =
        [fileManager enumeratorAtURL:rootURL
          includingPropertiesForKeys:@[NSURLIsDirectoryKey]
                             options:enumerationOptions
                        errorHandler:^BOOL(NSURL *url, NSError *error) {
                          @synchronized(errors) {
                            [errors addObject:error.localizedDescription ?: @"Unknown scan error"];
                          }
                          return YES;
                        }];

      if (!enumerator) {
        [errors addObject:[NSString stringWithFormat:@"Failed to enumerate: %@", rootPath]];
        completedRoots += 1;
        if (emitProgress) {
          emitProgress(rootIndex, completedRoots, totalRoots);
        }
        continue;
      }

      NSMutableArray<NSDictionary *> *batch = [NSMutableArray arrayWithCapacity:batchSize];
      for (NSURL *fileURL in enumerator) {
        NSNumber *isDirectoryValue = nil;
        [fileURL getResourceValue:&isDirectoryValue forKey:NSURLIsDirectoryKey error:nil];
        if (isDirectoryValue.boolValue) {
          continue;
        }

        NSString *extension = fileURL.pathExtension.lowercaseString ?: @"";
        if (allowedExtensions.count > 0 && ![allowedExtensions containsObject:extension]) {
          continue;
        }

        NSString *relativePath = RNFileScannerRelativePath(fileURL.path, rootPath);
        BOOL skipped = [scanOptions.skipLookup[@(rootIndex)] containsObject:relativePath];
        NSDictionary *item = mapFile
          ? mapFile(fileURL, rootPath, rootIndex, relativePath, skipped)
          : RNFileScannerDefaultFileItem(fileURL, rootPath, rootIndex, relativePath, skipped, scanOptions.includeStats);
        if (!item) {
          continue;
        }

        [batch addObject:item];
        totalFiles += 1;
        if (batch.count >= batchSize) {
          if (emitBatch) {
            emitBatch([batch copy], rootIndex, completedRoots, totalRoots);
          }
          [batch removeAllObjects];
        }
      }

      if (batch.count > 0 && emitBatch) {
        emitBatch([batch copy], rootIndex, completedRoots, totalRoots);
      }

      completedRoots += 1;
      if (emitProgress) {
        emitProgress(rootIndex, completedRoots, totalRoots);
      }
    }
  }

  return @{@"totalFiles": @(totalFiles), @"totalRoots": @(totalRoots), @"errors": errors};
}

NSString *RNFileScannerJSONString(id object)
{
  id value = object ?: [NSNull null];
  NSData *data = [NSJSONSerialization dataWithJSONObject:value options:0 error:nil];
  return data ? [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] : @"null";
}

id RNFileScannerJSONObjectFromString(NSString *json)
{
  if (![json isKindOfClass:NSString.class] || json.length == 0) {
    return nil;
  }
  NSData *data = [json dataUsingEncoding:NSUTF8StringEncoding];
  return data ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil] : nil;
}
