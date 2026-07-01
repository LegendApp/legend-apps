#import <React/RCTViewComponentView.h>
#import <TargetConditionals.h>

#if TARGET_OS_OSX
#import <AppKit/AppKit.h>
#else
#import <UIKit/UIKit.h>
#endif

NS_ASSUME_NONNULL_BEGIN

@interface RNNativeSegmentedControl : RCTViewComponentView
@end

NS_ASSUME_NONNULL_END
