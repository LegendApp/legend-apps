#import <TargetConditionals.h>
#if TARGET_OS_OSX
#import <AppKit/AppKit.h>
#import <CoreImage/CoreImage.h>

// Windows and their React surfaces outlive an individual TurboModule on reload.
// Runtime-specific listeners and delegates remain owned by RNWindowManager.
@interface LegendWindowRegistry : NSObject
@property (nonatomic, readonly) NSMutableDictionary<NSString *, NSWindow *> *windows;
@property (nonatomic, readonly) NSMutableDictionary<NSString *, id> *rootViews;
@property (nonatomic, readonly) NSMutableDictionary<NSString *, NSString *> *moduleNames;
@property (nonatomic, readonly) NSMutableDictionary<NSString *, NSArray<NSTitlebarAccessoryViewController *> *> *titlebarAccessoryControllers;
@property (nonatomic, readonly) NSMutableDictionary<NSString *, NSView *> *titlebarMaterialViews;
@property (nonatomic, readonly) NSMutableDictionary<NSString *, NSArray<NSDictionary *> *> *toolbarItemConfigs;
@property (nonatomic, readonly) NSMutableDictionary<NSString *, CIFilter *> *windowBlurFilters;
@property (nonatomic, readonly) NSMutableDictionary<NSString *, NSDictionary *> *windowOptions;
@property (nonatomic, readonly) NSMutableSet<NSString *> *closeRequestIdentifiers;
+ (instancetype)sharedRegistry;
@end
#endif
