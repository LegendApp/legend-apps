#import <React/RCTViewComponentView.h>

#ifndef RNMarkdownBlockEditor_h
#define RNMarkdownBlockEditor_h

NS_ASSUME_NONNULL_BEGIN

@class RNMarkdownBlockActivationView;

@interface RNMarkdownEditorHost : RCTViewComponentView
- (void)registerActivationView:(RNMarkdownBlockActivationView *)view;
- (void)unregisterActivationView:(RNMarkdownBlockActivationView *)view;
- (void)activateBlockView:(RNMarkdownBlockActivationView *)view withEvent:(NSEvent *)event;
- (CGFloat)rowHeightForActivationView:(RNMarkdownBlockActivationView *)view contentHeight:(CGFloat)contentHeight;
- (NSEdgeInsets)rowPaddingForActivationView:(RNMarkdownBlockActivationView *)view;
@end

@interface RNMarkdownBlockActivationView : RCTViewComponentView
@property (nonatomic, copy) NSString *blockId;
@property (nonatomic, copy) NSString *nextBlockId;
@property (nonatomic, copy) NSString *previousBlockId;
- (NSRect)contentBounds;
- (NSString *)currentMarkdown;
- (void)setContentsHidden:(BOOL)contentsHidden;
@end

NS_ASSUME_NONNULL_END

#endif
