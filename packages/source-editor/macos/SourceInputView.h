#import "SourceLineLayout.h"
#import "SourceFileSession.h"
#include <memory>
namespace legend::source { class SourceDocument; }

NS_ASSUME_NONNULL_BEGIN
@class LESourceRowView;

@interface LESourceInputView : NSView <NSTextInputClient>
@property (nonatomic, copy, nullable) void (^onEdit)(NSString *json);
@property (nonatomic, copy, nullable) void (^onSelection)(NSUInteger line, NSUInteger offset, NSUInteger length);
@property (nonatomic, copy, nullable) void (^onSyntaxError)(NSString *error);
@property (nonatomic, copy, nullable) void (^onSyntaxProgress)(NSUInteger completed, NSUInteger total, BOOL active);
@property (nonatomic, copy, nullable) void (^onGrammarRequired)(NSString *language);
@property (nonatomic) NSUInteger grammarRevision;
@property (nonatomic, readonly) NSUInteger anchor;
@property (nonatomic, readonly) NSUInteger head;
@property (nonatomic, readonly) NSUInteger lineCount;
@property (nonatomic) BOOL syntaxHighlightingInBackground;
@property (nonatomic, copy) NSString *syntaxBackend;
@property (nonatomic) BOOL sourceLoading;
@property (nonatomic, copy, nullable) void (^onFirstDraw)(void);
@property (nonatomic, copy, nullable) void (^onDocumentState)(BOOL dirty, NSString *path);
@property (nonatomic, strong, nullable) LESourceFileSession *fileSession;
@property (nonatomic) BOOL fileReadComplete;
@property (nonatomic, readonly) BOOL dirty;
@property (nonatomic, readonly) uint64_t documentRevision;
- (void)showFindPanel;
- (void)showGoToLine;
- (void)copySourceWithCompletion:(void (^)(NSString *_Nullable source, NSString *_Nullable error))completion;
- (void)saveToPath:(NSString *)path completion:(void (^)(BOOL saved, NSString *error))completion;
- (void)saveAs:(BOOL)saveAs completion:(void (^)(BOOL saved, NSString *error))completion;
- (void)confirmDiscardWithCompletion:(void (^)(BOOL allow))completion;
@property (nonatomic, copy) NSString *indentUnit;
@property (nonatomic) BOOL automaticPairs;
- (BOOL)performEditingCommand:(NSString *)command;
- (void)selectLine:(NSUInteger)line;
- (void)replaceSelectionWithText:(NSString *)text;
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
- (void)applyLineId:(uint64_t)lineId index:(NSUInteger)index;
- (NSPoint)textPointForWindowPoint:(NSPoint)point;
@end
NS_ASSUME_NONNULL_END
