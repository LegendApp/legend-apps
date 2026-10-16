#import <AppKit/AppKit.h>
#import "MarkdownASTNode.h"
#import "RenderedMarkdownSegment.h"
#import "ENRMInputScrolling.h"
#import "ENRMInputMeasurement.h"
#import "ENRMInputParser.h"
#import "ENRMMarkdownSerializer.h"
#import "ENRMMarkdownParser.h"
#import "ENRMMarkdownShortcutMatcher.h"
#import "ENRMBlockEditCoordinator.h"
#import "ENRMBlockStore.h"

#define ENRMPlatformTextView NSTextView
#define ENRMSetNeedsDisplay(view) [(view) setNeedsDisplay:YES]
#define RCTUITextView NSTextView
#define ENRMTapRecognizer NSClickGestureRecognizer
static NSAttributedString *ENRMGetAttributedText(NSTextView *view) { return view.textStorage; }
#include "TextHitTest.inc"
NSString *const SpoilerAttributeName = @"Spoiler";
typedef struct { BOOL found; NSInteger index; BOOL checked; NSRange itemRange; } TaskListHitTestResult;
NSString *const TaskItemAttribute = @"TaskItem";
NSString *const TaskIndexAttribute = @"TaskIndex";
NSString *const TaskCheckedAttribute = @"TaskChecked";
static BOOL ENRMParagraphIsRTL(NSParagraphStyle *style) { return style.baseWritingDirection == NSWritingDirectionRightToLeft; }
#include "TaskHitTest.inc"
#include "InteractiveHitTest.inc"
#include "SplitSegments.inc"

NSString *const ENRMBlockTypeAttributeName = @"ENRMBlockType";
#define UIFont NSFont
#define UIFontDescriptor NSFontDescriptor
#define UIFontDescriptorTraitBold NSFontDescriptorTraitBold
static CGFloat UIFontLineHeight(NSFont *font) { return ceil(font.ascender - font.descender + font.leading); }
@interface ENRMImageAttachment : NSTextAttachment
@property BOOL isInline;
@end
@implementation ENRMImageAttachment
@end
#include "HeadingBaseline.inc"

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
static NSString *ENRMGetPlainText(NSTextView *view) { return view.string; }
static void ENRMSetPlainText(NSTextView *view, NSString *text) { view.string = text; }
#include "InputRefresh.inc"

// Keep the real phase gate and parser; probe the formatter calls without React
// props or the unrelated renderer dependencies.
typedef NS_ENUM(NSInteger, ENRMEditPhase) {
  ENRMEditPhaseIdle, ENRMEditPhaseProcessing, ENRMEditPhaseFormatting, ENRMEditPhaseImporting,
};
@interface InputSession : NSObject {
  ENRMEditPhase _phase;
}
@property (readonly) BOOL shouldSuppressFormatting;
@property (readonly) BOOL shouldSuppressSelectionSideEffects;
@property BOOL isComposing;
- (void)enterPhase:(ENRMEditPhase)phase;
- (void)exitPhase;
@end
@implementation InputSession
- (BOOL)shouldSuppressSelectionSideEffects { return NO; }
#include "InputSession.inc"
@end

@interface FormattingProbe : NSObject
@property NSArray *allRanges;
@property NSArray<ENRMBlockRange *> *appliedBlocks;
@property NSUInteger formattingPasses;
- (void)setRanges:(NSArray *)ranges;
- (void)applyFormattingRanges:(NSArray *)ranges toTextView:(NSTextView *)view style:(id)style scopedToRange:(NSRange)scope;
- (void)applyBlockRanges:(NSArray *)ranges toTextView:(NSTextView *)view style:(id)style scopedToRange:(NSRange)scope;
- (void)resetForSelectionChange;
- (void)refreshAllStyling;
- (NSRange)selectionAdjustedForAtomicLinks:(NSRange)selection;
@end
@implementation FormattingProbe
- (void)setRanges:(NSArray *)ranges { self.allRanges = ranges; }
- (void)applyFormattingRanges:(NSArray *)ranges toTextView:(NSTextView *)view style:(id)style scopedToRange:(NSRange)scope {}
- (void)applyBlockRanges:(NSArray *)ranges toTextView:(NSTextView *)view style:(id)style scopedToRange:(NSRange)scope
{
  self.appliedBlocks = ranges;
  ++_formattingPasses;
}
- (void)resetForSelectionChange {}
- (void)refreshAllStyling {}
- (NSRange)selectionAdjustedForAtomicLinks:(NSRange)selection
{
  // Model the atomic-link policy that the native delegate used to apply.
  return NSMakeRange(18, 0);
}
@end

