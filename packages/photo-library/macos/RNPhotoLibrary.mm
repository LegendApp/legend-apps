#import "RNPhotoLibrary.h"
#import "RNPhotoLibrary-Swift.h"
@implementation RNPhotoLibrary {
  PhotoLibraryCore *_core;
}
RCT_EXPORT_MODULE(NativePhotoLibrary)
- (instancetype)init { if ((self = [super init])) _core = [PhotoLibraryCore new]; return self; }
+ (BOOL)requiresMainQueueSetup { return NO; }
- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:(const facebook::react::ObjCTurboModule::InitParams &)params {
  return std::make_shared<facebook::react::NativePhotoLibrarySpecJSI>(params);
}
static RCTPromiseResolveBlock jsonResolve(RCTPromiseResolveBlock resolve) {
  return ^(id value) {
    NSError *error = nil;
    NSData *data = [NSJSONSerialization dataWithJSONObject:value ?: NSNull.null options:NSJSONWritingFragmentsAllowed error:&error];
    resolve(data ? [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] : @"null");
  };
}
- (void)requestPermissions:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject { [_core requestPermissions:jsonResolve(resolve) rejecter:reject]; }
- (void)getPermissionStatus:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject { [_core getPermissionStatus:jsonResolve(resolve) rejecter:reject]; }
- (void)getAlbums:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject { [_core getAlbums:jsonResolve(resolve) rejecter:reject]; }
- (void)getPhotosInAlbum:(NSString *)identifier limit:(double)limit offset:(double)offset resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  [_core getPhotosInAlbum:identifier limit:(NSInteger)limit offset:(NSInteger)offset resolver:jsonResolve(resolve) rejecter:reject];
}
- (void)getPhotoAtIndex:(NSString *)identifier index:(double)index resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject {
  [_core getPhotoAtIndex:identifier index:(NSInteger)index resolver:jsonResolve(resolve) rejecter:reject];
}
@end
