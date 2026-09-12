#import <AppKit/AppKit.h>
@class LESourceInputView;
@interface LESourceSearchPanel : NSObject
- (instancetype)initWithInput:(LESourceInputView *)input;
- (void)show;
- (void)invalidate;
- (void)close;
@end