@protocol ImportEvents
- (void)emitOnKeyPress:(NSString *)text;
- (void)emitOnChangeText;
- (void)emitOnChangeSelection;
- (void)emitOnChangeState;
- (void)emitCaretRectChangeIfNeeded;
@end

@interface InlineCodeStyle : NSObject
@property NSFont *inlineCodeFont;
@property NSColor *inlineCodeColor;
@property NSColor *inlineCodeBackgroundColor;
@end
@implementation InlineCodeStyle
@end

@interface InputHost : NSView {
  NSView *_scrollContainerView;
  NSScrollView *_scrollView;
  InputView *_textView;
  InputSession *_editSession;
  FormattingProbe *_formattingStore, *_blockStore, *_formatter, *_detectorPipeline;
  InlineCodeStyle *_formatterStyle;
  id<ImportEvents> _inputEventEmitter;
  FormattingProbe *_typingController;
  NSUInteger _lastTextLength;
  NSRange _lastSelectedRange, _preEditSelectedRange;
  BOOL _preEditParagraphWasEmpty, _preEditReplacedNewline;
}
@property BOOL deletedAtomicLink;
@property (readonly) InputView *textView;
@property (readonly) FormattingProbe *formatter;
- (void)setValue:(NSString *)markdown;
- (void)setValuePreservingSelection:(NSString *)markdown;
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
#include "InputWidth.inc"
    [_textView.textContainer replaceLayoutManager:[InputLayoutManager new]];
    ENRMConfigureInputScrolling(_scrollContainerView, _scrollView, _textView, NO);
    [self addSubview:_scrollContainerView];
    _editSession = [InputSession new];
    _formattingStore = [FormattingProbe new];
    _blockStore = [FormattingProbe new];
    _formatter = [FormattingProbe new];
    _formatterStyle = [InlineCodeStyle new];
    _formatterStyle.inlineCodeFont = [NSFont monospacedSystemFontOfSize:14 weight:NSFontWeightRegular];
    _detectorPipeline = [FormattingProbe new];
  }
  return self;
}
- (InputView *)textView { return _textView; }
- (FormattingProbe *)formatter { return _formatter; }
- (NSString *)blockStyleMarkdownForMarkdown:(NSString *)markdown { return markdown; }
- (BOOL)applyBlockStyleForMarkdown:(NSString *)markdown { return NO; }
- (void)resetBaseTypingAttributes { _textView.typingAttributes = @{}; }
- (void)refreshHangingMarkdownPrefixForMarkdown:(NSString *)markdown {}
- (void)updatePlaceholderVisibility {}
- (void)applyWritingDirection {}
- (void)applyParagraphBaselineOffset {}
- (void)requestHeightUpdate {}
- (void)updateActiveMention {}
- (BOOL)deleteLinkForReplacementRange:(NSRange)range replacementText:(NSString *)text
{
  self.deletedAtomicLink = YES;
  return YES;
}
- (void)capturePreEditBlockForRange:(NSRange)range {}
- (BOOL)preEditParagraphWasEmpty:(NSRange)range { return NO; }
- (BOOL)replacedRangeTouchesNewline:(NSRange)range { return NO; }
#include "InputDeletion.inc"
#include "InputSelection.inc"
#include "InputLayout.inc"
#include "InputImport.inc"
@end

// Run the real shortcut method, matcher and block stores; the replacement
// boundary applies its requested edit without the unrelated view/event plumbing.
@protocol ShortcutTyping
- (void)syncWithCursorBlock;
@end

