#import "SourceInputView.h"
#include "../cpp/SourceDocument.hpp"

using legend::source::SourceDocument;

static std::u16string utf16(NSString *text) {
  std::u16string result(text.length, 0);
  [text getCharacters:reinterpret_cast<unichar *>(result.data()) range:NSMakeRange(0, text.length)];
  return result;
}
static NSString *string(const std::u16string &text) {
  return [[NSString alloc] initWithCharacters:reinterpret_cast<const unichar *>(text.data()) length:text.size()];
}

@interface LESourceInputView ()
- (void)publishSelection;
- (void)replaceRange:(NSRange)range text:(NSString *)text recordUndo:(BOOL)recordUndo;
- (void)revealSelectionInRow:(LESourceRowView *)row;
@end

@implementation LESourceInputView {
  std::unique_ptr<SourceDocument> _document;
  NSHashTable<LESourceRowView *> *_rows;
  NSRange _marked;
  NSUndoManager *_history;
  CGFloat _preferredX;
  NSString *_compositionOriginal;
  NSRange _compositionRange;
  BOOL _needsSelectionReveal;
}
- (instancetype)initWithFrame:(NSRect)frame {
  if ((self = [super initWithFrame:frame])) {
    _rows = [NSHashTable weakObjectsHashTable];
    _history = [NSUndoManager new];
    [self loadSource:@""];
  }
  return self;
}
- (BOOL)isFlipped { return YES; }
- (BOOL)acceptsFirstResponder { return YES; }
- (NSView *)hitTest:(NSPoint)point { return nil; } // rows handle pointing; this view owns keyboard focus
- (NSUndoManager *)undoManager { return _history; }
- (BOOL)isAccessibilityElement { return YES; }
- (NSString *)accessibilityRole { return NSAccessibilityTextAreaRole; }
- (NSString *)accessibilityLabel { return @"Source editor"; }
- (BOOL)isAccessibilityEnabled { return YES; }
- (BOOL)isAccessibilityFocused { return self.window.firstResponder == self; }
- (void)setAccessibilityFocused:(BOOL)focused { if (focused) [self.window makeFirstResponder:self]; }
- (id)accessibilityValue { return self.source; }
- (NSInteger)accessibilityNumberOfCharacters { return _document->length(); }
- (NSRange)accessibilitySelectedTextRange { return self.selectedRange; }
- (void)setAccessibilitySelectedTextRange:(NSRange)range {
  [self unmarkText];
  _anchor = MIN(range.location, _document->length());
  _head = _anchor + MIN(range.length, _document->length() - _anchor);
  [self publishSelection];
}
- (NSString *)accessibilitySelectedText { return string(_document->slice(self.selectedRange.location, self.selectedRange.length)); }
- (void)setAccessibilitySelectedText:(NSString *)text { [self insertText:text replacementRange:self.selectedRange]; }
- (void)setAccessibilityValue:(id)value {
  if ([value isKindOfClass:NSString.class]) [self insertText:value replacementRange:NSMakeRange(0, _document->length())];
}
- (void)loadSource:(NSString *)source {
  _document = std::make_unique<SourceDocument>(utf16(source));
  _anchor = _head = 0;
  _marked = NSMakeRange(NSNotFound, 0);
  _compositionOriginal = nil;
  _preferredX = NAN;
  _needsSelectionReveal = NO;
  [_history removeAllActions];
  for (LESourceRowView *row in _rows) [row invalidateText];
}
- (NSString *)source { return string(_document->text()); }
- (void)registerRow:(LESourceRowView *)row { [_rows addObject:row]; }
- (void)unregisterRow:(LESourceRowView *)row { [_rows removeObject:row]; }
- (BOOL)isCurrentRow:(LESourceRowView *)row {
  return row.lineIndex < _document->lineCount() && _document->line(row.lineIndex).id == row.lineId;
}
- (NSUInteger)offsetForRow:(LESourceRowView *)row {
  return [self isCurrentRow:row] ? _document->lineOffset(row.lineIndex) : NSNotFound;
}
- (NSString *)textForRow:(LESourceRowView *)row {
  return [self isCurrentRow:row] ? string(_document->line(row.lineIndex).text) : @"";
}
- (void)publishSelection {
  _needsSelectionReveal = YES;
  for (LESourceRowView *row in _rows) row.needsDisplay = YES;
  [self.inputContext invalidateCharacterCoordinates];
  NSAccessibilityPostNotification(self, NSAccessibilitySelectedTextChangedNotification);
  if (self.onSelection) self.onSelection(_document->position(_head).line, MIN(_head, _anchor), MAX(_head, _anchor) - MIN(_head, _anchor));
  for (LESourceRowView *row in _rows) {
    [row layoutSubtreeIfNeeded];
    [self revealSelectionInRow:row];
  }
}
- (void)revealSelectionInRow:(LESourceRowView *)row {
  if (!_needsSelectionReveal || ![self isCurrentRow:row] || !row.enclosingScrollView) return;
  auto position = _document->position(_head);
  if (row.lineIndex != position.line) return;
  // Wait for both CoreText and Fabric's measured row height before revealing.
  // Scrolling to the logical row's index cannot reveal a caret deep inside it.
  if (!row.textLayout || row.bounds.size.height + 0.5 < row.textLayout.height) return;
  NSRect caret = [row.textLayout caretRectAtOffset:position.column downstream:YES];
  caret.origin.x += 64;
  _needsSelectionReveal = NO;
  [row scrollRectToVisible:caret];
}
- (void)selectInRow:(LESourceRowView *)row event:(NSEvent *)event extending:(BOOL)extending {
  if (![self isCurrentRow:row]) return;
  [self.window makeFirstResponder:self];
  [self unmarkText];
  auto offset = [self offsetForRow:row];
  NSUInteger local = [row.textLayout offsetAtPoint:[row textPointForWindowPoint:event.locationInWindow]];
  _head = offset + local;
  if (!extending) _anchor = _head;
  if (event.clickCount >= 3 && !extending) {
    _anchor = offset;
    _head = offset + _document->line(row.lineIndex).size();
  } else if (event.clickCount == 2 && !extending) {
    NSString *text = [self textForRow:row];
    [text enumerateSubstringsInRange:NSMakeRange(0, text.length) options:NSStringEnumerationByWords
                         usingBlock:^(NSString *word, NSRange range, NSRange enclosing, BOOL *stop) {
      if (local >= range.location && local <= NSMaxRange(range)) {
        self->_anchor = offset + range.location;
        self->_head = offset + NSMaxRange(range);
        *stop = YES;
      }
    }];
  }
  _preferredX = NAN;
  [self publishSelection];
}
- (void)keyDown:(NSEvent *)event { [self interpretKeyEvents:@[event]]; }
- (BOOL)performKeyEquivalent:(NSEvent *)event {
  if (self.window.firstResponder != self || !(event.modifierFlags & NSEventModifierFlagCommand)) return NO;
  NSString *key = event.charactersIgnoringModifiers.lowercaseString;
  if ([key isEqualToString:@"a"]) [self selectAll:nil];
  else if ([key isEqualToString:@"c"]) [self copy:nil];
  else if ([key isEqualToString:@"x"]) [self cut:nil];
  else if ([key isEqualToString:@"v"]) [self paste:nil];
  else if ([key isEqualToString:@"z"]) {
    [self unmarkText];
    if (event.modifierFlags & NSEventModifierFlagShift) [_history redo]; else [_history undo];
  } else return NO;
  return YES;
}
- (void)doCommandBySelector:(SEL)selector {
  if ([self respondsToSelector:selector]) {
    void (*invoke)(id, SEL, id) = (void (*)(id, SEL, id))[self methodForSelector:selector];
    invoke(self, selector, nil);
  }
  else [super doCommandBySelector:selector];
}
- (void)replaceRange:(NSRange)range text:(NSString *)text recordUndo:(BOOL)recordUndo {
  if (range.location > _document->length() || range.length > _document->length() - range.location) return;
  // NSTextInputContext may reuse a mutable insertion string after this call.
  // Undo must retain the edit's original length, not that transient object's.
  text = [text copy];
  NSUInteger insertedLength = text.length;
  if (recordUndo) {
    NSString *before = string(_document->slice(range.location, range.length));
    NSUInteger anchor = _anchor, head = _head;
    [_history registerUndoWithTarget:self handler:^(LESourceInputView *target) {
      [target replaceRange:NSMakeRange(range.location, insertedLength) text:before recordUndo:YES];
      target->_anchor = anchor;
      target->_head = head;
      [target publishSelection];
    }];
  }
  auto change = _document->replace(range.location, range.length, utf16(text));
  // The native buffer advances before Fabric receives the transaction. Keep
  // mounted rows attached to their logical IDs during that interval.
  for (LESourceRowView *row in _rows) {
    NSUInteger index = row.lineIndex;
    if (index >= change.startLine + change.removedLineCount && index != NSNotFound) {
      row.lineIndex = index - change.removedLineCount + change.lines.size();
    } else if (index >= change.startLine) {
      row.lineIndex = NSNotFound;
      for (size_t i = 0; i < change.lines.size(); ++i) {
        if (change.lines[i].id == row.lineId) { row.lineIndex = change.startLine + i; break; }
      }
    }
    [row invalidateText];
  }
  _anchor = _head = range.location + text.length;
  NSMutableArray *lines = [NSMutableArray array];
  for (const auto &line : change.lines) {
    [lines addObject:@{@"id": [NSString stringWithFormat:@"%llu", line.id], @"text":string(line.text), @"ending":string(line.ending)}];
  }
  NSDictionary *event = @{@"startLine":@(change.startLine), @"removedLineCount":@(change.removedLineCount),
    @"lines":lines, @"revision":@(change.revision), @"lineCount":@(_document->lineCount()),
    @"offset":@(range.location), @"removedLength":@(range.length), @"insertedText":text};
  if (self.onEdit) {
    NSData *json = [NSJSONSerialization dataWithJSONObject:event options:0 error:nil];
    self.onEdit([[NSString alloc] initWithData:json encoding:NSUTF8StringEncoding]);
  }
  NSAccessibilityPostNotification(self, NSAccessibilityValueChangedNotification);
  for (LESourceRowView *row in _rows) { row.needsLayout = YES; row.needsDisplay = YES; }
  [self publishSelection];
}
- (void)insertText:(id)value replacementRange:(NSRange)replacement {
  NSString *text = [value isKindOfClass:NSAttributedString.class] ? [value string] : value;
  NSRange range = replacement.location != NSNotFound ? replacement : ([self hasMarkedText] ? _marked : self.selectedRange);
  BOOL composing = [self hasMarkedText];
  [self replaceRange:range text:text recordUndo:!composing];
  if (composing) {
    _marked = NSMakeRange(range.location, text.length);
    [self unmarkText];
  }
  _preferredX = NAN;
}
- (NSRange)selectedRange { return NSMakeRange(MIN(_anchor, _head), MAX(_anchor, _head) - MIN(_anchor, _head)); }
- (NSRange)markedRange { return _marked; }
- (BOOL)hasMarkedText { return _marked.location != NSNotFound; }
- (NSArray<NSAttributedStringKey> *)validAttributesForMarkedText { return @[NSUnderlineStyleAttributeName]; }
- (void)setMarkedText:(id)value selectedRange:(NSRange)selection replacementRange:(NSRange)replacement {
  NSString *text = [value isKindOfClass:NSAttributedString.class] ? [value string] : value;
  NSRange range = replacement.location != NSNotFound ? replacement : ([self hasMarkedText] ? _marked : self.selectedRange);
  if (range.location > _document->length() || range.length > _document->length() - range.location) return;
  if (![self hasMarkedText]) {
    _compositionOriginal = string(_document->slice(range.location, range.length));
    _compositionRange = range;
  }
  [self replaceRange:range text:text recordUndo:NO];
  _marked = NSMakeRange(range.location, text.length);
  _anchor = range.location + MIN(selection.location, text.length);
  _head = _anchor + MIN(selection.length, text.length - (_anchor - range.location));
  [self publishSelection];
}
- (void)unmarkText {
  if (![self hasMarkedText]) return;
  NSRange range = _marked;
  NSString *before = _compositionOriginal ?: @"";
  NSRange oldSelection = _compositionRange;
  [_history registerUndoWithTarget:self handler:^(LESourceInputView *target) {
    [target replaceRange:range text:before recordUndo:YES];
    target->_anchor = oldSelection.location;
    target->_head = NSMaxRange(oldSelection);
    [target publishSelection];
  }];
  _marked = NSMakeRange(NSNotFound, 0);
  _compositionOriginal = nil;
  [self.inputContext discardMarkedText];
  [self publishSelection];
}
- (NSAttributedString *)attributedSubstringForProposedRange:(NSRange)range actualRange:(NSRangePointer)actual {
  if (range.location > _document->length()) { if (actual) *actual = NSMakeRange(NSNotFound, 0); return nil; }
  range.length = MIN(range.length, _document->length() - range.location);
  if (actual) *actual = range;
  return [[NSAttributedString alloc] initWithString:string(_document->slice(range.location, range.length))];
}
- (NSRect)firstRectForCharacterRange:(NSRange)range actualRange:(NSRangePointer)actual {
  NSUInteger offset = MIN(range.location, _document->length());
  auto position = _document->position(offset);
  for (LESourceRowView *row in _rows) {
    if (row.lineIndex == position.line && [self isCurrentRow:row]) {
      NSRect rect = [row.textLayout caretRectAtOffset:position.column downstream:YES];
      rect.origin.x += 64;
      if (actual) *actual = NSMakeRange(offset, 0);
      return [self.window convertRectToScreen:[row convertRect:rect toView:nil]];
    }
  }
  if (actual) *actual = NSMakeRange(NSNotFound, 0);
  return NSZeroRect;
}
- (NSUInteger)characterIndexForPoint:(NSPoint)screenPoint {
  NSPoint point = [self.window convertPointFromScreen:screenPoint];
  for (LESourceRowView *row in _rows) {
    NSPoint local = [row convertPoint:point fromView:nil];
    if (NSPointInRect(local, row.bounds) && [self isCurrentRow:row]) {
      return [self offsetForRow:row] + [row.textLayout offsetAtPoint:[row textPointForWindowPoint:point]];
    }
  }
  return NSNotFound;
}
- (void)selectAll:(id)sender { [self unmarkText]; _anchor = 0; _head = _document->length(); [self publishSelection]; }
- (void)copy:(id)sender {
  NSRange selection = self.selectedRange;
  if (selection.length == 0) return;
  [NSPasteboard.generalPasteboard clearContents];
  [NSPasteboard.generalPasteboard setString:string(_document->slice(selection.location, selection.length)) forType:NSPasteboardTypeString];
}
- (void)cut:(id)sender { [self copy:sender]; [self insertText:@"" replacementRange:NSMakeRange(NSNotFound, 0)]; }
- (void)paste:(id)sender {
  NSString *text = [NSPasteboard.generalPasteboard stringForType:NSPasteboardTypeString];
  if (text) [self insertText:text replacementRange:NSMakeRange(NSNotFound, 0)];
}
- (void)insertNewline:(id)sender { [self insertText:@"\n" replacementRange:NSMakeRange(NSNotFound, 0)]; }
- (void)insertTab:(id)sender { [self insertText:@"\t" replacementRange:NSMakeRange(NSNotFound, 0)]; }
- (NSUInteger)adjacentOffset:(NSInteger)direction {
  auto position = _document->position(_head);
  auto &line = _document->line(position.line);
  NSString *text = string(line.text + line.ending);
  if (direction < 0) {
    if (position.column > 0) return _document->lineOffset(position.line) + [text rangeOfComposedCharacterSequenceAtIndex:position.column - 1].location;
    if (position.line > 0) return _document->lineOffset(position.line - 1) + _document->line(position.line - 1).text.size();
    return 0;
  }
  if (position.column < text.length) return _document->lineOffset(position.line) + NSMaxRange([text rangeOfComposedCharacterSequenceAtIndex:position.column]);
  return _document->length();
}
- (void)deleteBackward:(id)sender {
  NSRange range = self.selectedRange;
  if (!range.length) { range.location = [self adjacentOffset:-1]; range.length = _head - range.location; }
  [self insertText:@"" replacementRange:range];
}
- (void)deleteForward:(id)sender {
  NSRange range = self.selectedRange;
  if (!range.length) range.length = [self adjacentOffset:1] - _head;
  [self insertText:@"" replacementRange:range];
}
- (void)moveHorizontal:(NSInteger)direction extending:(BOOL)extend {
  [self unmarkText];
  NSRange selection = self.selectedRange;
  _head = !extend && selection.length ? (direction < 0 ? selection.location : NSMaxRange(selection)) : [self adjacentOffset:direction];
  if (!extend) _anchor = _head;
  _preferredX = NAN;
  [self publishSelection];
}
- (void)moveLeft:(id)sender { [self moveHorizontal:-1 extending:NO]; }
- (void)moveRight:(id)sender { [self moveHorizontal:1 extending:NO]; }
- (void)moveLeftAndModifySelection:(id)sender { [self moveHorizontal:-1 extending:YES]; }
- (void)moveRightAndModifySelection:(id)sender { [self moveHorizontal:1 extending:YES]; }
- (void)moveVertical:(NSInteger)direction extending:(BOOL)extend {
  [self unmarkText];
  auto position = _document->position(_head);
  LESourceRowView *current = nil, *next = nil;
  for (LESourceRowView *row in _rows) {
    if (![self isCurrentRow:row]) continue;
    if (row.lineIndex == position.line) current = row;
    if ((NSInteger)row.lineIndex == (NSInteger)position.line + direction) next = row;
  }
  if (current) {
    NSRect caret = [current.textLayout caretRectAtOffset:position.column downstream:YES];
    if (isnan(_preferredX)) _preferredX = caret.origin.x;
    CGFloat y = caret.origin.y + direction * current.lineHeight;
    if (y >= 0 && y < current.textLayout.height) {
      _head = _document->lineOffset(position.line) + [current.textLayout offsetAtPoint:NSMakePoint(_preferredX, y + current.lineHeight / 2)];
    } else if (next) {
      y = direction < 0 ? next.textLayout.height - next.lineHeight / 2 : next.lineHeight / 2;
      _head = [self offsetForRow:next] + [next.textLayout offsetAtPoint:NSMakePoint(_preferredX, y)];
    } else if (direction < 0 && position.line > 0) {
      _head = _document->lineOffset(position.line - 1);
    } else if (direction > 0 && position.line + 1 < _document->lineCount()) {
      _head = _document->lineOffset(position.line + 1);
    }
  }
  if (!extend) _anchor = _head;
  [self publishSelection];
}
- (void)moveUp:(id)sender { [self moveVertical:-1 extending:NO]; }
- (void)moveDown:(id)sender { [self moveVertical:1 extending:NO]; }
- (void)moveUpAndModifySelection:(id)sender { [self moveVertical:-1 extending:YES]; }
- (void)moveDownAndModifySelection:(id)sender { [self moveVertical:1 extending:YES]; }
- (void)moveToBeginningOfDocument:(id)sender { _anchor = _head = 0; [self publishSelection]; }
- (void)moveToEndOfDocument:(id)sender { _anchor = _head = _document->length(); [self publishSelection]; }
@end

