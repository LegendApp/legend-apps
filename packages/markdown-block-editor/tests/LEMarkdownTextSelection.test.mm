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
    [controller invalidate];
    std::cout << "Markdown native selection tests passed\n";
  }
}
