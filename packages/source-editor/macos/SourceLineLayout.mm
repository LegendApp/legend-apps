#import "SourceLineLayout.h"
#import <CoreText/CoreText.h>

@implementation LESourceLineLayout {
  NSAttributedString *_text;
  NSArray *_lines;
  NSArray<NSValue *> *_ranges;
  NSArray<NSNumber *> *_chunkStarts;
  CGFloat _lineHeight;
  CGFloat _ascent;
}

- (instancetype)initWithText:(NSAttributedString *)text width:(CGFloat)width lineHeight:(CGFloat)lineHeight wrap:(BOOL)wrap
{
  if ((self = [super init])) {
    _text = [text copy];
    _lineHeight = MAX(1, lineHeight);
    NSFont *font = text.length ? [text attribute:NSFontAttributeName atIndex:0 effectiveRange:nil] : nil;
    font = font ?: [NSFont monospacedSystemFontOfSize:14 weight:NSFontWeightRegular];
    _ascent = (_lineHeight - (font.ascender - font.descender)) / 2 + font.ascender;
    NSMutableArray *lines = [NSMutableArray array];
    NSMutableArray *ranges = [NSMutableArray array];
    NSMutableArray *chunkStarts = [NSMutableArray array];
    CTTypesetterRef typesetter = nil;
    NSUInteger chunkStart = 0, chunkEnd = 0;
    NSUInteger offset = 0;
    do {
      // CoreText repeatedly shaping ranges deep inside one huge attributed
      // string becomes expensive. Restart at a visual-row boundary using a
      // bounded slice. Never emit the artificial end of a chunk as a wrap.
      if (!typesetter || offset >= chunkEnd) {
        if (typesetter) CFRelease(typesetter);
        chunkStart = offset;
        chunkEnd = wrap ? MIN(text.length, offset + 4096) : text.length;
        if (chunkEnd < text.length) {
          chunkEnd = NSMaxRange([text.string rangeOfComposedCharacterSequenceAtIndex:chunkEnd]);
        }
        NSAttributedString *chunk = [text attributedSubstringFromRange:NSMakeRange(chunkStart, chunkEnd - chunkStart)];
        typesetter = CTTypesetterCreateWithAttributedString((__bridge CFAttributedStringRef)chunk);
      }
      NSUInteger count = wrap ? CTTypesetterSuggestLineBreak(typesetter, offset - chunkStart, MAX(1, width)) : text.length;
      if (wrap && offset + count == chunkEnd && chunkEnd < text.length) {
        // Need following context before deciding whether this is a real break.
        // A row wider than the chunk grows the slice instead of looping.
        NSUInteger size = MAX((NSUInteger)4096, (chunkEnd - offset) * 2);
        chunkStart = offset;
        chunkEnd = MIN(text.length, offset + size);
        if (chunkEnd < text.length) chunkEnd = NSMaxRange([text.string rangeOfComposedCharacterSequenceAtIndex:chunkEnd]);
        CFRelease(typesetter);
        typesetter = CTTypesetterCreateWithAttributedString((__bridge CFAttributedStringRef)[text attributedSubstringFromRange:NSMakeRange(chunkStart, chunkEnd - chunkStart)]);
        continue;
      }
      if (offset < text.length && count == 0) {
        count = [text.string rangeOfComposedCharacterSequenceAtIndex:offset].length;
      }
      CTLineRef line = CTTypesetterCreateLine(typesetter, CFRangeMake(offset - chunkStart, count));
      [lines addObject:CFBridgingRelease(line)];
      [ranges addObject:[NSValue valueWithRange:NSMakeRange(offset, count)]];
      [chunkStarts addObject:@(chunkStart)];
      _width = MAX(_width, CTLineGetTypographicBounds(line, nil, nil, nil));
      offset += count;
    } while (offset < text.length);
    CFRelease(typesetter);
    _lines = lines;
    _ranges = ranges;
    _chunkStarts = chunkStarts;
    _visualLineCount = lines.count;
    _height = lines.count * _lineHeight;
  }
  return self;
}

- (NSUInteger)visualLineAtOffset:(NSUInteger)offset downstream:(BOOL)downstream
{
  offset = MIN(offset, _text.length);
  NSUInteger low = 0, high = _ranges.count;
  while (low + 1 < high) {
    NSUInteger mid = (low + high) / 2;
    NSRange range = _ranges[mid].rangeValue;
    if (offset > range.location || (downstream && offset == range.location)) low = mid;
    else high = mid;
  }
  return low;
}

