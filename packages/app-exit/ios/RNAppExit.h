#import <Foundation/Foundation.h>
#import <React/RCTEventEmitter.h>
#import <RNAppExitSpec/RNAppExitSpec.h>
#import <TargetConditionals.h>

#if TARGET_OS_OSX
#import <AppKit/AppKit.h>
#endif

NS_ASSUME_NONNULL_BEGIN

@interface RNAppExit : RCTEventEmitter <NativeAppExitSpec>
#if TARGET_OS_OSX
+ (NSApplicationTerminateReply)applicationShouldTerminate;
#endif
@end

NS_ASSUME_NONNULL_END