@implementation LESourceRowView {
  NSString *_cachedText;
  CGFloat _cachedWidth;
}
- (instancetype)initWithFrame:(NSRect)frame {
  if ((self = [super initWithFrame:frame])) {
    _fontSize = 14; _lineHeight = 22; _fontFamily = @"Menlo";
    _foreground = NSColor.textColor; _wrap = YES; _cachedWidth = -1;
  }
  return self;
}
- (BOOL)isFlipped { return YES; }
- (void)setInput:(LESourceInputView *)input {
  if (_input == input) return;
  [_input unregisterRow:self];
  _input = input;
  [input registerRow:self];
  [self invalidateText];
}
- (void)invalidateText { _cachedText = nil; self.needsLayout = YES; self.needsDisplay = YES; }
- (void)layout {
  [super layout];
  // Fabric may attach a recycled row before assigning its measured width.
  // Do not wrap a large line into one-character fragments at that transient size.
  if (!self.input || [self.input offsetForRow:self] == NSNotFound || self.bounds.size.width <= 72) return;
  NSString *text = [self.input textForRow:self] ?: @"";
  CGFloat width = MAX(1, self.bounds.size.width - 72);
  if (_cachedWidth == width && [_cachedText isEqualToString:text]) {
    [self.input revealSelectionInRow:self];
    return;
  }
  _cachedText = text; _cachedWidth = width;
  NSFont *font = [NSFont fontWithName:self.fontFamily size:self.fontSize] ?: [NSFont monospacedSystemFontOfSize:self.fontSize weight:NSFontWeightRegular];
  NSMutableParagraphStyle *paragraph = [NSMutableParagraphStyle new];
  paragraph.tabStops = @[];
  paragraph.defaultTabInterval = 4 * [@" " sizeWithAttributes:@{NSFontAttributeName:font}].width;
  NSAttributedString *attributed = [[NSAttributedString alloc] initWithString:text attributes:@{
    NSFontAttributeName:font, NSForegroundColorAttributeName:self.foreground, NSParagraphStyleAttributeName:paragraph,
  }];
  _textLayout = [[LESourceLineLayout alloc] initWithText:attributed width:width lineHeight:self.lineHeight wrap:self.wrap];
  if (self.onMetrics) self.onMetrics(_textLayout.height, _textLayout.width + 72);
  [self.input revealSelectionInRow:self];
}
- (void)drawRect:(NSRect)dirtyRect {
  // Detached/recycled Fabric subviews can still receive a final display pass.
  // Messaging nil returns 0, which is NOT our invalid-offset sentinel.
  if (!self.input) return;
  [self layoutSubtreeIfNeeded];
  NSUInteger offset = [self.input offsetForRow:self];
  if (offset == NSNotFound) return;
  NSUInteger start = MIN(self.input.anchor, self.input.head), end = MAX(self.input.anchor, self.input.head);
  NSUInteger localStart = start > offset ? start - offset : 0;
  NSUInteger localEnd = end > offset ? MIN(end - offset, _cachedText.length) : 0;
  if (localEnd > localStart) {
    [[NSColor.selectedTextBackgroundColor colorWithAlphaComponent:0.5] setFill];
    for (NSValue *value in [_textLayout rectsForRange:NSMakeRange(localStart, localEnd - localStart)]) {
      NSRect rect = value.rectValue; rect.origin.x += 64; NSRectFill(rect);
    }
  }
  [_textLayout drawInContext:NSGraphicsContext.currentContext.CGContext origin:NSMakePoint(64, 0) dirtyRect:dirtyRect];
  [[NSString stringWithFormat:@"%lu", self.lineIndex + 1] drawAtPoint:NSMakePoint(8, 2) withAttributes:@{
    NSFontAttributeName:[NSFont fontWithName:@"Menlo" size:MAX(10, self.fontSize - 1)] ?: [NSFont systemFontOfSize:12],
    NSForegroundColorAttributeName:[(self.foreground ?: NSColor.textColor) colorWithAlphaComponent:0.5],
  }];
  if (self.window.firstResponder == self.input && self.input.head >= offset && self.input.head <= offset + _cachedText.length) {
    NSRect caret = [_textLayout caretRectAtOffset:self.input.head - offset downstream:YES];
    caret.origin.x += 64; [self.foreground setFill]; NSRectFill(caret);
  }
}
- (BOOL)isAccessibilityElement { return self.input && [self.input offsetForRow:self] != NSNotFound; }
- (NSString *)accessibilityRole { return NSAccessibilityStaticTextRole; }
- (NSString *)accessibilityLabel { return [NSString stringWithFormat:@"Line %lu", self.lineIndex + 1]; }
- (id)accessibilityValue { return [self.input textForRow:self] ?: @""; }
- (NSPoint)textPointForWindowPoint:(NSPoint)point {
  NSPoint local = [self convertPoint:point fromView:nil]; local.x -= 64; return local;
}
- (void)mouseDown:(NSEvent *)event {
  [self.input selectInRow:self event:event extending:(event.modifierFlags & NSEventModifierFlagShift) != 0];
}
- (void)mouseDragged:(NSEvent *)event {
  // Mouse capture stays on the original row during a drag. Resolve the current
  // row through the window before extending the document-wide selection.
  NSView *target = [self.window.contentView hitTest:[self.window.contentView convertPoint:event.locationInWindow fromView:nil]];
  while (target && ![target isKindOfClass:LESourceRowView.class]) target = target.superview;
  if (target) [self.input selectInRow:(LESourceRowView *)target event:event extending:YES];
  [self autoscroll:event];
}
@end
