#import "RNMediaTags.h"
#import "RNMediaTagsCore.h"
#import "RNMediaTags-Swift.h"

#import <React/RCTBridgeModule.h>

static id RNMediaTagsJSONObjectFromString(NSString *json)
{
  if (![json isKindOfClass:NSString.class] || json.length == 0) {
    return nil;
  }
  NSData *data = [json dataUsingEncoding:NSUTF8StringEncoding];
  return data ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil] : nil;
}

static NSString *RNMediaTagsJSONString(id object)
{
  NSData *data = [NSJSONSerialization dataWithJSONObject:(object ?: [NSNull null]) options:0 error:nil];
  return data ? [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] : @"null";
}

@implementation RNMediaTags

RCT_EXPORT_MODULE(NativeMediaTags)

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeMediaTagsSpecJSI>(params);
}

- (void)readMediaTags:(NSString *)filePath
          optionsJson:(NSString *)optionsJson
              resolve:(RCTPromiseResolveBlock)resolve
               reject:(RCTPromiseRejectBlock)reject
{
  id rawValue = RNMediaTagsJSONObjectFromString(optionsJson);
  NSDictionary *options = [rawValue isKindOfClass:NSDictionary.class] ? rawValue : @{};
  NSString *cacheDir = [options[@"cacheDir"] isKindOfClass:NSString.class] ? options[@"cacheDir"] : @"";
  BOOL includeArtwork = [options[@"includeArtwork"] boolValue];
  NSArray *allowedExtensions = [options[@"allowedExtensions"] isKindOfClass:NSArray.class] ? options[@"allowedExtensions"] : RNMediaTagsDefaultAudioExtensions();

  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    NSURL *fileURL = [filePath hasPrefix:@"file://"] ? [NSURL URLWithString:filePath] : [NSURL fileURLWithPath:filePath ?: @""];
    NSDictionary *tags = RNMediaTagsRead(fileURL, cacheDir, includeArtwork, [NSSet setWithArray:allowedExtensions]);
    resolve(RNMediaTagsJSONString(tags));
  });
}

- (void)writeMediaTags:(NSString *)filePath
           updatesJson:(NSString *)updatesJson
               resolve:(RCTPromiseResolveBlock)resolve
                reject:(RCTPromiseRejectBlock)reject
{
  id rawValue = RNMediaTagsJSONObjectFromString(updatesJson);
  NSDictionary *updates = [rawValue isKindOfClass:NSDictionary.class] ? rawValue : @{};
  NSURL *fileURL = [filePath hasPrefix:@"file://"] ? [NSURL URLWithString:filePath] : [NSURL fileURLWithPath:filePath ?: @""];

  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    NSError *error = nil;
    NSNumber *success = [RNMediaTagsID3Bridge writeTagsForURL:fileURL fields:updates error:&error];
    dispatch_async(dispatch_get_main_queue(), ^{
      if (!success.boolValue) {
        reject(@"ID3_WRITE_FAILED", error.localizedDescription ?: @"Failed to write media tags", error);
        return;
      }
      resolve(RNMediaTagsJSONString(@{@"success": @YES}));
    });
  });
}

@end
