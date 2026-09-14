#import "../macos/SourceInputView.h"
#import "../macos/SourceSearchPanel.h"
#include "../cpp/SourceDocument.hpp"
#include <cassert>
#include <iostream>

@interface LESourceInputView (SelectionTests)
- (void)selectionDragTick;
- (BOOL)validateUserInterfaceItem:(id<NSValidatedUserInterfaceItem>)item;
@end
@interface TestSourceCanvas : NSView
@end
@implementation TestSourceCanvas
- (BOOL)isFlipped { return YES; }
@end

static const NSRange implicitRange = {NSNotFound, 0};
static NSData *gutterPixels(LESourceRowView *row) {
  [row layout];
  NSMutableData *pixels = [NSMutableData dataWithLength:64 * 24 * 4];
  CGColorSpaceRef space = CGColorSpaceCreateDeviceRGB();
  CGContextRef context = CGBitmapContextCreate(pixels.mutableBytes, 64, 24, 8, 64 * 4, space, kCGImageAlphaPremultipliedLast);
  assert(context);
  [NSGraphicsContext saveGraphicsState];
  NSGraphicsContext.currentContext = [NSGraphicsContext graphicsContextWithCGContext:context flipped:YES];
  [row drawRect:NSMakeRect(0, 0, 64, 24)];
  [NSGraphicsContext restoreGraphicsState];
  CGContextRelease(context); CGColorSpaceRelease(space);
  return pixels;
}
static void closeUndoGroup(NSUndoManager *history) {
  while (history.groupingLevel > 0) [history endUndoGrouping];
}
static void awaitCompletion(BOOL (^finished)(void)) {
  NSDate *deadline = [NSDate dateWithTimeIntervalSinceNow:5];
  while (!finished() && deadline.timeIntervalSinceNow > 0) {
    [NSRunLoop.currentRunLoop runUntilDate:[NSDate dateWithTimeIntervalSinceNow:0.005]];
  }
  assert(finished());
}
int main() {
  @autoreleasepool {
    [NSApplication sharedApplication];
    {
      LESourceInputView *input = [[LESourceInputView alloc] initWithFrame:NSZeroRect];
      input.undoManager.groupsByEvent = NO;
      [input loadSource:@"first\r\n  hello 👩🏽‍💻 world"];
      [input setAccessibilitySelectedTextRange:NSMakeRange(input.source.length - 6, 0)];
      assert([input respondsToSelector:@selector(deleteToBeginningOfLine:)]);
      [input.undoManager beginUndoGrouping];
      [input doCommandBySelector:@selector(deleteToBeginningOfLine:)];
      [input.undoManager endUndoGrouping];
      assert([input.source isEqual:@"first\r\n world"] && input.head == 7);
      [input.undoManager undo];
      assert([input.source isEqual:@"first\r\n  hello 👩🏽‍💻 world"]);
      [input.undoManager redo];
      [input setAccessibilitySelectedTextRange:NSMakeRange(2, 7)];
      [input.undoManager beginUndoGrouping];
      [input doCommandBySelector:@selector(deleteToBeginningOfLine:)];
      [input.undoManager endUndoGrouping];
      assert([input.source isEqual:@"fiorld"]);
      [input loadSource:@"abcdefghijklmnopqrstuvwxyzabcdefghijklmnopqrstuvwxyz"];
      LESourceRowView *row = [[LESourceRowView alloc] initWithFrame:NSMakeRect(0, 0, 160, 22)];
      [row applyLineId:1 index:0]; row.input = input; [row layout];
      NSUInteger start = [row.textLayout beginningOfVisualLineAtOffset:25];
      assert(start > 0 && start < 25);
      NSString *expected = [input.source stringByReplacingCharactersInRange:NSMakeRange(start, 25 - start) withString:@""];
      [input setAccessibilitySelectedTextRange:NSMakeRange(25, 0)];
      [input.undoManager beginUndoGrouping];
      [input doCommandBySelector:@selector(deleteToBeginningOfLine:)];
      [input.undoManager endUndoGrouping];
      assert([input.source isEqual:expected] && input.head == start);
      row.input = nil;
    }
    {
      // Column zero deletes the logical line, including its line separator.
      NSArray *cases = @[
        @[@"first\nmiddle\nlast", @0, @"middle\nlast", @0],
        @[@"first\nmiddle\nlast", @6, @"first\nlast", @6],
        @[@"first\nmiddle\nlast", @13, @"first\nmiddle", @12],
        @[@"first\r\nmiddle\r\nlast", @7, @"first\r\nlast", @7],
        @[@"first\r\nlast", @7, @"first", @5],
        @[@"first\n\nlast", @6, @"first\nlast", @6],
        @[@"first\r\n", @7, @"first", @5],
        @[@"only", @0, @"", @0],
        @[@"", @0, @"", @0],
      ];
      for (NSArray *example in cases) {
        LESourceInputView *input = [[LESourceInputView alloc] initWithFrame:NSZeroRect];
        input.undoManager.groupsByEvent = NO;
        [input loadSource:example[0]];
        __block NSUInteger edits = 0;
        input.onEdit = ^(NSString *) { ++edits; };
        [input setAccessibilitySelectedTextRange:NSMakeRange([example[1] unsignedIntegerValue], 0)];
        [input.undoManager beginUndoGrouping];
        [input doCommandBySelector:@selector(deleteToBeginningOfLine:)];
        [input.undoManager endUndoGrouping];
        assert([input.source isEqual:example[2]] && input.head == [example[3] unsignedIntegerValue]);
        if ([example[0] length]) {
          [input.undoManager undo]; assert([input.source isEqual:example[0]]);
          [input.undoManager redo]; assert([input.source isEqual:example[2]]);
        } else assert(edits == 0);
      }
    }
    {
      // The deleted row remains mounted until Fabric removes its container.
      LESourceInputView *input = [[LESourceInputView alloc] initWithFrame:NSZeroRect];
      [input loadSource:@"a\nb\nc"];
      LESourceRowView *row = [[LESourceRowView alloc] initWithFrame:NSMakeRect(0, 22, 400, 22)];
      [row applyLineId:2 index:1]; row.input = input;
      NSData *before = gutterPixels(row);
      [input insertText:@"" replacementRange:NSMakeRange(1, 2)];
      assert(row.lineIndex == NSNotFound);
      assert([gutterPixels(row) isEqual:before]);
      assert(!row.isAccessibilityElement);
      row.input = nil;
      assert(![gutterPixels(row) isEqual:before]);
    }
    {
      LESourceInputView *input = [[LESourceInputView alloc] initWithFrame:NSZeroRect];
      [input loadSource:@"a\nb\nc\nd"];
      LESourceRowView *row = [[LESourceRowView alloc] initWithFrame:NSMakeRect(0, 66, 400, 22)];
      [row applyLineId:4 index:3]; row.input = input;
      NSData *before = gutterPixels(row);
      [input insertText:@"" replacementRange:NSMakeRange(0, 2)];
      assert(row.lineIndex == 2); // Logical positions advance immediately for editing.
      assert([gutterPixels(row) isEqual:before]); // But its view has not moved yet.
      [row applyLineId:4 index:2]; [row setFrameOrigin:NSMakePoint(0, 44)];
      NSData *after = gutterPixels(row);
      assert(![after isEqual:before]);
      [row applyLineId:4 index:3]; // Stale metrics commit cannot revert the gutter.
      assert([gutterPixels(row) isEqual:after]);
      [input insertText:@"new\n" replacementRange:NSMakeRange(0, 0)];
      assert(row.lineIndex == 3);
      assert([gutterPixels(row) isEqual:after]);
      [row applyLineId:4 index:3]; [row setFrameOrigin:NSMakePoint(0, 66)];
      assert([gutterPixels(row) isEqual:before]);
      // Recycled views must not retain the previous document's gutter index.
      row.input = nil;
      LESourceInputView *other = [[LESourceInputView alloc] initWithFrame:NSZeroRect];
      [other loadSource:@"first\nsecond\nthird\nfourth"];
      [row applyLineId:3 index:2]; row.input = other;
      assert([gutterPixels(row) isEqual:after]);
      row.input = nil;
    }
    {
      // Prepare exact heights without mounting a single native row.
      LESourceInputView *input = [[LESourceInputView alloc] initWithFrame:NSZeroRect];
      input.undoManager.groupsByEvent = NO;
      [input loadSource:@"short\nA longer line containing words which wrap at narrow widths\n\t👩🏽‍💻 中文 é\n"];
      NSMutableDictionary *heights = [NSMutableDictionary new];
      __block NSString *key = @"narrow";
      __block NSUInteger revision = 0;
      input.onLineHeights = ^(NSString *json) {
        NSDictionary *event = [NSJSONSerialization JSONObjectWithData:[json dataUsingEncoding:NSUTF8StringEncoding] options:0 error:nil];
        if (![event[@"key"] isEqual:key] || [event[@"revision"] unsignedIntegerValue] != revision) return;
        if ([event[@"reset"] boolValue]) [heights removeAllObjects];
        for (NSArray *row in event[@"rows"]) heights[row[1]] = row[2];
      };
      NSMutableDictionary *request = [@{@"key":key, @"fontFamily":@"Menlo", @"fontSize":@14,
        @"lineHeight":@23, @"width":@190, @"wrap":@YES, @"foreground":@"#eeeeee", @"start":@0} mutableCopy];
      [input requestLineLayouts:request];
      awaitCompletion(^BOOL { return heights.count == 4; });
      assert([heights[@0] doubleValue] == 23 && [heights[@1] doubleValue] > 23);
      for (NSUInteger index = 0; index < 4; ++index) {
        LESourceRowView *row = [[LESourceRowView alloc] initWithFrame:NSMakeRect(0, 0, 190, 23)];
        row.lineIndex = index; row.lineId = index + 1; row.fontFamily = @"Menlo";
        row.fontSize = 14; row.lineHeight = 23; row.wrap = YES; row.heightKey = key; row.input = input;
        [row layout];
        assert(row.textLayout.height == [heights[@(index)] doubleValue]);
        LESourceRowView *independent = [[LESourceRowView alloc] initWithFrame:row.frame];
        independent.lineIndex = index; independent.lineId = index + 1;
        independent.fontFamily = @"Menlo"; independent.fontSize = 14; independent.lineHeight = 23;
        independent.wrap = YES; independent.heightKey = @"not-prepared"; independent.input = input;
        [independent layout];
        assert(independent.textLayout != row.textLayout);
        assert(independent.textLayout.height == row.textLayout.height);
        independent.input = nil;
        row.input = nil;
      }
      // A resize immediately followed by an edit must discard stale worker results.
      key = @"wide"; request[@"key"] = key; request[@"width"] = @1200;
      [heights removeAllObjects]; [input requestLineLayouts:request];
      [input.undoManager beginUndoGrouping];
      [input insertText:@"prefix " replacementRange:NSMakeRange(0, 0)];
      [input.undoManager endUndoGrouping];
      revision = 1;
      awaitCompletion(^BOOL { return heights.count == 4; });
      for (NSNumber *height in heights.allValues) assert(height.doubleValue == 23);
      [heights removeAllObjects]; revision = 2; [input.undoManager undo];
      awaitCompletion(^BOOL { return heights[@0] != nil; });
      assert([heights[@0] doubleValue] == 23);
      input.onLineHeights = nil;
      std::cout << "Prepared heights: offscreen CoreText layout, drawing agreement, resize, edit and undo passed\n";
    }
    {
      LESourceInputView *input = [[LESourceInputView alloc] initWithFrame:NSZeroRect];
      [input loadSource:[@"sample\n" stringByPaddingToLength:700000 withString:@"sample\n" startingAtIndex:0]];
      LESourceSearchPanel *search = [[LESourceSearchPanel alloc] initWithInput:input];
      [search show];
      NSSearchField *query = [search valueForKey:@"query"];
      NSTextField *status = [search valueForKey:@"status"];
      query.stringValue = @"absent";
      [search invalidate];
      query.stringValue = @"sample";
      [search invalidate];
      awaitCompletion(^BOOL { return [status.stringValue isEqual:@"1 / 100000"]; });
      [search close];
    }
    {
      LESourceInputView *saving = [[LESourceInputView alloc] initWithFrame:NSZeroRect];
      saving.undoManager.groupsByEvent = NO;
      NSString *path = [NSTemporaryDirectory() stringByAppendingPathComponent:NSUUID.UUID.UUIDString];
      assert([@"original\r\n" writeToFile:path atomically:YES encoding:NSUTF8StringEncoding error:nil]);
      [saving loadSource:@"original\r\n"];
      saving.fileSession = [[LESourceFileSession alloc] initWithPath:path signature:[LESourceFileSession signatureAtPath:path] hasBOM:NO];
      saving.fileReadComplete = YES;
      [saving replaceSelectionWithText:@"first "];
      closeUndoGroup(saving.undoManager);
      __block BOOL done = NO;
      [saving saveToPath:path completion:^(BOOL saved, NSString *error) { assert(saved && !error.length); done = YES; }];
      [saving replaceSelectionWithText:@"second "];
      closeUndoGroup(saving.undoManager);
      awaitCompletion(^BOOL { return done; });
      assert(saving.dirty);
      assert([[NSString stringWithContentsOfFile:path encoding:NSUTF8StringEncoding error:nil] isEqual:@"first original\r\n"]);
      [saving.undoManager undo]; assert(!saving.dirty);
      [saving.undoManager redo]; assert(saving.dirty);
      assert([NSFileManager.defaultManager removeItemAtPath:path error:nil]);

      // Both documents have revision zero: identity must also invalidate the snapshot.
      [saving loadSource:[@"x" stringByPaddingToLength:70000 withString:@"x" startingAtIndex:0]];
      done = NO;
      [saving copySourceWithCompletion:^(NSString *source, NSString *error) { assert(!source && error.length); done = YES; }];
      [saving loadSource:@"replacement"];
      awaitCompletion(^BOOL { return done; });
    }
    {
      LESourceInputView *editing = [[LESourceInputView alloc] initWithFrame:NSZeroRect];
      editing.undoManager.groupsByEvent = NO;
      [editing.undoManager beginUndoGrouping];
      [editing insertText:@"(" replacementRange:implicitRange];
      [editing.undoManager endUndoGrouping];
      assert([editing.source isEqual:@"()"] && editing.head == 1 && editing.dirty);
      NSMenuItem *undoItem = [[NSMenuItem alloc] initWithTitle:@"Undo" action:@selector(undo:) keyEquivalent:@"z"];
      NSMenuItem *findItem = [[NSMenuItem alloc] initWithTitle:@"Find" action:@selector(performFindPanelAction:) keyEquivalent:@"f"];
      findItem.tag = NSFindPanelActionShowFindPanel;
      assert([editing respondsToSelector:undoItem.action] && [editing validateUserInterfaceItem:undoItem]);
      assert([editing respondsToSelector:findItem.action] && [editing validateUserInterfaceItem:findItem]);
      [editing.undoManager undo]; assert([editing.source isEqual:@""] && !editing.dirty);
      [editing.undoManager redo]; assert([editing.source isEqual:@"()"] && editing.dirty);
      [editing loadSource:@""];
      [editing.undoManager beginUndoGrouping];
      [editing insertText:@"[" replacementRange:implicitRange];
      [editing insertText:@"]" replacementRange:implicitRange];
      [editing.undoManager endUndoGrouping];
      assert([editing.source isEqual:@"[]"] && editing.head == 2);
      [editing loadSource:@""];
      [editing.undoManager beginUndoGrouping];
      [editing insertText:@"{" replacementRange:implicitRange];
      [editing deleteBackward:nil];
      [editing.undoManager endUndoGrouping];
      assert([editing.source isEqual:@""]);
      [editing loadSource:@"word"];
      [editing setAccessibilitySelectedTextRange:NSMakeRange(0, 4)];
      [editing.undoManager beginUndoGrouping];
      [editing insertText:@"\"" replacementRange:implicitRange];
      [editing.undoManager endUndoGrouping];
      assert([editing.source isEqual:@"\"word\""] && NSEqualRanges(editing.selectedRange, NSMakeRange(1, 4)));
      [editing loadSource:@"// comment"];
      [editing setAccessibilitySelectedTextRange:NSMakeRange(10, 0)];
      [editing.undoManager beginUndoGrouping];
      [editing insertText:@"(" replacementRange:implicitRange];
      [editing.undoManager endUndoGrouping];
      assert([editing.source isEqual:@"// comment("]);
      [editing loadSource:@""]; editing.automaticPairs = NO;
      [editing.undoManager beginUndoGrouping]; [editing insertText:@"(" replacementRange:implicitRange]; [editing.undoManager endUndoGrouping];
      assert([editing.source isEqual:@"("]);
      editing.automaticPairs = YES;
      [editing loadSource:[@"x" stringByPaddingToLength:3000 withString:@"x" startingAtIndex:0]];
      [editing setAccessibilitySelectedTextRange:NSMakeRange(3000, 0)];
      [editing.undoManager beginUndoGrouping]; [editing insertText:@"(" replacementRange:implicitRange]; [editing.undoManager endUndoGrouping];
      assert(editing.source.length == 3001 && editing.head == 3001);
      [editing loadSource:@""];
      [editing.undoManager beginUndoGrouping]; [editing insertText:@"(" replacementRange:NSMakeRange(0, 0)]; [editing.undoManager endUndoGrouping];
      assert([editing.source isEqual:@"("]); // Explicit replacement/paste stays literal.
    }
    // Forward deletion must remove one grapheme, not one UTF-16 code unit.
    for (NSString *grapheme in @[@"😀", @"👩🏽‍💻", @"é", @"🇨🇦", @"\r\n"]) {
      LESourceInputView *unicode = [[LESourceInputView alloc] initWithFrame:NSMakeRect(0, 0, 600, 400)];
      NSString *original = [grapheme stringByAppendingString:@"tail"];
      [unicode loadSource:original];
      unicode.undoManager.groupsByEvent = NO;
      [unicode.undoManager beginUndoGrouping];
      [unicode deleteForward:nil];
      [unicode.undoManager endUndoGrouping];
      assert([unicode.source isEqualToString:@"tail"]);
      [unicode.undoManager undo];
      assert([unicode.source isEqualToString:original]);
      [unicode.undoManager redo];
      assert([unicode.source isEqualToString:@"tail"]);
      [unicode loadSource:@"replacement"];
      assert(!unicode.undoManager.canUndo && !unicode.undoManager.canRedo);
      assert(!unicode.hasMarkedText && unicode.head == 0);
    }
    {
      LESourceInputView *crlf = [[LESourceInputView alloc] initWithFrame:NSZeroRect];
      [crlf loadSource:@"a\r\nb"];
      [crlf setAccessibilitySelectedTextRange:NSMakeRange(1, 0)];
      [crlf moveRight:nil]; assert(crlf.head == 3);
      [crlf moveLeft:nil]; assert(crlf.head == 1);
      [crlf moveRightAndModifySelection:nil];
      assert(NSEqualRanges(crlf.selectedRange, NSMakeRange(1, 2)));
      // Accessibility clients can place a caret inside the pair as well.
      [crlf setAccessibilitySelectedTextRange:NSMakeRange(2, 0)];
      [crlf moveLeft:nil]; assert(crlf.head == 1);
      [crlf setAccessibilitySelectedTextRange:NSMakeRange(2, 0)];
      [crlf moveRight:nil]; assert(crlf.head == 3);
    }
    // Native edits/undo remain authoritative while background chunks arrive.
    LESourceInputView *streaming = [[LESourceInputView alloc] initWithFrame:NSMakeRect(0, 0, 600, 400)];
    auto prefix = std::make_shared<legend::source::SourceDocument>(u"first\n");
    prefix->useEditIdRange();
    [streaming adoptDocument:prefix];
    streaming.undoManager.groupsByEvent = NO;
    [streaming.undoManager beginUndoGrouping];
    [streaming insertText:@"edited\n" replacementRange:NSMakeRange(0, 0)];
    closeUndoGroup(streaming.undoManager);
    legend::source::SourceDocument tail(u"tail\n", 2);
    NSDictionary *append = [streaming appendDocument:std::move(tail)];
    assert([append[@"revision"] unsignedIntegerValue] == 2);
    assert([append[@"count"] unsignedIntegerValue] == 1);
    assert([[streaming source] isEqualToString:@"edited\nfirst\ntail\n"]);
    [streaming.undoManager undo];
    assert([[streaming source] isEqualToString:@"first\ntail\n"]);
    [streaming.undoManager redo];
    assert([[streaming source] isEqualToString:@"edited\nfirst\ntail\n"]);
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
    [row layout];
    LESourceLineLayout *unchangedLayout = row.textLayout;
    [input insertText:@"new\n" replacementRange:NSMakeRange(0, 0)];
    [row layout];
    assert(row.textLayout == unchangedLayout);
    assert(row.lineIndex == 4);
    assert([[input textForRow:row] isEqualToString:@"four"]);
    assert([input offsetForRow:row] == 18);
    // A delayed Fabric commit for the same logical row must not restore its
    // pre-edit index and make the gutter/content temporarily disappear.
    [row applyLineId:4 index:3];
    assert(row.lineIndex == 4 && [input offsetForRow:row] == 18);
    closeUndoGroup(input.undoManager);
    [input.undoManager undo];
    assert(row.lineIndex == 3);
    assert([[input textForRow:row] isEqualToString:@"four"]);
    [row applyLineId:4 index:4];
    assert(row.lineIndex == 3 && [input offsetForRow:row] != NSNotFound);
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
