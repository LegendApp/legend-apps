#import <AppKit/AppKit.h>

NS_ASSUME_NONNULL_BEGIN

// One layout is used for rendering, mouse hit testing, caret/IME geometry,
// selection, and visual-row navigation. Offsets are UTF-16, never glyph counts.
@interface LESourceLineLayout : NSObject
@property (nonatomic, readonly) CGFloat height;
@property (nonatomic, readonly) CGFloat width;
@property (nonatomic, readonly) NSUInteger visualLineCount;
- (instancetype)initWithText:(NSAttributedString *)text
                       width:(CGFloat)width
                  lineHeight:(CGFloat)lineHeight
                        wrap:(BOOL)wrap;
// Returns NO without mutation when the existing geometry cannot be reused.
- (BOOL)updateText:(NSAttributedString *)text width:(CGFloat)width lineHeight:(CGFloat)lineHeight wrap:(BOOL)wrap;
- (NSUInteger)offsetAtPoint:(NSPoint)point;
- (NSRect)caretRectAtOffset:(NSUInteger)offset downstream:(BOOL)downstream;
- (NSArray<NSValue *> *)rectsForRange:(NSRange)range;
- (NSArray<NSValue *> *)rectsForRange:(NSRange)range visibleRect:(NSRect)visibleRect;
- (NSUInteger)offsetByMovingVerticallyFrom:(NSUInteger)offset
                                direction:(NSInteger)direction
                               preferredX:(CGFloat)x;
- (void)drawInContext:(CGContextRef)context origin:(NSPoint)origin dirtyRect:(NSRect)dirtyRect;
@end

NS_ASSUME_NONNULL_END
