#import "RNStorage.h"

#import <React/RCTBridgeModule.h>

@implementation RNStorage

RCT_EXPORT_MODULE(NativeStorage)

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeStorageSpecJSI>(params);
}

- (NSString *)applicationSupportFolderName
{
  NSDictionary *info = [[NSBundle mainBundle] infoDictionary];
  NSString *displayName = [info[@"CFBundleDisplayName"] isKindOfClass:[NSString class]] ? info[@"CFBundleDisplayName"] : nil;
  NSString *bundleName = [info[@"CFBundleName"] isKindOfClass:[NSString class]] ? info[@"CFBundleName"] : nil;
  NSString *bundleIdentifier = [[NSBundle mainBundle] bundleIdentifier];
  NSString *folderName = displayName.length > 0 ? displayName : (bundleName.length > 0 ? bundleName : bundleIdentifier);
  return folderName.length > 0 ? folderName : @"Legend Desktop";
}

- (NSURL * _Nullable)storageRootURL:(NSString *)root
{
  NSSearchPathDirectory directory;
  BOOL includesAppFolder = NO;
  if ([root isEqualToString:@"applicationSupport"]) {
    directory = NSApplicationSupportDirectory;
    includesAppFolder = YES;
  } else if ([root isEqualToString:@"cache"]) {
    directory = NSCachesDirectory;
  } else if ([root isEqualToString:@"document"]) {
    directory = NSDocumentDirectory;
  } else {
    return nil;
  }

  NSArray<NSURL *> *urls = [[NSFileManager defaultManager] URLsForDirectory:directory
                                                                  inDomains:NSUserDomainMask];
  NSURL *baseURL = urls.firstObject;
  if (!baseURL) {
    return nil;
  }

  return includesAppFolder
    ? [baseURL URLByAppendingPathComponent:[self applicationSupportFolderName] isDirectory:YES]
    : baseURL;
}

- (NSURL * _Nullable)storageURLForRoot:(NSString *)root relativePath:(NSString *)relativePath
{
  if (![relativePath isKindOfClass:NSString.class] || [relativePath hasPrefix:@"/"]) {
    return nil;
  }
  for (NSString *component in relativePath.pathComponents) {
    if ([component isEqualToString:@".."] || [component isEqualToString:@"."]) {
      return nil;
    }
  }

  NSURL *rootURL = [self storageRootURL:root].standardizedURL.URLByResolvingSymlinksInPath;
  if (!rootURL) {
    return nil;
  }
  NSURL *url = relativePath.length > 0
    ? [rootURL URLByAppendingPathComponent:relativePath].standardizedURL.URLByResolvingSymlinksInPath
    : rootURL;
  NSString *rootPath = rootURL.path;
  NSString *path = url.path;
  NSString *rootPrefix = [rootPath stringByAppendingString:@"/"];
  return [path isEqualToString:rootPath] || [path hasPrefix:rootPrefix] ? url : nil;
}

- (NSString *)getStoragePathUri:(NSString *)root relativePath:(NSString *)relativePath
{
  return [self storageURLForRoot:root relativePath:relativePath].absoluteString ?: @"";
}

- (NSString * _Nullable)readStorageText:(NSString *)root relativePath:(NSString *)relativePath
{
  NSURL *url = relativePath.length > 0 ? [self storageURLForRoot:root relativePath:relativePath] : nil;
  if (!url) {
    return nil;
  }
  return [NSString stringWithContentsOfURL:url encoding:NSUTF8StringEncoding error:nil];
}

- (NSNumber *)writeStorageText:(NSString *)root relativePath:(NSString *)relativePath value:(NSString *)value
{
  NSURL *url = relativePath.length > 0 ? [self storageURLForRoot:root relativePath:relativePath] : nil;
  if (!url) {
    return @NO;
  }
  NSFileManager *fileManager = [NSFileManager defaultManager];
  if (![fileManager createDirectoryAtURL:url.URLByDeletingLastPathComponent
             withIntermediateDirectories:YES
                              attributes:nil
                                   error:nil]) {
    return @NO;
  }
  return @([value writeToURL:url atomically:YES encoding:NSUTF8StringEncoding error:nil]);
}

- (NSNumber *)deleteStoragePath:(NSString *)root relativePath:(NSString *)relativePath
{
  NSURL *url = relativePath.length > 0 ? [self storageURLForRoot:root relativePath:relativePath] : nil;
  if (!url) {
    return @NO;
  }
  NSFileManager *fileManager = [NSFileManager defaultManager];
  return @(![fileManager fileExistsAtPath:url.path] || [fileManager removeItemAtURL:url error:nil]);
}

- (NSNumber *)ensureStorageDirectory:(NSString *)root relativePath:(NSString *)relativePath
{
  NSURL *url = [self storageURLForRoot:root relativePath:relativePath];
  if (!url) {
    return @NO;
  }
  return @([[NSFileManager defaultManager] createDirectoryAtURL:url
                                    withIntermediateDirectories:YES
                                                     attributes:nil
                                                          error:nil]);
}

- (NSString *)listStorageDirectoryJson:(NSString *)root relativePath:(NSString *)relativePath
{
  NSURL *url = [self storageURLForRoot:root relativePath:relativePath];
  if (!url) {
    return @"[]";
  }

  NSArray<NSURL *> *urls = [[NSFileManager defaultManager] contentsOfDirectoryAtURL:url
                                                        includingPropertiesForKeys:@[NSURLIsDirectoryKey]
                                                                           options:0
                                                                             error:nil];
  if (!urls) {
    return @"[]";
  }

  NSMutableArray<NSDictionary *> *entries = [NSMutableArray arrayWithCapacity:urls.count];
  for (NSURL *entryURL in [urls sortedArrayUsingComparator:^NSComparisonResult(NSURL *left, NSURL *right) {
    return [left.lastPathComponent compare:right.lastPathComponent options:NSCaseInsensitiveSearch];
  }]) {
    NSNumber *isDirectory = nil;
    [entryURL getResourceValue:&isDirectory forKey:NSURLIsDirectoryKey error:nil];
    [entries addObject:@{
      @"isDirectory": @([isDirectory boolValue]),
      @"name": entryURL.lastPathComponent ?: @"",
    }];
  }

  NSData *data = [NSJSONSerialization dataWithJSONObject:entries options:0 error:nil];
  return data ? [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] : @"[]";
}

- (NSString * _Nullable)readTextFile:(NSString *)pathOrUri
{
  if (pathOrUri.length == 0) {
    return nil;
  }
  NSURL *url = [pathOrUri hasPrefix:@"file://"]
    ? [NSURL URLWithString:pathOrUri]
    : [NSURL fileURLWithPath:pathOrUri];
  return url ? [NSString stringWithContentsOfURL:url encoding:NSUTF8StringEncoding error:nil] : nil;
}

@end
