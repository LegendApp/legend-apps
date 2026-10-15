#import "../ios/LEMarkdownTextSelection.h"
#include <cassert>
#include <iostream>

@interface LEMarkdownTextSelection (Tests)
- (NSEvent *)handleEvent:(NSEvent *)event;
- (BOOL)moveVertically:(NSInteger)direction;
@end
@interface TestMarkdownCanvas : NSView
@end
@implementation TestMarkdownCanvas
- (BOOL)isFlipped { return YES; }
@end
@interface TestMarkdownCodePreview : TestMarkdownCanvas
@property (nonatomic, copy) NSAttributedString *attributedCode;
@property (nonatomic) NSPoint textOrigin;
@end
@implementation TestMarkdownCodePreview
@end

static LEMarkdownSelectionBlock *makeBlock(NSView *host, NSInteger index, NSString *text, CGFloat y) {
  NSTextView *view = [[NSTextView alloc] initWithFrame:NSMakeRect(10, y, 220, 60)];
  view.font = [NSFont monospacedSystemFontOfSize:16 weight:NSFontWeightRegular];
  view.string = text;
  view.textContainerInset = NSMakeSize(0, 0);
  view.textContainer.lineFragmentPadding = 0;
  [host addSubview:view];
  [view.layoutManager ensureLayoutForTextContainer:view.textContainer];
  LEMarkdownSelectionBlock *block = [LEMarkdownSelectionBlock new];
  block.blockId = [NSString stringWithFormat:@"b%ld", index]; block.index = index;
  block.view = view; block.textViews = @[view]; block.markdown = text; block.type = @"paragraph";
  // Geometry tests use literal text; production supplies rich-text serialization.
  block.markdownForRange = ^NSString *(NSRange range) { return [text substringWithRange:range]; };
  return block;
}
static NSPoint pointAt(LEMarkdownSelectionBlock *block, NSUInteger offset) {
  NSTextView *view = block.textViews.firstObject;
  NSUInteger glyph = [view.layoutManager glyphIndexForCharacterAtIndex:offset];
  NSRect line = [view.layoutManager lineFragmentRectForGlyphAtIndex:glyph effectiveRange:nullptr];
  NSPoint point = [view.layoutManager locationForGlyphAtIndex:glyph];
  point.x += NSMinX(line) + view.textContainerOrigin.x + 0.1;
  point.y = NSMidY(line) + view.textContainerOrigin.y;
  return [view convertPoint:point toView:nil];
}
static NSEvent *mouse(NSWindow *window, NSEventType type, NSPoint point) {
  return [NSEvent mouseEventWithType:type location:point modifierFlags:0 timestamp:0 windowNumber:window.windowNumber context:nil eventNumber:0 clickCount:1 pressure:1];
}
int main() {
  @autoreleasepool {
    [NSApplication sharedApplication];
    NSWindow *window = [[NSWindow alloc] initWithContentRect:NSMakeRect(0, 0, 400, 400) styleMask:NSWindowStyleMaskBorderless backing:NSBackingStoreBuffered defer:NO];
    TestMarkdownCanvas *host = [[TestMarkdownCanvas alloc] initWithFrame:NSMakeRect(0, 0, 400, 400)];
    window.contentView = host;
    LEMarkdownSelectionBlock *a = makeBlock(host, 0, @"first paragraph", 10);
    LEMarkdownSelectionBlock *b = makeBlock(host, 1, @"second paragraph that wraps onto another visual line", 90);
    __block NSArray *blocks = @[a, b];
    __block NSDictionary *selection = nil;
    __block BOOL dragging = NO;
    LEMarkdownTextSelection *controller = [[LEMarkdownTextSelection alloc] initWithHost:host];
    controller.blocks = ^NSArray *{ return blocks; };
    controller.onChange = ^(NSString *json, BOOL activeDrag) {
      selection = json.length ? [NSJSONSerialization JSONObjectWithData:[json dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil] : nil;
      dragging = activeDrag;
    };
    [controller handleEvent:mouse(window, NSEventTypeLeftMouseDown, pointAt(a, 3))];
    [controller handleEvent:mouse(window, NSEventTypeLeftMouseDragged, pointAt(b, 5))];
    assert(controller.hasSelection && dragging);
    assert([selection[@"anchor"][@"offset"] integerValue] == 3);
    assert([selection[@"focus"][@"offset"] integerValue] == 5);
    assert([selection[@"anchor"][@"afterMarkdown"] isEqualToString:@"st paragraph"]);
    [controller handleEvent:mouse(window, NSEventTypeLeftMouseUp, pointAt(b, 5))];
    assert(!dragging);
    // Floating controls can overlap a row geometrically without targeting it.
    NSButton *toolbarButton = [[NSButton alloc] initWithFrame:a.view.frame];
    [host addSubview:toolbarButton positioned:NSWindowAbove relativeTo:nil];
    NSDictionary *selectionBeforeToolbar = selection;
    NSEvent *toolbarClick = mouse(window, NSEventTypeLeftMouseDown, pointAt(a, 3));
    assert([controller handleEvent:toolbarClick] == toolbarClick);
    assert(controller.hasSelection && [selection isEqual:selectionBeforeToolbar]);
    [toolbarButton removeFromSuperview];
    // Endpoint state survives virtualization; mounted rows only supply geometry.
    blocks = @[b]; [controller refresh]; assert(controller.hasSelection);
    blocks = @[a, b]; [controller refresh];
    [controller handleEvent:mouse(window, NSEventTypeLeftMouseDown, pointAt(b, 26))];
    assert(!selection);
    [controller handleEvent:mouse(window, NSEventTypeLeftMouseDragged, pointAt(a, 2))];
    assert([selection[@"anchor"][@"offset"] integerValue] == 26);
    assert([selection[@"focus"][@"offset"] integerValue] == 2);
    [controller handleEvent:mouse(window, NSEventTypeLeftMouseUp, pointAt(a, 2))];
    // Shift-down uses a visual row, not the entire next paragraph.
    [controller setSelectionJSON:@""];
    [window makeFirstResponder:a.textViews.firstObject];
    a.textViews.firstObject.selectedRange = NSMakeRange(4, 0);
    assert([controller moveVertically:1]);
    assert([selection[@"focus"][@"blockId"] isEqualToString:@"b1"]);
    assert([selection[@"focus"][@"offset"] integerValue] == 4);
    assert([controller moveVertically:1]);
    assert([selection[@"focus"][@"offset"] integerValue] > 4);
    assert([selection[@"focus"][@"offset"] integerValue] < b.markdown.length);
    __block NSString *collapsedBlock = nil;
    controller.onCollapse = ^(NSString *blockId, NSPoint point) { collapsedBlock = blockId; };
    NSEvent *right = [NSEvent keyEventWithType:NSEventTypeKeyDown location:NSZeroPoint modifierFlags:0 timestamp:0 windowNumber:window.windowNumber context:nil characters:@"" charactersIgnoringModifiers:@"" isARepeat:NO keyCode:124];
    assert([controller handleEvent:right] == nil);
    assert(!controller.hasSelection && !selection);
    assert([collapsedBlock isEqualToString:@"b1"]);
    // A keyboard step into a not-yet-mounted row resumes once it registers.
    [controller setSelectionJSON:@""];
    blocks = @[a];
    __block NSInteger revealedIndex = -1;
    controller.onReveal = ^(NSInteger index, BOOL upwards) { revealedIndex = index; };
    a.textViews.firstObject.selectedRange = NSMakeRange(4, 0);
    assert([controller moveVertically:1]);
    assert(revealedIndex == 1 && !controller.hasSelection);
    blocks = @[a, b]; [controller refresh];
    assert(controller.hasSelection);
    assert([selection[@"anchor"][@"offset"] integerValue] == 4);
    assert([selection[@"focus"][@"blockId"] isEqualToString:@"b1"]);
    // A preview's code body has no fences and sits below a language header.
    // Resolve its click before an editor with different geometry replaces it.
    LEMarkdownSelectionBlock *code = makeBlock(host, 2, @"const café = '🌍';\nsecond line", 200);
    code.type = @"codeBlock";
    // Production code previews draw their attributed text without an NSTextView.
    TestMarkdownCodePreview *preview = [[TestMarkdownCodePreview alloc] initWithFrame:NSMakeRect(20, 200, 220, 90)];
    preview.attributedCode = [code.textViews.firstObject.textStorage copy];
    preview.textOrigin = NSMakePoint(17, 13);
    preview.bounds = NSMakeRect(8, 0, 80, 90);
    [host addSubview:preview];
    LEMarkdownSelectionBlock *drawnCode = [LEMarkdownSelectionBlock new];
    drawnCode.blockId = code.blockId; drawnCode.type = @"codeBlock";
    drawnCode.view = preview; drawnCode.textViews = @[];
    NSPoint (^codePoint)(NSUInteger, BOOL) = ^NSPoint(NSUInteger offset, BOOL drawn) {
      NSPoint point = pointAt(code, offset);
      if (!drawn) return point;
      point = [code.textViews.firstObject convertPoint:point fromView:nil];
      point.x += preview.textOrigin.x; point.y += preview.textOrigin.y;
      return [preview convertPoint:point toView:nil];
    };
    for (NSString *opening in @[@"```ts\n", @"~~~~swift\n", @"  ```js\r\n"]) {
      BOOL crlf = [opening hasSuffix:@"\r\n"];
      NSString *body = [code.textViews.firstObject.string stringByReplacingOccurrencesOfString:@"\n" withString:crlf ? @"\r\n" : @"\n"];
      code.markdown = [NSString stringWithFormat:@"%@%@\n%@", opening, body, [opening hasPrefix:@"~"] ? @"~~~~" : @"```"];
      drawnCode.markdown = code.markdown;
      for (LEMarkdownSelectionBlock *rendered in @[code, drawnCode]) {
        blocks = @[rendered];
        for (NSNumber *offset in @[@0, @6, @21]) {
          NSValue *value = [controller codeSelectionForBlock:code.blockId atPoint:codePoint(offset.unsignedIntegerValue, rendered == drawnCode) clickCount:1];
          NSUInteger precedingCRs = crlf ? [[code.textViews.firstObject.string substringToIndex:offset.unsignedIntegerValue] componentsSeparatedByString:@"\n"].count - 1 : 0;
          assert(value && NSEqualRanges(value.rangeValue, NSMakeRange(opening.length + offset.unsignedIntegerValue + precedingCRs, 0)));
        }
        NSRange word = [controller codeSelectionForBlock:code.blockId atPoint:codePoint(7, rendered == drawnCode) clickCount:2].rangeValue;
        assert([[code.markdown substringWithRange:word] isEqual:@"café"]);
      }
    }
    blocks = @[code];
    code.input = code.textViews.firstObject;
    assert(![controller codeSelectionForBlock:code.blockId atPoint:pointAt(code, 6) clickCount:1]);
    code.input = nil;
    code.type = @"paragraph";
    assert(![controller codeSelectionForBlock:code.blockId atPoint:pointAt(code, 6) clickCount:1]);
    [controller invalidate];
    std::cout << "Markdown native selection tests passed\n";
  }
}
