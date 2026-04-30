#import "RNAppStorage.h"

#import <React/RCTBridgeModule.h>

@implementation RNAppStorage

RCT_EXPORT_MODULE(NativeAppStorage)

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeAppStorageSpecJSI>(params);
}

- (void)getString:(NSString *)key resolve:(RCTPromiseResolveBlock)resolve reject:(__unused RCTPromiseRejectBlock)reject
{
  NSString *value = [[NSUserDefaults standardUserDefaults] stringForKey:key];
  resolve(value ?: @"");
}

- (void)setString:(NSString *)key value:(NSString *)value resolve:(RCTPromiseResolveBlock)resolve reject:(__unused RCTPromiseRejectBlock)reject
{
  [[NSUserDefaults standardUserDefaults] setObject:value forKey:key];
  resolve(@([[NSUserDefaults standardUserDefaults] synchronize]));
}

- (void)removeItem:(NSString *)key resolve:(RCTPromiseResolveBlock)resolve reject:(__unused RCTPromiseRejectBlock)reject
{
  [[NSUserDefaults standardUserDefaults] removeObjectForKey:key];
  resolve(@([[NSUserDefaults standardUserDefaults] synchronize]));
}

@end
