#import "RNFileDialog.h"

#import <React/RCTBridgeModule.h>
#import <React/RCTUtils.h>
#import <TargetConditionals.h>

#if TARGET_OS_OSX
#import <AppKit/AppKit.h>
#endif

@implementation RNFileDialog

RCT_EXPORT_MODULE(NativeFileDialog)

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeFileDialogSpecJSI>(params);
}

- (NSDictionary *)parseObjectJSON:(NSString *)json
{
  NSData *data = [json dataUsingEncoding:NSUTF8StringEncoding];
  if (!data) {
    return @{};
  }

  id value = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
  return [value isKindOfClass:[NSDictionary class]] ? value : @{};
}

- (NSString *)jsonStringFromObject:(id)object
{
  id value = object ?: [NSNull null];
  NSData *data = [NSJSONSerialization dataWithJSONObject:value options:0 error:nil];
  return data ? [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] : @"null";
}

- (NSString *)safePathComponent:(NSString *)component fallback:(NSString *)fallback
{
  NSString *candidate = component.length > 0 ? component : fallback;
  NSCharacterSet *invalidCharacters = [NSCharacterSet characterSetWithCharactersInString:@"/:"];
  NSArray<NSString *> *parts = [candidate componentsSeparatedByCharactersInSet:invalidCharacters];
  NSString *safeComponent = [parts componentsJoinedByString:@"-"];
  return safeComponent.length > 0 ? safeComponent : fallback;
}

- (void)open:(NSString *)optionsJson resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
#if TARGET_OS_OSX
  RCTExecuteOnMainQueue(^{
    NSDictionary *options = [self parseObjectJSON:optionsJson];
    NSOpenPanel *panel = [NSOpenPanel openPanel];
    panel.canChooseFiles = options[@"canChooseFiles"] ? [options[@"canChooseFiles"] boolValue] : YES;
    panel.canChooseDirectories = options[@"canChooseDirectories"] ? [options[@"canChooseDirectories"] boolValue] : NO;
    panel.allowsMultipleSelection = options[@"allowsMultipleSelection"] ? [options[@"allowsMultipleSelection"] boolValue] : NO;
    panel.resolvesAliases = YES;
    panel.treatsFilePackagesAsDirectories = YES;

    NSArray *allowedFileTypes = [options[@"allowedFileTypes"] isKindOfClass:[NSArray class]] ? options[@"allowedFileTypes"] : nil;
    if (allowedFileTypes.count > 0 && panel.canChooseFiles) {
      panel.allowedFileTypes = allowedFileTypes;
      panel.allowsOtherFileTypes = NO;
    }

    NSString *directoryURL = [options[@"directoryURL"] isKindOfClass:[NSString class]] ? options[@"directoryURL"] : nil;
    if (directoryURL.length > 0) {
      NSURL *url = [directoryURL hasPrefix:@"file://"] ? [NSURL URLWithString:directoryURL] : [NSURL fileURLWithPath:directoryURL];
      if (url) {
        panel.directoryURL = url;
      }
    }

    NSInteger result = [panel runModal];
    if (result != NSModalResponseOK) {
      resolve(@"null");
      return;
    }

    NSMutableArray<NSString *> *paths = [NSMutableArray arrayWithCapacity:panel.URLs.count];
    for (NSURL *url in panel.URLs) {
      if (url.path.length > 0) {
        [paths addObject:url.path];
      }
    }
    resolve([self jsonStringFromObject:paths]);
  });
#else
  resolve(@"null");
#endif
}

- (void)save:(NSString *)optionsJson resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
#if TARGET_OS_OSX
  RCTExecuteOnMainQueue(^{
    NSDictionary *options = [self parseObjectJSON:optionsJson];
    NSSavePanel *panel = [NSSavePanel savePanel];
    panel.canCreateDirectories = YES;
    panel.showsTagField = NO;

    NSString *defaultName = [options[@"defaultName"] isKindOfClass:[NSString class]] ? options[@"defaultName"] : nil;
    if (defaultName.length > 0) {
      panel.nameFieldStringValue = defaultName;
    }

    NSArray *allowedFileTypes = [options[@"allowedFileTypes"] isKindOfClass:[NSArray class]] ? options[@"allowedFileTypes"] : nil;
    if (allowedFileTypes.count > 0) {
      panel.allowedFileTypes = allowedFileTypes;
    }

    NSString *directory = [options[@"directory"] isKindOfClass:[NSString class]] ? options[@"directory"] : nil;
    if (directory.length > 0) {
      panel.directoryURL = [NSURL fileURLWithPath:directory isDirectory:YES];
    }

    [panel beginWithCompletionHandler:^(NSModalResponse result) {
      if (result == NSModalResponseOK && panel.URL.path.length > 0) {
        resolve([self jsonStringFromObject:panel.URL.path]);
      } else {
        resolve(@"null");
      }
    }];
  });
