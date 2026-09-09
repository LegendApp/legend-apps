#import "../macos/SourceInputView.h"
#include <cassert>
#include <iostream>

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
    std::cout << "SourceInputView: edits, grapheme deletion, composition transactions, undo/redo, caret reveal passed\n";
  }
}