@interface ShortcutHost : NSObject {
  NSTextView *_textView;
  ENRMMarkdownShortcutsConfig _markdownShortcutsConfig;
  ENRMBlockStore *_blockStore;
  ENRMBlockEditCoordinator *_blockCoordinator;
  id<ShortcutTyping> _typingController;
  NSRange _lastSelectedRange;
}
@property (readonly) NSTextView *textView;
@property (readonly) ENRMBlockStore *blockStore;
- (instancetype)initWithMarkdown:(NSString *)markdown;
- (BOOL)applyMarkdownShortcutForEditAtLocation:(NSUInteger)location deletedLength:(NSUInteger)deleted insertedLength:(NSUInteger)inserted;
@end
@implementation ShortcutHost
- (instancetype)initWithMarkdown:(NSString *)markdown
{
  if (self = [super init]) {
    ENRMParseResult *parsed = [[ENRMInputParser new] parseToPlainTextAndRanges:markdown];
    _textView = [NSTextView new];
    _textView.string = parsed.plainText;
    _blockStore = [ENRMBlockStore new];
    [_blockStore setRanges:parsed.blockRanges];
    _blockCoordinator = [[ENRMBlockEditCoordinator alloc] initWithBlockStore:_blockStore];
    _markdownShortcutsConfig = {YES, YES, YES};
  }
  return self;
}
- (NSTextView *)textView { return _textView; }
- (ENRMBlockStore *)blockStore { return _blockStore; }
- (void)replaceTextInRange:(NSRange)selection withText:(NSString *)text
        formattingRanges:(NSArray *)ranges blockRanges:(NSArray<ENRMBlockRange *> *)blocks
{
  [_textView.textStorage replaceCharactersInRange:selection withString:text];
  [_blockStore adjustForEditAtLocation:selection.location deletedLength:selection.length insertedLength:text.length];
  for (ENRMBlockRange *block in blocks) {
    [_blockStore setBlockType:block.type level:block.level
           forParagraphRange:NSMakeRange(selection.location + block.range.location, block.range.length) inText:_textView.string];
  }
  [_blockStore normalizeToLineBoundsInText:_textView.string];
}
- (void)updateEmptyBulletMarker {}
#include "InputShortcut.inc"
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

static NSString *textContent(MarkdownASTNode *node)
{
  NSMutableString *text = [node.content mutableCopy] ?: [NSMutableString new];
  for (MarkdownASTNode *child in node.children) [text appendString:textContent(child)];
  return text;
}

@protocol ENRMImageLayoutObserver
- (void)imageAttachmentDidResolveLayout;
@end
@interface ImageLayoutHost : NSTextView <ENRMImageLayoutObserver>
@property NSUInteger notifications;
- (id<ENRMImageLayoutObserver>)enrm_imageLayoutObserver;
@end
@implementation ImageLayoutHost
- (id<ENRMImageLayoutObserver>)enrm_imageLayoutObserver { return self; }
- (void)imageAttachmentDidResolveLayout { ++_notifications; }
@end
@interface ImageLayoutProbe : NSObject
@property CGFloat cachedMaxHeight;
@property CGFloat cachedAspectRatio;
- (void)notifyImageLayoutObserver:(ImageLayoutHost *)textView;
@end
@implementation ImageLayoutProbe
#include "ImageLayoutNotification.inc"
@end

