#import <AppKit/AppKit.h>

NS_ASSUME_NONNULL_BEGIN
@interface LEMarkdownSelectionBlock : NSObject
@property (nonatomic, copy) NSString *blockId;
@property (nonatomic) NSInteger index;
@property (nonatomic, copy) NSString *markdown;
@property (nonatomic, copy) NSString *type;
@property (nonatomic, copy, nullable) NSString *previousBlockId;
@property (nonatomic, copy, nullable) NSString *nextBlockId;
@property (nonatomic, copy) NSArray<NSTextView *> *textViews;
@property (nonatomic, weak, nullable) id input;
@property (nonatomic, weak) NSView *view;
/** Serialize a rendered UTF-16 range; geometry never indexes Markdown source. */
@property (nonatomic, copy) NSString *(^markdownForRange)(NSRange range);
@end

/** Document-owned endpoints and gesture lifetime, independent of recycled rows. */
@interface LEMarkdownTextSelection : NSObject
- (instancetype)initWithHost:(NSView *)host;
@property (nonatomic, readonly) BOOL hasSelection;
@property (nonatomic, copy) NSArray<LEMarkdownSelectionBlock *> *(^blocks)(void);
@property (nonatomic, copy) void (^onChange)(NSString *json, BOOL dragging);
@property (nonatomic, copy) void (^onReveal)(NSInteger index, BOOL upwards);
@property (nonatomic, copy) void (^onAction)(NSString *action);
@property (nonatomic, copy) void (^onCollapse)(NSString *blockId, NSPoint windowPoint);
- (void)setSelectionJSON:(NSString *)json;
- (void)refresh;
- (void)invalidate;
@end
NS_ASSUME_NONNULL_END
