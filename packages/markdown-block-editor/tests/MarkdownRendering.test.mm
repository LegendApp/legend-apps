#import <AppKit/AppKit.h>
#import "MarkdownASTNode.h"
#import "RenderedMarkdownSegment.h"
#import "ENRMInputScrolling.h"
#import "ENRMInputMeasurement.h"

#define ENRMPlatformTextView NSTextView
#define ENRMSetNeedsDisplay(view) [(view) setNeedsDisplay:YES]
#define RCTUITextView NSTextView
#define ENRMTapRecognizer NSClickGestureRecognizer
static NSAttributedString *ENRMGetAttributedText(NSTextView *view) { return view.textStorage; }
#include "TextHitTest.inc"
#include "SplitSegments.inc"

@interface InputLayoutManager : NSLayoutManager
@property NSUInteger layoutPasses;
@end
@implementation InputLayoutManager
- (void)ensureLayoutForTextContainer:(NSTextContainer *)container
{
  ++_layoutPasses;
  [super ensureLayoutForTextContainer:container];
}
@end

@interface InputView : NSTextView
@property (readonly) CGSize contentSize;
@end
@implementation InputView
- (CGSize)contentSize { return self.frame.size; }
#include "InputPreDraw.inc"
@end

static void ENRMSetContentSize(InputView *text, CGSize size) {}
#include "InputRefresh.inc"
@interface InputHost : NSView {
  NSView *_scrollContainerView;
  NSScrollView *_scrollView;
  InputView *_textView;
}
@property (readonly) InputView *textView;
- (void)applyTextViewLayout;
- (void)scheduleRelayoutIfNeeded;
- (void)_performRelayout;
- (CGSize)measureSize:(CGFloat)width;
@end
@implementation InputHost
- (instancetype)initWithFrame:(NSRect)frame
{
  if (self = [super initWithFrame:frame]) {
    _scrollContainerView = [[NSView alloc] initWithFrame:self.bounds];
    _scrollView = [NSScrollView new];
    _textView = [[InputView alloc] initWithFrame:self.bounds];
    _textView.verticallyResizable = YES;
    _textView.horizontallyResizable = YES;
    _textView.textContainerInset = NSZeroSize;
    _textView.textContainer.lineFragmentPadding = 0;
    _textView.textContainer.widthTracksTextView = YES;
    [_textView.textContainer replaceLayoutManager:[InputLayoutManager new]];
    ENRMConfigureInputScrolling(_scrollContainerView, _scrollView, _textView, NO);
    [self addSubview:_scrollContainerView];
  }
  return self;
}
- (InputView *)textView { return _textView; }
#include "InputLayout.inc"
@end

// The activation wrapper only needs the renderer's native-touch ownership contract.
@interface RCTViewComponentView : NSView
@property BOOL imagePressEnabled;
- (void *)touchEventEmitterAtPoint:(CGPoint)point;
@end
@implementation RCTViewComponentView
- (void *)touchEventEmitterAtPoint:(CGPoint)point { return self.imagePressEnabled ? nullptr : (__bridge void *)self; }
@end
@interface EnrichedMarkdown : RCTViewComponentView
@end
@implementation EnrichedMarkdown
@end
@interface EnrichedMarkdownText : RCTViewComponentView
@end
@implementation EnrichedMarkdownText
@end
@interface ActivationView : NSView {
  BOOL _contentsHidden;
  NSView *_editorInput;
}
@end
@implementation ActivationView
#include "ImageActivation.inc"
@end

static void require(BOOL condition, NSString *message)
{
  if (!condition) { NSLog(@"FAIL %@", message); exit(1); }
}