int main()
{
  @autoreleasepool {
    ENRMInputParser *inlineParser = [ENRMInputParser new];
    for (NSDictionary *sample in @[
      @{@"source": @"### Heading with `calculateItemsInView`", @"plain": @"Heading with calculateItemsInView"},
      @{@"source": @"Before ``a`b`` after", @"plain": @"Before a`b after"},
      @{@"source": @"**bold `x`**", @"plain": @"bold x"},
      @{@"source": @"`&amp; **literal**`", @"plain": @"&amp; **literal**"},
      @{@"source": @"` padded `", @"plain": @"padded"},
    ]) {
      ENRMParseResult *parsed = [inlineParser parseToPlainTextAndRanges:sample[@"source"]];
      require([parsed.plainText isEqual:sample[@"plain"]], @"inline code must hide only its source delimiters while editing");
      NSString *roundTrip = [ENRMMarkdownSerializer serializePlainText:parsed.plainText ranges:parsed.formattingRanges
          blockRanges:parsed.blockRanges blockPrefixProvider:^NSString *(ENRMBlockRange *block) {
            NSString *prefix = [@"" stringByPaddingToLength:block.level withString:@"#" startingAtIndex:0];
            return [prefix stringByAppendingString:@" "];
          }];
      require([roundTrip isEqual:sample[@"source"]], @"editing inline code must preserve its backticks, padding and nesting on serialization");
    }
    for (NSString *edited in @[@"co`de", @"`code", @"code`", @" code ", @"   "]) {
      ENRMParseResult *parsed = [inlineParser parseToPlainTextAndRanges:@"`code`"];
      parsed.formattingRanges[0].range = NSMakeRange(0, edited.length);
      NSString *serialized = [ENRMMarkdownSerializer serializePlainText:edited ranges:parsed.formattingRanges];
      require([[[inlineParser parseToPlainTextAndRanges:serialized] plainText] isEqual:edited],
              [NSString stringWithFormat:@"typing code %@ must round trip through %@, got %@", edited, serialized,
               [[inlineParser parseToPlainTextAndRanges:serialized] plainText]]);
    }
    for (NSInteger level = 1; level <= 6; ++level) {
      NSFont *font = [NSFont boldSystemFontOfSize:26 - level * 2];
      NSMutableParagraphStyle *paragraph = [NSMutableParagraphStyle new];
      paragraph.minimumLineHeight = paragraph.maximumLineHeight = UIFontLineHeight(font) + 8;
      NSDictionary *attrs = @{NSFontAttributeName: font, NSParagraphStyleAttributeName: paragraph,
                               ENRMBlockTypeAttributeName: @(ENRMBlockTypeForHeadingLevel(level))};
      NSTextStorage *editing = [[NSTextStorage alloc] initWithString:@"Heading with inline text" attributes:attrs];
      NSMutableAttributedString *rendered = [[NSMutableAttributedString alloc] initWithAttributedString:editing];
      applyBaselineOffset(rendered, NSMakeRange(0, rendered.length));
      ENRMApplyInputParagraphBaselineOffset(editing, YES);
      require([[editing attribute:NSBaselineOffsetAttributeName atIndex:0 effectiveRange:NULL]
                isEqual:[rendered attribute:NSBaselineOffsetAttributeName atIndex:0 effectiveRange:NULL]],
              @"H1-H6 editing must use the rendered heading baseline");
    }
    NSTextView *taskView = [[NSTextView alloc] initWithFrame:NSMakeRect(0, 0, 200, 25)];
    taskView.textContainerInset = NSZeroSize;
    taskView.textContainer.lineFragmentPadding = 0;
    NSMutableParagraphStyle *taskParagraph = [NSMutableParagraphStyle new];
    taskParagraph.firstLineHeadIndent = taskParagraph.headIndent = 22;
    taskParagraph.minimumLineHeight = 25;
    [taskView.textStorage setAttributedString:[[NSAttributedString alloc] initWithString:@"Task unchecked"
        attributes:@{NSFontAttributeName: [NSFont systemFontOfSize:16], NSParagraphStyleAttributeName: taskParagraph,
                     @"TaskItem": @YES, @"TaskIndex": @0, @"TaskChecked": @NO}]];
    [taskView.layoutManager ensureLayoutForTextContainer:taskView.textContainer];
    require(isPointOnInteractiveElement(taskView, NSMakePoint(6, 12), NO, NO),
            @"checkbox gutter must retain its task toggle click even outside the text glyphs");
    require(!isPointOnInteractiveElement(taskView, NSMakePoint(28, 12), NO, NO),
            @"task body text must enter editing instead of consuming a checkbox action");
    ImageLayoutHost *imageHost = [ImageLayoutHost new];
    ImageLayoutProbe *imageLayout = [ImageLayoutProbe new];
    [imageLayout notifyImageLayoutObserver:imageHost];
    require(imageHost.notifications == 0, @"image re-measure must not re-enter the active layout pass");
    NSDate *imageDeadline = [NSDate dateWithTimeIntervalSinceNow:1];
    while (imageHost.notifications == 0 && imageDeadline.timeIntervalSinceNow > 0) {
      [[NSRunLoop mainRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.01]];
    }
    require(imageHost.notifications == 1, @"macOS fixed-height images must re-measure after their placeholder loads");
    ENRMMarkdownParser *parser = [ENRMMarkdownParser new];
    require([textContent([parser parseMarkdown:@"&amp; &#169; &#x1F600; &copy; &unknown;"])
             isEqualToString:@"& © 😀 © &unknown;"], @"named, decimal, hex, and unknown entities");
    require([textContent([parser parseMarkdown:@"`&amp;` \\&amp;"]) isEqualToString:@"&amp; &amp;"],
            @"code and escaped entity source must remain literal");
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

    for (NSString *attribute in @[@"linkURL", @"TaskItem", @"Spoiler"]) {
      [text.textStorage setAttributedString:[[NSAttributedString alloc] initWithString:@"Interactive text"
          attributes:@{NSFontAttributeName: [NSFont systemFontOfSize:16], attribute: @YES}]];
      [text.layoutManager ensureLayoutForTextContainer:text.textContainer];
      NSRect glyph = [text.layoutManager boundingRectForGlyphRange:NSMakeRange(0, 1) inTextContainer:text.textContainer];
      NSPoint local = NSMakePoint(NSMidX(glyph) + text.textContainerOrigin.x, NSMidY(glyph) + text.textContainerOrigin.y);
      NSPoint point = [text convertPoint:local toView:parent];
      require([activation hitTest:point] == text, @"renderer-owned links, checkboxes and spoilers must receive physical clicks");
      renderer.imagePressEnabled = NO;
      require([activation hitTest:point] == activation, @"ordinary text must still start editing");
      renderer.imagePressEnabled = YES;
    }

    renderer.imagePressEnabled = NO;
    // Native controls inside a preview own their clicks; the code body still edits.
    NSButton *copyButton = [[NSButton alloc] initWithFrame:NSMakeRect(420, 340, 48, 36)];
    [renderer addSubview:copyButton];
    require([activation hitTest:NSMakePoint(440, 355)] == copyButton,
            @"copy button must receive physical clicks through the activation wrapper");
    require([activation hitTest:NSMakePoint(380, 355)] == activation,
            @"clicking elsewhere in the code block must still start editing");

    InputHost *host = [[InputHost alloc] initWithFrame:NSMakeRect(0, 0, 180, 54)];
    InputView *input = host.textView;
    require(!input.allowsVibrancy, @"inline editor must not invalidate window vibrancy during drawing");
    require(!input.textContainer.widthTracksTextView, @"Fabric owns the editor container width");
    InputLayoutManager *layout = (InputLayoutManager *)input.layoutManager;
    input.layoutManager.allowsNonContiguousLayout = YES;
    // setValue must reach the formatter immediately after replacing its stores,
    // even when the same input remains mounted across every toolbar conversion.
    NSArray *markdowns = @[@"# Heading", @"- Heading", @"1. Heading", @"# Heading"];
    NSArray *types = @[@(ENRMInputBlockTypeHeading1), @(ENRMInputBlockTypeUnorderedListItem),
                      @(ENRMInputBlockTypeOrderedListItem), @(ENRMInputBlockTypeHeading1)];
    for (NSUInteger cycle = 0; cycle < 3; ++cycle) {
      for (NSUInteger index = 0; index < markdowns.count; ++index) {
        NSUInteger before = host.formatter.formattingPasses;
        [host setValue:markdowns[index]];
        require([input.string isEqualToString:@"Heading"], @"toolbar import must hide heading/list markup immediately");
        require(host.formatter.formattingPasses == before + 1, @"import phase must not suppress the new formatting pass");
        require(host.formatter.appliedBlocks.count == 1 && host.formatter.appliedBlocks[0].type == [types[index] integerValue],
                @"formatter must receive the new heading/bullet/numbered block instead of stale ranges");
        for (NSValue *selection in @[[NSValue valueWithRange:NSMakeRange(3, 0)], [NSValue valueWithRange:NSMakeRange(1, 4)]]) {
          input.selectedRange = selection.rangeValue;
          [host setValuePreservingSelection:markdowns[index]];
          require(NSEqualRanges(input.selectedRange, selection.rangeValue), @"native import must retain a caret or selection");
        }
      }
    }
    [host setValue:@"### Heading with `code`"];
    NSFont *inlineFont = [input.textStorage attribute:NSFontAttributeName atIndex:input.string.length - 1 effectiveRange:NULL];
    require([input.string isEqual:@"Heading with code"] && inlineFont.pointSize == 14,
            @"rich heading input must hide backticks and apply the configured code font after block styling");
    require([[[input textStorage] attribute:NSKernAttributeName atIndex:12 effectiveRange:NULL] doubleValue] == 3,
            @"inline code must keep the renderer spacing before its first glyph");
    [host setValue:@"[editable link text](https://example.com)"];
    require([[host textInputShouldChangeText:@"" inRange:NSMakeRange(2, 1)] isEqual:@""] && !host.deletedAtomicLink,
            @"backspace inside link text must retain the native character deletion rather than recursively deleting the whole link");
    for (NSValue *range in @[[NSValue valueWithRange:NSMakeRange(1, 0)],
                             [NSValue valueWithRange:NSMakeRange(5, 0)],
                             [NSValue valueWithRange:NSMakeRange(2, 4)]]) {
      input.selectedRange = range.rangeValue;
      [host textInputDidChangeSelection];
      require(NSEqualRanges(input.selectedRange, range.rangeValue),
              @"link clicks, arrow movement and partial selections must retain their native character range");
    }
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
          require(input.textContainer.containerSize.width == 180, @"editing must retain the supplied text width");
        }
      }
    }
    for (NSUInteger heading = 1; heading <= 6; heading++) {
      for (NSString *prefix in @[@"# ", @"## ", @"- ", @"1. "]) {
        NSString *markdown = [[@"" stringByPaddingToLength:heading withString:@"#" startingAtIndex:0] stringByAppendingString:@" Heading"];
        ShortcutHost *shortcut = [[ShortcutHost alloc] initWithMarkdown:markdown];
        [shortcut.textView.textStorage replaceCharactersInRange:NSMakeRange(0, 0) withString:prefix];
        [shortcut.blockStore adjustForEditAtLocation:0 deletedLength:0 insertedLength:prefix.length];
        [shortcut.blockStore normalizeToLineBoundsInText:shortcut.textView.string];
        shortcut.textView.selectedRange = NSMakeRange(prefix.length, 0);
        require([shortcut applyMarkdownShortcutForEditAtLocation:0 deletedLength:0 insertedLength:prefix.length],
                [NSString stringWithFormat:@"H%lu must consume typed %@ prefix without blur", heading, prefix]);
        require([shortcut.textView.string isEqualToString:@"Heading"], @"converted heading must not retain literal markup");
        require(NSEqualRanges(shortcut.textView.selectedRange, NSMakeRange(0, 0)), @"shortcut must retain the caret after removing markup");
        ENRMInputBlockType type = [prefix hasPrefix:@"#"] ? ENRMBlockTypeForHeadingLevel(prefix.length - 1)
          : [prefix hasPrefix:@"1"] ? ENRMInputBlockTypeOrderedListItem : ENRMInputBlockTypeUnorderedListItem;
        require(shortcut.blockStore.allRanges.count == 1 && shortcut.blockStore.allRanges[0].type == type,
                @"shortcut must replace the old heading block with the requested block");
      }
    }
    ShortcutHost *list = [[ShortcutHost alloc] initWithMarkdown:@"- Item"];
    [list.textView.textStorage replaceCharactersInRange:NSMakeRange(0, 0) withString:@"# "];
    [list.blockStore adjustForEditAtLocation:0 deletedLength:0 insertedLength:2];
    list.textView.selectedRange = NSMakeRange(2, 0);
    require(![list applyMarkdownShortcutForEditAtLocation:0 deletedLength:0 insertedLength:2],
            @"typing inside a list must retain its existing shortcut behavior");
    NSLog(@"PASS 24 typed heading conversions, list shortcut exclusion, toolbar import formatting/selection, math segments, image hits/activation, and 600 deferred heading/list layouts with stable frames");
  }
}
