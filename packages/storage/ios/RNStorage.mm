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

- (NSString *)getApplicationSupportDirectory
{
  NSArray<NSURL *> *urls = [[NSFileManager defaultManager] URLsForDirectory:NSApplicationSupportDirectory
                                                                  inDomains:NSUserDomainMask];
  NSURL *baseURL = urls.firstObject;
  if (!baseURL) {
    return @"";
  }

  NSURL *appURL = [baseURL URLByAppendingPathComponent:[self applicationSupportFolderName] isDirectory:YES];
  return appURL.absoluteString ?: @"";
}

@end