- (NSRect)caretRectAtOffset:(NSUInteger)offset downstream:(BOOL)downstream
{
  NSUInteger row = [self visualLineAtOffset:offset downstream:downstream];
  CTLineRef line = (__bridge CTLineRef)_lines[row];
  CGFloat x = CTLineGetOffsetForStringIndex(line, MIN(offset, _text.length) - _chunkStarts[row].unsignedIntegerValue, nil);
  return NSMakeRect(x, row * _lineHeight, 1, _lineHeight);
}

- (NSUInteger)offsetAtPoint:(NSPoint)point
{
  NSUInteger row = MIN(_lines.count - 1, (NSUInteger)MAX(0, floor(point.y / _lineHeight)));
  CTLineRef line = (__bridge CTLineRef)_lines[row];
  NSRange range = _ranges[row].rangeValue;
  CFIndex index = CTLineGetStringIndexForPosition(line, CGPointMake(point.x, 0));
  NSUInteger base = _chunkStarts[row].unsignedIntegerValue;
  NSUInteger result = index == kCFNotFound ? NSMaxRange(range) : MIN(NSMaxRange(range), MAX(range.location, base + (NSUInteger)index));
  // CoreText can return a UTF-16 index within a composed sequence. Never expose
  // that as an edit boundary (surrogate pairs, combining accents, ZWJ emoji).
  if (result < _text.length) {
    NSRange composed = [_text.string rangeOfComposedCharacterSequenceAtIndex:result];
    if (result != composed.location) {
      CGFloat before = CTLineGetOffsetForStringIndex(line, composed.location - base, nil);
      CGFloat after = CTLineGetOffsetForStringIndex(line, NSMaxRange(composed) - base, nil);
      result = fabs(point.x - before) < fabs(point.x - after) ? composed.location : NSMaxRange(composed);
    }
  }
  return result;
}

- (NSArray<NSValue *> *)rectsForRange:(NSRange)range
{
  NSMutableArray<NSValue *> *rects = [NSMutableArray array];
  if (range.location > _text.length || range.length == 0) return rects;
  NSUInteger end = range.location + MIN(range.length, _text.length - range.location);
  NSUInteger first = [self visualLineAtOffset:range.location downstream:YES];
  NSUInteger last = [self visualLineAtOffset:end downstream:NO];
  for (NSUInteger row = first; row <= last; row++) {
    NSRange lineRange = _ranges[row].rangeValue;
    CTLineRef line = (__bridge CTLineRef)_lines[row];
    NSUInteger base = _chunkStarts[row].unsignedIntegerValue;
    CGFloat startX = CTLineGetOffsetForStringIndex(line, MAX(range.location, lineRange.location) - base, nil);
    CGFloat endX = CTLineGetOffsetForStringIndex(line, MIN(end, NSMaxRange(lineRange)) - base, nil);
    [rects addObject:[NSValue valueWithRect:NSMakeRect(MIN(startX, endX), row * _lineHeight, fabs(endX - startX), _lineHeight)]];
  }
  return rects;
}

- (NSUInteger)offsetByMovingVerticallyFrom:(NSUInteger)offset direction:(NSInteger)direction preferredX:(CGFloat)x
{
  NSInteger row = [self visualLineAtOffset:offset downstream:YES];
  row = MAX(0, MIN((NSInteger)_lines.count - 1, row + direction));
  return [self offsetAtPoint:NSMakePoint(x, row * _lineHeight + _lineHeight / 2)];
}

- (void)drawInContext:(CGContextRef)context origin:(NSPoint)origin dirtyRect:(NSRect)dirtyRect
{
  NSInteger first = MAX(0, floor((NSMinY(dirtyRect) - origin.y) / _lineHeight));
  NSInteger end = MIN((NSInteger)_lines.count, ceil((NSMaxY(dirtyRect) - origin.y) / _lineHeight));
  CGContextSaveGState(context);
  CGContextSetTextMatrix(context, CGAffineTransformMakeScale(1, -1));
  for (NSInteger row = first; row < end; row++) {
    CGContextSetTextPosition(context, origin.x, origin.y + row * _lineHeight + _ascent);
    CTLineDraw((__bridge CTLineRef)_lines[row], context);
  }
  CGContextRestoreGState(context);
}
@end
