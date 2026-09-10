#import "../macos/SourceInputView.h"
#include <cassert>
#include <iostream>

@interface LESourceInputView (SelectionTests)
- (void)selectionDragTick;
@end
@interface TestSourceCanvas : NSView
@end
@implementation TestSourceCanvas
- (BOOL)isFlipped { return YES; }
@end

static const NSRange implicitRange = {NSNotFound, 0};
static void closeUndoGroup(NSUndoManager *history) {
  while (history.groupingLevel > 0) [history endUndoGrouping];
}
int main() {
  @autoreleasepool {
    [NSApplication sharedApplication];
    LESourceInputView *input = [[LESourceInputView alloc] initWithFrame:NSMakeRect(0, 0, 600, 400)];
    __block NSUInteger revision = 0;
    input.onEdit = ^(NSString *json) {
      NSDictionary *event = [NSJSONSerialization JSONObjectWithData:[json dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil];
      assert([event[@"revision"] unsignedIntegerValue] == ++revision);
    };
    [input loadSource:@"ab\r\n👩🏽‍💻é\nlast"];
    [input insertText:@"first\n" replacementRange:NSMakeRange(0, 0)];
    assert([[input source] isEqualToString:@"first\nab\r\n👩🏽‍💻é\nlast"]);
    closeUndoGroup(input.undoManager);
    [input.undoManager undo];
    assert([[input source] isEqualToString:@"ab\r\n👩🏽‍💻é\nlast"]);
    [input.undoManager redo];
    assert([[input source] hasPrefix:@"first\n"]);
    revision = 0;
    [input loadSource:@"👩🏽‍💻é"];
    [input moveToEndOfDocument:nil];
    [input deleteBackward:nil];
    assert([[input source] isEqualToString:@"👩🏽‍💻"]);
    [input deleteBackward:nil];
    assert([[input source] isEqualToString:@""]);
    revision = 0;
    [input loadSource:@"hello\nworld"];
    [input setMarkedText:@"n" selectedRange:NSMakeRange(1, 0) replacementRange:NSMakeRange(0, 5)];
    assert(input.hasMarkedText);
    [input setMarkedText:@"ni" selectedRange:NSMakeRange(2, 0) replacementRange:implicitRange];
    assert([[input source] isEqualToString:@"ni\nworld"]);
    [input insertText:@"你" replacementRange:implicitRange];
    assert(!input.hasMarkedText);
    assert([[input source] isEqualToString:@"你\nworld"]);
    closeUndoGroup(input.undoManager);
    [input.undoManager undo];
    assert([[input source] isEqualToString:@"hello\nworld"]);
    [input.undoManager redo];
    assert([[input source] isEqualToString:@"你\nworld"]);
    NSRange actual;
    auto substring = [input attributedSubstringForProposedRange:NSMakeRange(0, 500) actualRange:&actual];
    assert([substring.string isEqualToString:input.source]);
    assert(actual.length == input.source.length);
    assert([input attributedSubstringForProposedRange:NSMakeRange(500, 5) actualRange:&actual] == nil);
    revision = 0;
    [input loadSource:@"one two three four five six seven eight nine ten"];
    LESourceRowView *row = [[LESourceRowView alloc] initWithFrame:NSMakeRect(0, 0, 200, 400)];
    row.lineId = 1;
    row.input = input;
    [row layout];
    assert(row.textLayout.visualLineCount > 1);
    [input moveDown:nil];
    NSRect caret = [row.textLayout caretRectAtOffset:input.head downstream:YES];
    assert(caret.origin.y == row.lineHeight);
    [input moveUp:nil];
    assert(input.head == 0);
    [input moveDownAndModifySelection:nil];
    assert(input.selectedRange.location == 0 && input.selectedRange.length > 0);
    row.input = nil;
    // A recycled/detached row may receive a late display callback. It must
    // neither access document zero nor build attributes from unset props.
    [row drawRect:row.bounds];
    revision = 0;
    [input loadSource:@"one\ntwo\nthree\nfour"];
    row.lineIndex = 3; row.lineId = 4; row.input = input;
    [input insertText:@"new\n" replacementRange:NSMakeRange(0, 0)];
    assert(row.lineIndex == 4);
    assert([[input textForRow:row] isEqualToString:@"four"]);
    assert([input offsetForRow:row] == 18);
    closeUndoGroup(input.undoManager);
    [input.undoManager undo];
    assert(row.lineIndex == 3);
    assert([[input textForRow:row] isEqualToString:@"four"]);
    revision = 0;
    [input loadSource:@"base"];
    input.undoManager.groupsByEvent = NO;
    NSMutableString *insertion = [NSMutableString stringWithString:@"x"];
    [input.undoManager beginUndoGrouping];
    [input insertText:insertion replacementRange:NSMakeRange(0, 0)];
    closeUndoGroup(input.undoManager);
    [insertion setString:@""];
    [input.undoManager beginUndoGrouping];
    [input insertNewline:nil];
    closeUndoGroup(input.undoManager);
    assert([[input source] isEqualToString:@"x\nbase"]);
    [input.undoManager undo];
    assert([[input source] isEqualToString:@"xbase"]);
    [input.undoManager undo];
    assert([[input source] isEqualToString:@"base"]);
    [input.undoManager redo];
    [input.undoManager redo];
    assert([[input source] isEqualToString:@"x\nbase"]);
    [input setAccessibilitySelectedTextRange:NSMakeRange(0, 2)];
    assert([[input accessibilitySelectedText] isEqualToString:@"x\n"]);
    [input.undoManager beginUndoGrouping];
    [input setAccessibilitySelectedText:@"Q"];
    assert([[input source] isEqualToString:@"Qbase"]);
    closeUndoGroup(input.undoManager);
    [input.undoManager undo];
    assert([[input source] isEqualToString:@"x\nbase"]);
    revision = 0;
    [input loadSource:[@"wrapped text " stringByPaddingToLength:4000 withString:@"wrapped text " startingAtIndex:0]];
    row.lineId = 1; row.lineIndex = 0;
    [row setFrame:NSMakeRect(0, 0, 240, 400)];
    [row layout];
    [row setFrameSize:NSMakeSize(240, row.textLayout.height)];
    NSScrollView *scroll = [[NSScrollView alloc] initWithFrame:NSMakeRect(0, 0, 240, 120)];
    scroll.documentView = row;
    for (NSUInteger i = 0; i < 40; i++) [input moveDown:nil];
    NSRect revealedCaret = [row.textLayout caretRectAtOffset:input.head downstream:YES];
    revealedCaret.origin.x += 64;
    assert(NSContainsRect(row.visibleRect, revealedCaret));
    // Only the first row is mounted. Repeated arrows must preserve horizontal
    // intent through a short line, including while the current row is absent.
    row.input = nil;
    [row removeFromSuperview];
    revision = 0;
    [input loadSource:@"abcdefghij\nx\nabcdefghij\n0123456789"];
    row.lineId = 1; row.lineIndex = 0; row.input = input;
    [row setFrame:NSMakeRect(0, 0, 240, 22)]; [row layout];
    [input setAccessibilitySelectedTextRange:NSMakeRange(8, 0)];
    [input moveDownAndModifySelection:nil];
    assert(input.anchor == 8 && input.head == 12); // end of short second line
    [input moveDownAndModifySelection:nil];
    assert(input.anchor == 8 && input.head == 21); // column 8, not column zero
    row.input = nil; // even a temporary gap with no mounted rows is supported
    [input moveDownAndModifySelection:nil];
    assert(input.head == 32 && input.anchor == 8);
    [input moveUpAndModifySelection:nil];
    assert(input.head == 21);
    [input moveUpAndModifySelection:nil];
    assert(input.head == 12);
    [input moveUpAndModifySelection:nil];
    assert(input.head == 8 && input.selectedRange.length == 0);

    // An unmounted wrapped target uses its first visual row going down, and
    // its last visual row going up. Tabs/Unicode share the renderer's geometry.
    revision = 0;
    NSString *wrapped = @"one two three four five six seven eight nine ten 👩🏽‍💻\tend";
    [input loadSource:[NSString stringWithFormat:@"abcdef\n%@\nabcdef", wrapped]];
    row.lineId = 1; row.lineIndex = 0; row.input = input; [row layout];
    LESourceRowView *targetRow = [[LESourceRowView alloc] initWithFrame:row.frame];
    targetRow.lineId = 2; targetRow.lineIndex = 1; targetRow.input = input; [targetRow layout];
    assert(targetRow.textLayout.visualLineCount > 1);
    CGFloat desiredX = [row.textLayout caretRectAtOffset:4 downstream:YES].origin.x;
    NSUInteger firstVisual = [targetRow.textLayout offsetAtPoint:NSMakePoint(desiredX, row.lineHeight / 2)];
    NSUInteger lastVisual = [targetRow.textLayout offsetAtPoint:NSMakePoint(desiredX, targetRow.textLayout.height - row.lineHeight / 2)];
    targetRow.input = nil;
    [input setAccessibilitySelectedTextRange:NSMakeRange(4, 0)]; [input moveDown:nil];
    assert(input.head == 7 + firstVisual);
    [input setAccessibilitySelectedTextRange:NSMakeRange(7 + wrapped.length + 1 + 4, 0)]; [input moveUp:nil];
    assert(input.head == 7 + lastVisual);

    // Offscreen native window: exercise controller-owned tracking without
    // moving the user's mouse or requiring screen-capture permissions.
    row.input = nil;
    revision = 0;
    NSMutableArray *texts = [NSMutableArray array];
    for (NSUInteger i = 0; i < 30; ++i) [texts addObject:@"abcdefghij"];
    [input loadSource:[texts componentsJoinedByString:@"\n"]];
    NSWindow *window = [[NSWindow alloc] initWithContentRect:NSMakeRect(0, 0, 240, 100) styleMask:NSWindowStyleMaskBorderless backing:NSBackingStoreBuffered defer:NO];
    [window.contentView addSubview:input];
    [input setFrame:NSMakeRect(0, 0, 240, 100)];
    NSScrollView *dragScroll = [[NSScrollView alloc] initWithFrame:input.bounds];
    [input addSubview:dragScroll];
    TestSourceCanvas *canvas = [[TestSourceCanvas alloc] initWithFrame:NSMakeRect(0, 0, 240, 30 * 22)];
    dragScroll.documentView = canvas;
    NSMutableArray<LESourceRowView *> *dragRows = [NSMutableArray array];
    for (NSUInteger i = 0; i < 8; ++i) {
      LESourceRowView *dragRow = [[LESourceRowView alloc] initWithFrame:NSMakeRect(0, i * 22, 240, 22)];
      dragRow.lineIndex = i; dragRow.lineId = i + 1; dragRow.input = input;
      [canvas addSubview:dragRow]; [dragRow layout]; [dragRows addObject:dragRow];
    }
    NSPoint startPoint = [dragRows[0] convertPoint:NSMakePoint(100, 10) toView:nil];
    NSEvent *down = [NSEvent mouseEventWithType:NSEventTypeLeftMouseDown location:startPoint modifierFlags:0 timestamp:0 windowNumber:window.windowNumber context:nil eventNumber:0 clickCount:1 pressure:1];
    [input selectInRow:dragRows[0] event:down extending:NO];
    NSUInteger dragAnchor = input.anchor;
    [input beginSelectionDragInRow:dragRows[0] event:down];
    [input selectionDragTick];
    assert(input.head == dragAnchor && input.selectedRange.length == 0);
    NSPoint below = [dragScroll.contentView convertPoint:NSMakePoint(110, NSMaxY(dragScroll.contentView.bounds) + 30) toView:nil];
    [input updateSelectionDragAtWindowPoint:below];
    CGFloat initialScroll = dragScroll.contentView.bounds.origin.y;
    assert(initialScroll > 0 && input.head > dragAnchor && input.anchor == dragAnchor);
    // Recycle the mouse-down row to another logical ID while holding still.
    dragRows[0].input = nil;
    dragRows[0].lineIndex = 8; dragRows[0].lineId = 9;
    [dragRows[0] setFrameOrigin:NSMakePoint(0, 8 * 22)]; dragRows[0].input = input;
    [[NSRunLoop mainRunLoop] runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.15]];
    assert(dragScroll.contentView.bounds.origin.y > initialScroll);
    assert(input.anchor == dragAnchor && input.head > 5 * 11);
    NSPoint above = [dragScroll.contentView convertPoint:NSMakePoint(110, NSMinY(dragScroll.contentView.bounds) - 20) toView:nil];
    CGFloat beforeReverse = dragScroll.contentView.bounds.origin.y;
    [input updateSelectionDragAtWindowPoint:above];
    assert(dragScroll.contentView.bounds.origin.y < beforeReverse && input.anchor == dragAnchor);
    [input endSelectionDrag];
    CGFloat stoppedScroll = dragScroll.contentView.bounds.origin.y;
    NSUInteger stoppedHead = input.head;
    [input selectionDragTick];
    assert(dragScroll.contentView.bounds.origin.y == stoppedScroll && input.head == stoppedHead);
    [input beginSelectionDragInRow:dragRows[2] event:down];
    [input resignFirstResponder];
    [input selectionDragTick];
    assert(dragScroll.contentView.bounds.origin.y == stoppedScroll);
    // A double-click without dragging must not collapse to the pointer offset.
    NSEvent *doubleClick = [NSEvent mouseEventWithType:NSEventTypeLeftMouseDown location:[dragRows[2] convertPoint:NSMakePoint(100, 10) toView:nil] modifierFlags:0 timestamp:0 windowNumber:window.windowNumber context:nil eventNumber:0 clickCount:2 pressure:1];
    [input selectInRow:dragRows[2] event:doubleClick extending:NO];
    NSRange wordSelection = input.selectedRange;
    assert(wordSelection.length == 10);
    [input beginSelectionDragInRow:dragRows[2] event:doubleClick];
    [input selectionDragTick];
    assert(NSEqualRanges(wordSelection, input.selectedRange));
    [input endSelectionDrag];
    [input removeFromSuperview];
    std::cout << "SourceInputView: input/undo, wrapped offscreen navigation, cross-row selection, recycled drag tracking and autoscroll passed\n";
  }
}