int main()
{
  @autoreleasepool {
    MarkdownASTNode *root = [[MarkdownASTNode alloc] initWithType:MarkdownNodeTypeDocument];
    MarkdownASTNode *before = [[MarkdownASTNode alloc] initWithType:MarkdownNodeTypeParagraph];
    MarkdownASTNode *math = [[MarkdownASTNode alloc] initWithType:MarkdownNodeTypeLatexMathDisplay];
    MarkdownASTNode *latex = [[MarkdownASTNode alloc] initWithType:MarkdownNodeTypeText];
    latex.content = @"\\int_0^1 x^2\\,dx";
    [math addChild:latex];
    MarkdownASTNode *after = [[MarkdownASTNode alloc] initWithType:MarkdownNodeTypeParagraph];
    [root addChild:before]; [root addChild:math]; [root addChild:after];
    NSArray *segments = ENRMSplitASTIntoSegments(root);
    require(segments.count == 3, @"block math must have a segment on macOS");
    require([segments[0] nodes][0] == before && [segments[2] nodes][0] == after,
            @"text before and after math must remain separate and visible");
    require([[segments[1] latex] isEqual:latex.content], @"math segment must contain the formula");

    NSView *parent = [[NSView alloc] initWithFrame:NSMakeRect(0, 0, 500, 400)];
    ActivationView *activation = [[ActivationView alloc] initWithFrame:parent.bounds];
    EnrichedMarkdown *renderer = [[EnrichedMarkdown alloc] initWithFrame:parent.bounds];
    NSTextView *text = [[NSTextView alloc] initWithFrame:parent.bounds];
    [parent addSubview:activation]; [activation addSubview:renderer]; [renderer addSubview:text];
    text.textContainerInset = NSMakeSize(7, 109);
    NSTextAttachment *attachment = [NSTextAttachment new];
    NSImage *image = [[NSImage alloc] initWithSize:NSMakeSize(160, 80)];
    attachment.attachmentCell = [[NSTextAttachmentCell alloc] initImageCell:image];
    NSMutableAttributedString *content = [[NSAttributedString attributedStringWithAttachment:attachment] mutableCopy];
    [content addAttribute:@"imageURL" value:@"file:///image.png" range:NSMakeRange(0, 1)];
    [text.textStorage setAttributedString:content];
    [text.layoutManager ensureLayoutForTextContainer:text.textContainer];
    NSRect bounds = [text.layoutManager boundingRectForGlyphRange:NSMakeRange(0, 1) inTextContainer:text.textContainer];
    renderer.imagePressEnabled = YES;
    for (NSNumber *fraction in @[@0.1, @0.5, @0.9]) {
      NSPoint local = NSMakePoint(NSMinX(bounds) + bounds.size.width * fraction.doubleValue + text.textContainerOrigin.x,
                                 NSMidY(bounds) + text.textContainerOrigin.y);
      require(ENRMCharacterIndexAtPoint(text, local) == 0, @"every part of the image must hit its attachment");
      NSPoint point = [text convertPoint:local toView:parent];
      require([activation hitTest:point] == text, @"image clicks must reach the renderer instead of activating editing");
      renderer.imagePressEnabled = NO;
      require([activation hitTest:point] == activation, @"images without press handlers must still activate editing");
      renderer.imagePressEnabled = YES;
    }
    require(ENRMCharacterIndexAtPoint(text, NSMakePoint(450, 350)) == NSNotFound, @"blank space must not open an image");

    InputHost *host = [[InputHost alloc] initWithFrame:NSMakeRect(0, 0, 180, 54)];
    InputView *input = host.textView;
    InputLayoutManager *layout = (InputLayoutManager *)input.layoutManager;
    input.layoutManager.allowsNonContiguousLayout = YES;
    // Shortcuts remove their prefix and apply these paragraph metrics. Exercise
    // transient empty list anchors, wrapped items, and a return to heading size.
    for (NSUInteger cycle = 0; cycle < 50; ++cycle) {
      for (NSNumber *kind in @[@0, @1, @2, @0]) {
        BOOL heading = kind.integerValue == 0;
        NSMutableParagraphStyle *paragraph = [NSMutableParagraphStyle new];
        paragraph.minimumLineHeight = paragraph.maximumLineHeight = heading ? 54 : 34;
        paragraph.firstLineHeadIndent = paragraph.headIndent = heading ? 0 : 24;
        NSDictionary *attrs = @{NSFontAttributeName: [NSFont systemFontOfSize:heading ? 44 : 22],
                                NSParagraphStyleAttributeName: paragraph};
        input.typingAttributes = attrs;
        for (NSString *value in @[@"item", @"", @"item that wraps onto several lines in this narrow editor\n"]) {
          [input.textStorage setAttributedString:[[NSAttributedString alloc] initWithString:value attributes:attrs]];
          input.selectedRange = NSMakeRange(value.length, 0);
          NSRect expectedFrame = NSMakeRect(0, 0, 180, 54);
          input.frame = expectedFrame;
          NSUInteger before = layout.layoutPasses;
          [host applyTextViewLayout];
          require(layout.layoutPasses == before, @"view layout must not synchronously re-enter TextKit");
          [host scheduleRelayoutIfNeeded];
          [host scheduleRelayoutIfNeeded];
          require(layout.layoutPasses == before, @"text-change relayout must wait until the next run loop");
          NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:1];
          while (layout.layoutPasses == before && deadline.timeIntervalSinceNow > 0) {
            [[NSRunLoop currentRunLoop] runMode:NSDefaultRunLoopMode beforeDate:deadline];
          }
          require(layout.layoutPasses == before + 1, @"relayout requests must coalesce into one full layout pass");
          require(layout.firstUnlaidCharacterIndex == value.length, @"deferred layout must include every character");
          require(NSEqualRects(input.frame, expectedFrame), @"list/heading layout must retain the Fabric editor frame");
          if (value.length > 0) {
            NSRect firstLine = [layout lineFragmentUsedRectForGlyphAtIndex:0 effectiveRange:NULL];
            firstLine = NSOffsetRect(firstLine, input.textContainerOrigin.x, input.textContainerOrigin.y);
            require(NSIntersectsRect(firstLine, input.bounds), @"converted text must remain visible inside the editor");
          }
          if ([value hasSuffix:@"\n"]) {
            require(layout.extraLineFragmentTextContainer == input.textContainer, @"layout must include trailing list caret fragment");
          }
          [input viewWillDraw];
          require(layout.layoutPasses == before + 1, @"display callbacks must not force another layout pass");
          require(NSEqualRects(input.frame, expectedFrame), @"drawing must not displace the editor");
        }
      }
    }
    NSLog(@"PASS math segments, image hits/activation, and 600 deferred heading/list layouts with stable frames");
  }
}
