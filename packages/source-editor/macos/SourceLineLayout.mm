#import "SourceLineLayout.h"
#import <CoreText/CoreText.h>
#include <vector>
#include <limits>
#include <cmath>
#include <algorithm>

@implementation LESourceLineLayout {
  NSAttributedString *_text;
  NSArray *_lines;
  NSArray<NSValue *> *_ranges;
  NSArray<NSNumber *> *_chunkStarts;
  CGFloat _lineHeight;
  CGFloat _ascent;
  BOOL _wrap, _indexedCarets;
  std::vector<CGFloat> _caretOffsets;
  std::vector<uint32_t> _hitIndices;
}

- (instancetype)initWithText:(NSAttributedString *)text width:(CGFloat)width lineHeight:(CGFloat)lineHeight wrap:(BOOL)wrap
{
  if ((self = [super init])) {
    _text = [text copy];
    _wrap = wrap;
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
  CGFloat x = [self offsetForIndex:MIN(offset, _text.length) row:row];
  return NSMakeRect(x, row * _lineHeight, 1, _lineHeight);
}

- (void)indexCarets {
  if (!_wrap && _text.length > 4096 && !_indexedCarets) {
      CTLineRef line = (__bridge CTLineRef)_lines[0];
      _indexedCarets = YES;
      _caretOffsets.assign(_text.length + 1, std::numeric_limits<CGFloat>::quiet_NaN());
      // CoreText's first caret query on a very fragmented CTLine can be
      // quadratic. Reuse its already-shaped positions for unambiguous ASCII
      // clusters. Keep the original line and CoreText fallback for ligatures,
      // bidi boundaries and composed text; never reshape artificial substrings.
      NSString *string = _text.string;
      for (id value in (__bridge NSArray *)CTLineGetGlyphRuns(line)) {
        CTRunRef run = (__bridge CTRunRef)value;
        if (CTRunGetStatus(run) & kCTRunStatusRightToLeft) continue;
        NSDictionary *attributes = (__bridge NSDictionary *)CTRunGetAttributes(run);
        CTFontRef font = (__bridge CTFontRef)attributes[(id)kCTFontAttributeName];
        if (!font || !(CTFontGetSymbolicTraits(font) & kCTFontMonoSpaceTrait)
            || attributes[NSKernAttributeName] || attributes[NSLigatureAttributeName]) continue;
        const auto count = CTRunGetGlyphCount(run);
        if (!count) continue;
        std::vector<CGPoint> positions(count);
        std::vector<CGSize> advances(count);
        std::vector<CFIndex> indices(count);
        CTRunGetPositions(run, CFRangeMake(0, 0), positions.data());
        CTRunGetAdvances(run, CFRangeMake(0, 0), advances.data());
        CTRunGetStringIndices(run, CFRangeMake(0, 0), indices.data());
        const auto range = CTRunGetStringRange(run);
        for (CFIndex i = 0; i < count; ++i) {
          const auto at = indices[i];
          const auto next = i + 1 < count ? indices[i + 1] : range.location + range.length;
          if (at < 0 || at >= (CFIndex)string.length || next != at + 1) continue;
          const auto ch = [string characterAtIndex:at];
          if (ch < 32 || ch > 126 || (at && [string characterAtIndex:at - 1] > 126)
              || (next < (CFIndex)string.length && [string characterAtIndex:next] > 126)) continue;
          _caretOffsets[at] = positions[i].x;
          if (next == (CFIndex)string.length) _caretOffsets[next] = positions[i].x + advances[i].width;
        }
      }
      for (NSUInteger i = 0; i < _caretOffsets.size(); ++i)
        if (std::isfinite(_caretOffsets[i])) _hitIndices.push_back(static_cast<uint32_t>(i));
      const auto byX = [&](auto a, auto b) { return _caretOffsets[a] < _caretOffsets[b]; };
      if (!std::is_sorted(_hitIndices.begin(), _hitIndices.end(), byX)) std::sort(_hitIndices.begin(), _hitIndices.end(), byX);
  }
}

- (CGFloat)offsetForIndex:(NSUInteger)index row:(NSUInteger)row {
  [self indexCarets];
  if (!_caretOffsets.empty() && std::isfinite(_caretOffsets[index])) return _caretOffsets[index];
  CTLineRef line = (__bridge CTLineRef)_lines[row];
  return CTLineGetOffsetForStringIndex(line, index - _chunkStarts[row].unsignedIntegerValue, nil);
}

- (NSUInteger)offsetAtPoint:(NSPoint)point
{
  [self indexCarets];
  if (!_hitIndices.empty()) {
    if (_hitIndices.front() == 0 && _caretOffsets[0] == 0 && point.x <= 0) return 0;
    if (_hitIndices.back() == _text.length && _caretOffsets.back() == _width && point.x >= _width) return _text.length;
    auto right = std::lower_bound(_hitIndices.begin(), _hitIndices.end(), point.x,
      [&](uint32_t index, CGFloat x) { return _caretOffsets[index] < x; });
    if (right != _hitIndices.end() && _caretOffsets[*right] == point.x) return *right;
    if (right != _hitIndices.begin() && right != _hitIndices.end()) {
      const auto a = *std::prev(right), b = *right;
      if (b == a + 1) return point.x - _caretOffsets[a] < _caretOffsets[b] - point.x ? a : b;
    }
  }
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
    CGFloat startX = [self offsetForIndex:MAX(range.location, lineRange.location) row:row];
    CGFloat endX = [self offsetForIndex:MIN(end, NSMaxRange(lineRange)) row:row];
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
