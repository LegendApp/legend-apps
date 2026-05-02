#import <React/RCTViewComponentView.h>

#ifndef RNMarkdownBlockEditor_h
#define RNMarkdownBlockEditor_h

NS_ASSUME_NONNULL_BEGIN

@class RNMarkdownBlockActivationView;

@interface RNMarkdownEditorHost : RCTViewComponentView
- (void)registerActivationView:(RNMarkdownBlockActivationView *)view;
- (void)unregisterActivationView:(RNMarkdownBlockActivationView *)view;
- (void)activateBlockView:(RNMarkdownBlockActivationView *)view withEvent:(NSEvent *)event;
@end

@interface RNMarkdownBlockActivationView : RCTViewComponentView
@property (nonatomic, copy) NSString *blockId;
@property (nonatomic, copy) NSString *markdown;
- (void)setContentsHidden:(BOOL)contentsHidden;
@end

NS_ASSUME_NONNULL_END

#endif
