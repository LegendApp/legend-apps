#import "../macos/SourceLineLayout.h"
#import <CoreText/CoreText.h>
#include <cassert>
#include <chrono>
#include <iostream>

static NSAttributedString *attributed(NSString *text) {
  NSFont *font = [NSFont monospacedSystemFontOfSize:14 weight:NSFontWeightRegular];
  NSMutableParagraphStyle *paragraph = [NSMutableParagraphStyle new];
  paragraph.tabStops = @[];
  paragraph.defaultTabInterval = 4 * [@" " sizeWithAttributes:@{NSFontAttributeName:font}].width;
  return [[NSAttributedString alloc] initWithString:text attributes:@{
    NSFontAttributeName:font, NSParagraphStyleAttributeName:paragraph,
  }];
}
static LESourceLineLayout *layout(NSString *text, CGFloat width, BOOL wrap = YES) {
  return [[LESourceLineLayout alloc] initWithText:attributed(text) width:width lineHeight:22 wrap:wrap];
}

int main() {
  @autoreleasepool {
    auto empty = layout(@"", 100);
    assert(empty.height == 22 && empty.visualLineCount == 1);
    assert([empty offsetAtPoint:NSMakePoint(50, 0)] == 0);
    NSString *text = @"const greeting = 'Hello, world'; // more text to wrap";
    auto narrow = layout(text, 120);
    auto wide = layout(text, 600);
    assert(narrow.visualLineCount > wide.visualLineCount);
    assert(layout(text, 120, NO).visualLineCount == 1);
    for (NSUInteger i = 0; i <= text.length; i++) {
      NSRect rect = [narrow caretRectAtOffset:i downstream:YES];
      NSUInteger hit = [narrow offsetAtPoint:NSMakePoint(rect.origin.x, rect.origin.y + 11)];
      assert(hit == i);
    }
    assert([narrow rectsForRange:NSMakeRange(0, text.length)].count == narrow.visualLineCount);
    assert([narrow caretRectAtOffset:0 downstream:YES].origin.y == 0);
    NSString *unicode = @"a\t👩🏽‍💻 é 中文 xyz";
    auto shaped = layout(unicode, 70);
    [unicode enumerateSubstringsInRange:NSMakeRange(0, unicode.length)
                                options:NSStringEnumerationByComposedCharacterSequences
                             usingBlock:^(NSString *substring, NSRange range, NSRange enclosing, BOOL *stop) {
      NSRect caret = [shaped caretRectAtOffset:range.location downstream:YES];
      NSUInteger hit = [shaped offsetAtPoint:NSMakePoint(caret.origin.x, caret.origin.y + 11)];
      assert(hit == range.location);
    }];
    for (CGFloat y = 0; y < shaped.height; y += 11) {
      for (CGFloat x = 0; x < 100; x += 1) {
        NSUInteger hit = [shaped offsetAtPoint:NSMakePoint(x, y)];
        assert(hit == unicode.length || [unicode rangeOfComposedCharacterSequenceAtIndex:hit].location == hit);
      }
    }
    // The pathological case is one long logical line: measure separately from
    // a large number of normal lines. This is layout time, not frame latency.
    for (NSUInteger count : {10000, 100000}) {
      NSString *longLine = [@"x" stringByPaddingToLength:count withString:@"abc def " startingAtIndex:0];
      auto start = std::chrono::steady_clock::now();
      auto wrapped = layout(longLine, 800);
      auto end = std::chrono::steady_clock::now();
      assert(wrapped.visualLineCount > 1);
      // Check offset conversion well beyond the first shaping chunk.
      for (NSUInteger offset : {4090, 4096, 5000, 9999}) {
        NSRect caret = [wrapped caretRectAtOffset:offset downstream:YES];
        assert([wrapped offsetAtPoint:NSMakePoint(caret.origin.x, caret.origin.y + 11)] == offset);
      }
      std::cout << count << " UTF-16 units in one line: " << wrapped.visualLineCount << " visual rows, "
        << std::chrono::duration<double, std::milli>(end - start).count() << "ms layout\n";
    }
    // For ordinary Latin code, chunking must preserve the unsliced line breaks.
    // Mixed-script font fallback can depend on paragraph context in CoreText;
    // for that case the contract is consistency of our own drawing/hit geometry.
    NSString *chunkedText = [@"hello " stringByPaddingToLength:12000 withString:@"word abc def " startingAtIndex:0];
    NSAttributedString *referenceText = attributed(chunkedText);
    CTTypesetterRef reference = CTTypesetterCreateWithAttributedString((__bridge CFAttributedStringRef)referenceText);
    auto chunked = layout(chunkedText, 173);
    NSUInteger offset = 0, row = 0;
    while (offset < chunkedText.length) {
      if ([chunked caretRectAtOffset:offset downstream:YES].origin.y != row * 22) {
        std::cerr << "Wrap disagreement at offset " << offset << ", expected row " << row << ", actual y " << [chunked caretRectAtOffset:offset downstream:YES].origin.y << "\n";
      }
      assert([chunked caretRectAtOffset:offset downstream:YES].origin.y == row * 22);
      offset += CTTypesetterSuggestLineBreak(reference, offset, 173);
      row++;
    }
    assert(row == chunked.visualLineCount);
    CFRelease(reference);
    // Fast long-line caret positions must agree with CoreText's original line,
    // not a reshaped substring. Include kerning/ligatures, tabs and bidi edges.
    for (NSString *fragment in @[@"const value = 42; ", @"fi ffi\t👩🏽‍💻 é 中文 אבג العربية xyz ", @"AV fi ffi office "]) {
      NSString *source = [fragment stringByPaddingToLength:6000 withString:fragment startingAtIndex:0];
      NSMutableAttributedString *styled = [attributed(source) mutableCopy];
      if ([fragment hasPrefix:@"AV"]) {
        [styled addAttribute:NSFontAttributeName value:[NSFont fontWithName:@"Times-Roman" size:14] range:NSMakeRange(0, source.length)];
        [styled addAttribute:NSLigatureAttributeName value:@1 range:NSMakeRange(0, source.length)];
      }
      for (NSUInteger i = 0; i < source.length; i += 7)
        [styled addAttribute:NSForegroundColorAttributeName value:(i % 2 ? NSColor.redColor : NSColor.blueColor)
                       range:NSMakeRange(i, MIN(NSUInteger{7}, source.length - i))];
      auto actual = [[LESourceLineLayout alloc] initWithText:styled width:800 lineHeight:22 wrap:NO];
      CTLineRef expected = CTLineCreateWithAttributedString((__bridge CFAttributedStringRef)styled);
      for (NSUInteger i = 0; i <= source.length; ++i) {
        const auto x = [actual caretRectAtOffset:i downstream:YES].origin.x;
        const auto referenceX = CTLineGetOffsetForStringIndex(expected, i, nullptr);
        assert(fabs(x - referenceX) < 0.01);
        if (fragment.length == 18 && i % 13 == 0) {
          const auto point = NSMakePoint(x + 0.25, 11);
          assert([actual offsetAtPoint:point] == (NSUInteger)CTLineGetStringIndexForPosition(expected, point));
        }
      }
      CFRelease(expected);
    }
    NSString *longUnicode = [@"hello 👩🏽‍💻 " stringByPaddingToLength:12000 withString:@"word abc 中文 " startingAtIndex:0];
    auto unicodeLayout = layout(longUnicode, 173);
    [longUnicode enumerateSubstringsInRange:NSMakeRange(0, longUnicode.length) options:NSStringEnumerationByComposedCharacterSequences
                                usingBlock:^(NSString *substring, NSRange range, NSRange enclosing, BOOL *stop) {
      NSRect caret = [unicodeLayout caretRectAtOffset:range.location downstream:YES];
      assert([unicodeLayout offsetAtPoint:NSMakePoint(caret.origin.x, caret.origin.y + 11)] == range.location);
    }];
    std::cout << "SourceLineLayout: all assertions passed\n";
  }
}
