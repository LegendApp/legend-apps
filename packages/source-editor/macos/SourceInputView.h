#import "SourceLineLayout.h"
#include <memory>
namespace legend::source { class SourceDocument; }

NS_ASSUME_NONNULL_BEGIN
@class LESourceRowView;

@interface LESourceInputView : NSView <NSTextInputClient>
@property (nonatomic, copy, nullable) void (^onEdit)(NSString *json);
@property (nonatomic, copy, nullable) void (^onSelection)(NSUInteger line, NSUInteger offset, NSUInteger length);
@property (nonatomic, copy, nullable) void (^onSyntaxError)(NSString *error);
@property (nonatomic, readonly) NSUInteger anchor;
@property (nonatomic, readonly) NSUInteger head;
@property (nonatomic, readonly) NSUInteger lineCount;
@property (nonatomic, copy, nullable) void (^onFirstDraw)(void);
- (void)adoptDocument:(std::shared_ptr<legend::source::SourceDocument>)document;
- (NSDictionary *)appendDocument:(legend::source::SourceDocument &&)chunk;
- (void)requestVisibleSyntax;
- (void)loadSource:(NSString *)source;
- (void)configureSyntaxLanguage:(NSString *)language theme:(NSString *)theme enabled:(BOOL)enabled;
- (NSString *)source;
- (void)registerRow:(LESourceRowView *)row;
- (void)unregisterRow:(LESourceRowView *)row;
- (void)selectInRow:(LESourceRowView *)row event:(NSEvent *)event extending:(BOOL)extending;
- (void)beginSelectionDragInRow:(LESourceRowView *)row event:(NSEvent *)event;
- (void)updateSelectionDragAtWindowPoint:(NSPoint)point;
- (void)endSelectionDrag;
- (NSUInteger)offsetForRow:(LESourceRowView *)row;
- (NSString *)textForRow:(LESourceRowView *)row;
@end

@interface LESourceRowView : NSView
@property (nonatomic, weak, nullable) LESourceInputView *input;
@property (nonatomic) NSUInteger lineIndex;
@property (nonatomic) uint64_t lineId;
@property (nonatomic) CGFloat fontSize;
@property (nonatomic) CGFloat lineHeight;
@property (nonatomic) BOOL wrap;
@property (nonatomic, copy) NSString *fontFamily;
@property (nonatomic, strong) NSColor *foreground;
@property (nonatomic, readonly, nullable) LESourceLineLayout *textLayout;
@property (nonatomic, copy, nullable) void (^onMetrics)(CGFloat height, CGFloat width);
- (void)invalidateText;
- (NSPoint)textPointForWindowPoint:(NSPoint)point;
@end
NS_ASSUME_NONNULL_END