#else
  resolve(@"null");
#endif
}

- (void)revealInFinder:(NSString *)path resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
#if TARGET_OS_OSX
  RCTExecuteOnMainQueue(^{
    if (path.length == 0) {
      resolve(@NO);
      return;
    }

    NSString *expandedPath = [path stringByExpandingTildeInPath];
    NSURL *inputURL = [NSURL URLWithString:expandedPath];
    NSURL *fileURL = inputURL.isFileURL ? inputURL : [NSURL fileURLWithPath:expandedPath];
    if (!fileURL.path.length || ![[NSFileManager defaultManager] fileExistsAtPath:fileURL.path]) {
      resolve(@NO);
      return;
    }

    [[NSWorkspace sharedWorkspace] activateFileViewerSelectingURLs:@[fileURL]];
    resolve(@YES);
  });
#else
  resolve(@NO);
#endif
}

- (void)createTemporaryTextFile:(NSString *)prefix
                      extension:(NSString *)extension
                       contents:(NSString *)contents
                        resolve:(RCTPromiseResolveBlock)resolve
                         reject:(RCTPromiseRejectBlock)reject
{
#if TARGET_OS_OSX
  RCTExecuteOnMainQueue(^{
    NSString *safePrefix = [self safePathComponent:prefix fallback:@"legend-desktop"];
    NSString *safeExtension = [self safePathComponent:extension fallback:@"tmp"];
    NSString *filename = [NSString stringWithFormat:@"%@-%@.%@", safePrefix, NSUUID.UUID.UUIDString, safeExtension];
    NSString *path = [NSTemporaryDirectory() stringByAppendingPathComponent:filename];
    NSError *error = nil;
    BOOL ok = [contents writeToFile:path atomically:YES encoding:NSUTF8StringEncoding error:&error];
    if (!ok) {
      reject(@"temporary_file_failed", error.localizedDescription ?: @"Failed to create temporary file.", error);
      return;
    }

    resolve(path);
  });
#else
  reject(@"unsupported_platform", @"Temporary text files are only supported on macOS.", nil);
#endif
}

- (void)removeFile:(NSString *)path resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
#if TARGET_OS_OSX
  RCTExecuteOnMainQueue(^{
    if (path.length == 0) {
      resolve(@NO);
      return;
    }

    NSString *expandedPath = [path stringByExpandingTildeInPath];
    NSFileManager *fileManager = [NSFileManager defaultManager];
    if (![fileManager fileExistsAtPath:expandedPath]) {
      resolve(@NO);
      return;
    }

    NSError *error = nil;
    BOOL ok = [fileManager removeItemAtPath:expandedPath error:&error];
    if (!ok) {
      reject(@"remove_failed", error.localizedDescription ?: @"Failed to remove file.", error);
      return;
    }

    resolve(@YES);
  });
#else
  resolve(@NO);
#endif
}

- (void)writeTextFile:(NSString *)path contents:(NSString *)contents resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
#if TARGET_OS_OSX
  RCTExecuteOnMainQueue(^{
    if (path.length == 0) {
      reject(@"invalid_path", @"Cannot write file without a path.", nil);
      return;
    }

    NSString *expandedPath = [path stringByExpandingTildeInPath];
    NSError *error = nil;
    BOOL ok = [contents writeToFile:expandedPath atomically:YES encoding:NSUTF8StringEncoding error:&error];
    if (!ok) {
      reject(@"write_failed", error.localizedDescription ?: @"Failed to write file.", error);
      return;
    }

    resolve(nil);
  });
#else
  resolve(nil);
#endif
}

@end
