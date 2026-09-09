#import <React/RCTViewComponentView.h>
#import "SourceInputView.h"

@interface RNSourceEditorHost : RCTViewComponentView
@property (nonatomic, readonly) LESourceInputView *input;
@end
@interface RNSourceEditorRow : RCTViewComponentView
@end
