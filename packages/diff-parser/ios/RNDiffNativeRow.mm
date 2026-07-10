#import "RNDiffNativeRow.h"

#import <CoreText/CoreText.h>

#import <react/renderer/components/RNDiffParserSpec/ComponentDescriptors.h>
#import <react/renderer/components/RNDiffParserSpec/Props.h>
#import <react/renderer/components/RNDiffParserSpec/RCTComponentViewHelpers.h>

#import "../cpp/DiffInlineChange.hpp"
#import "../cpp/HybridDiffDocument.hpp"

#include <algorithm>
#include <cmath>
#include <string>
#include <variant>
#include <vector>

using namespace facebook::react;
using namespace margelo::nitro::legendapps::diffparser;

#if TARGET_OS_OSX
static constexpr double diffChangeTypeAdd = 1;
static constexpr double diffChangeTypeRemove = 2;
static constexpr double diffRowKindLine = 2;
static constexpr CGFloat diffSideBySideHorizontalPadding = 12;

static NSColor *RNDiffColorFromString(NSString *value, NSColor *fallback)
{
  NSString *trimmed = [[value stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet] lowercaseString];
  if (trimmed.length == 0) {
    return fallback;
  }
  if ([trimmed isEqualToString:@"transparent"]) {
    return NSColor.clearColor;
  }
  if ([trimmed hasPrefix:@"#"]) {
    NSString *hex = [trimmed substringFromIndex:1];
    if (hex.length == 3) {
      unichar r = [hex characterAtIndex:0];
      unichar g = [hex characterAtIndex:1];
      unichar b = [hex characterAtIndex:2];
      hex = [NSString stringWithFormat:@"%C%C%C%C%C%C", r, r, g, g, b, b];
    }
    if (hex.length == 6 || hex.length == 8) {
      unsigned int rgba = 0;
      [[NSScanner scannerWithString:hex] scanHexInt:&rgba];
      CGFloat red = 0;
      CGFloat green = 0;
      CGFloat blue = 0;
      CGFloat alpha = 1;
      if (hex.length == 6) {
        red = ((rgba >> 16) & 0xFF) / 255.0;
        green = ((rgba >> 8) & 0xFF) / 255.0;
        blue = (rgba & 0xFF) / 255.0;
      } else {
        red = ((rgba >> 24) & 0xFF) / 255.0;
        green = ((rgba >> 16) & 0xFF) / 255.0;
        blue = ((rgba >> 8) & 0xFF) / 255.0;
        alpha = (rgba & 0xFF) / 255.0;
      }
      return [NSColor colorWithRed:red green:green blue:blue alpha:alpha];
    }
  }
  return fallback;
}

static NSString *RNDiffStringFromStdString(const std::string &value)
{
  return [NSString stringWithUTF8String:value.c_str()] ?: @"";
}

static NSString *RNDiffAccessibleLineDescription(const DiffRenderRow &row, NSString *side)
{
  if (row.kind != diffRowKindLine) {
    return @"";
  }

  NSString *changeDescription = @"Unchanged";
  double lineNumber = row.newLineNumber >= 0 ? row.newLineNumber : row.oldLineNumber;
  if (row.changeType == diffChangeTypeAdd) {
    changeDescription = @"Added";
    lineNumber = row.newLineNumber;
  } else if (row.changeType == diffChangeTypeRemove) {
    changeDescription = @"Removed";
    lineNumber = row.oldLineNumber;
  }

  NSString *text = RNDiffStringFromStdString(row.text);
  NSString *contentDescription = text.length > 0 ? text : @"blank line";
  NSString *sidePrefix = side.length > 0 ? [side stringByAppendingString:@", "] : @"";
  if (lineNumber >= 0) {
    return [NSString stringWithFormat:@"%@%@ line %.0f: %@", sidePrefix, changeDescription, lineNumber, contentDescription];
  }
  return [NSString stringWithFormat:@"%@%@: %@", sidePrefix, changeDescription, contentDescription];
}

static std::u16string RNDiffUTF16String(NSString *text)
{
  std::u16string result(text.length, u'\0');
  if (text.length > 0) {
    [text getCharacters:reinterpret_cast<unichar *>(result.data()) range:NSMakeRange(0, text.length)];
  }
  return result;
}

static NSArray<NSValue *> *RNDiffInlineRangeValues(const std::vector<DiffInlineChangeRange> &ranges)
{
  NSMutableArray<NSValue *> *values = [NSMutableArray arrayWithCapacity:ranges.size()];
  for (const auto &range : ranges) {
    [values addObject:[NSValue valueWithRange:NSMakeRange(range.start, range.length)]];
  }
  return values;
}

@protocol RNDiffHorizontalScrollerSyncing <NSObject>
- (void)syncFromConfig;
- (void)handleScrollWheel:(NSEvent *)event;
@end

static void RNDiffNativeRowInvalidateViews(NSString *configId);

@interface RNDiffNativeRowRenderConfig : NSObject
@property(nonatomic, copy) NSString *configId;
@property(nonatomic, assign) double documentId;
@property(nonatomic, assign) double rowHeight;
@property(nonatomic, assign) double changeBarWidth;
@property(nonatomic, assign) double lineNumberWidth;
@property(nonatomic, assign) double markerWidth;
@property(nonatomic, assign) double horizontalViewportWidth;
@property(nonatomic, assign) double horizontalOffset;
@property(nonatomic, assign) double maxHorizontalOffset;
@property(nonatomic, assign) double maxTextWidth;
@property(nonatomic, weak) id<RNDiffHorizontalScrollerSyncing> horizontalScroller;
@property(nonatomic, assign) BOOL highlightChangedCharacters;
@property(nonatomic, assign) BOOL hasSelection;
@property(nonatomic, assign) double selectionAnchorRowIndex;
@property(nonatomic, assign) NSUInteger selectionAnchorColumn;
@property(nonatomic, assign) double selectionFocusRowIndex;
@property(nonatomic, assign) NSUInteger selectionFocusColumn;
@property(nonatomic, assign) NSInteger selectionSide;
@property(nonatomic, assign) BOOL syntaxHighlightingEnabled;
@property(nonatomic, copy) NSString *themeName;
@property(nonatomic, copy) NSString *presentation;
@property(nonatomic, strong) NSFont *font;
@property(nonatomic, strong) NSColor *foregroundColor;
@property(nonatomic, strong) NSColor *mutedColor;
@property(nonatomic, strong) NSColor *addAccentColor;
@property(nonatomic, strong) NSColor *removeAccentColor;
@property(nonatomic, strong) NSColor *addBackgroundColor;
@property(nonatomic, strong) NSColor *removeBackgroundColor;
@property(nonatomic, strong) NSColor *addInlineHighlightColor;
@property(nonatomic, strong) NSColor *removeInlineHighlightColor;
@property(nonatomic, strong) NSColor *dividerColor;
@property(nonatomic, strong) NSColor *searchHighlightColor;
@property(nonatomic, strong) NSColor *activeSearchHighlightColor;
@property(nonatomic, strong) NSColor *activeSearchRowHighlightColor;
@property(nonatomic, copy) NSDictionary<NSString *, NSString *> *searchHighlightByRowIndex;
@property(nonatomic, copy) NSDictionary<NSString *, NSString *> *activeSearchHighlightByRowIndex;
@property(nonatomic, strong) NSMutableParagraphStyle *textParagraph;
@property(nonatomic, strong) NSMutableParagraphStyle *rightParagraph;
@property(nonatomic, strong) NSMutableParagraphStyle *centerParagraph;
@property(nonatomic, copy) NSDictionary *baseTextAttributes;
@property(nonatomic, copy) NSDictionary *addLineNumberAttributes;
@property(nonatomic, copy) NSDictionary *removeLineNumberAttributes;
@property(nonatomic, copy) NSDictionary *mutedLineNumberAttributes;
@property(nonatomic, copy) NSDictionary *addMarkerAttributes;
@property(nonatomic, copy) NSDictionary *removeMarkerAttributes;
@property(nonatomic, copy) NSDictionary *mutedMarkerAttributes;
@property(nonatomic, strong) NSMutableDictionary<NSNumber *, id> *scopeColorById;
@property(nonatomic, strong) NSCache<NSNumber *, NSArray<NSValue *> *> *inlineHighlightRangesByRowIndex;
- (void)recordTextWidth:(double)textWidth;
- (void)setHorizontalOffsetClamped:(double)horizontalOffset;
- (void)updateHorizontalMetrics;
- (void)setFontFamily:(NSString *)fontFamily fontSize:(double)fontSize;
- (void)setForegroundColorString:(NSString *)foregroundColor
                mutedColorString:(NSString *)mutedColor
            addAccentColorString:(NSString *)addAccentColor
         removeAccentColorString:(NSString *)removeAccentColor
        addBackgroundColorString:(NSString *)addBackgroundColor
     removeBackgroundColorString:(NSString *)removeBackgroundColor
              dividerColorString:(NSString *)dividerColor;
- (void)setSearchHighlightColorString:(NSString *)searchHighlightColor
              activeHighlightColorString:(NSString *)activeSearchHighlightColor
         activeRowHighlightColorString:(NSString *)activeSearchRowHighlightColor;
- (void)setCollapsedFileIndexesString:(NSString *)value;
- (void)setSearchHighlightByRowIndexString:(NSString *)value active:(BOOL)active;
- (NSString *)searchHighlightsForRowIndex:(double)rowIndex active:(BOOL)active;
- (const std::vector<double> &)collapsedFileIndexes;
- (NSColor *)colorForScopeId:(double)scopeId document:(HybridDiffDocument *)document;
- (NSArray<NSValue *> *)inlineHighlightRangesForRow:(const DiffRenderRow &)row
                                           document:(HybridDiffDocument *)document;
- (void)setSelectionAnchorRowIndex:(double)anchorRowIndex
                      anchorColumn:(NSUInteger)anchorColumn
                     focusRowIndex:(double)focusRowIndex
                       focusColumn:(NSUInteger)focusColumn
                              side:(NSInteger)side;
- (void)setSelectionFocusRowIndex:(double)focusRowIndex focusColumn:(NSUInteger)focusColumn;
- (NSRange)selectionRangeForRowIndex:(double)rowIndex side:(NSInteger)side textLength:(NSUInteger)textLength;
- (NSDictionary *)lineNumberAttributesForChangeType:(double)changeType;
- (NSDictionary *)markerAttributesForChangeType:(double)changeType;
- (void)updateTextAttributes;
@end

@implementation RNDiffNativeRowRenderConfig {
  std::vector<double> _collapsedFileIndexes;
}

- (instancetype)init
{
  if (self = [super init]) {
    _configId = @"";
    _documentId = 0;
    _rowHeight = 18;
    _changeBarWidth = 3;
    _lineNumberWidth = 44;
    _markerWidth = 14;
    _horizontalViewportWidth = 0;
    _horizontalOffset = 0;
    _maxHorizontalOffset = 0;
    _maxTextWidth = 0;
    _highlightChangedCharacters = YES;
    _hasSelection = NO;
    _selectionAnchorRowIndex = -1;
    _selectionFocusRowIndex = -1;
    _selectionSide = 0;
    _syntaxHighlightingEnabled = YES;
    _themeName = @"dark-plus";
    _presentation = @"unified";
    _scopeColorById = [NSMutableDictionary new];
    _inlineHighlightRangesByRowIndex = [NSCache new];
    _inlineHighlightRangesByRowIndex.countLimit = 4096;
    _font = [NSFont monospacedSystemFontOfSize:12 weight:NSFontWeightRegular];
    _foregroundColor = NSColor.labelColor;
    _mutedColor = NSColor.secondaryLabelColor;
    _addAccentColor = _foregroundColor;
    _removeAccentColor = _foregroundColor;
    _addBackgroundColor = NSColor.clearColor;
    _removeBackgroundColor = NSColor.clearColor;
    _addInlineHighlightColor = [_addAccentColor colorWithAlphaComponent:0.28];
    _removeInlineHighlightColor = [_removeAccentColor colorWithAlphaComponent:0.28];
    _dividerColor = NSColor.clearColor;
    _searchHighlightColor = [NSColor colorWithRed:1 green:0.78 blue:0.2 alpha:0.42];
    _activeSearchHighlightColor = [NSColor colorWithRed:1 green:0.48 blue:0 alpha:0.74];
    _activeSearchRowHighlightColor = [NSColor colorWithRed:1 green:0.58 blue:0 alpha:0.22];
    _searchHighlightByRowIndex = @{};
    _activeSearchHighlightByRowIndex = @{};
    _textParagraph = [NSMutableParagraphStyle new];
    _textParagraph.lineBreakMode = NSLineBreakByClipping;
    _rightParagraph = [NSMutableParagraphStyle new];
    _rightParagraph.alignment = NSTextAlignmentRight;
    _centerParagraph = [NSMutableParagraphStyle new];
    _centerParagraph.alignment = NSTextAlignmentCenter;
    [self updateTextAttributes];
  }
  return self;
}

- (void)setThemeName:(NSString *)themeName
{
  NSString *nextThemeName = [themeName copy] ?: @"";
  if (![_themeName isEqualToString:nextThemeName]) {
    _themeName = nextThemeName;
    [self.scopeColorById removeAllObjects];
  }
}

- (void)updateTextAttributes
{
  self.baseTextAttributes = @{
    NSFontAttributeName: self.font,
    NSForegroundColorAttributeName: self.foregroundColor,
    NSParagraphStyleAttributeName: self.textParagraph,
  };
  self.addLineNumberAttributes = @{
    NSFontAttributeName: self.font,
    NSForegroundColorAttributeName: self.addAccentColor,
    NSParagraphStyleAttributeName: self.rightParagraph,
  };
  self.removeLineNumberAttributes = @{
    NSFontAttributeName: self.font,
    NSForegroundColorAttributeName: self.removeAccentColor,
    NSParagraphStyleAttributeName: self.rightParagraph,
  };
  self.mutedLineNumberAttributes = @{
    NSFontAttributeName: self.font,
    NSForegroundColorAttributeName: self.mutedColor,
    NSParagraphStyleAttributeName: self.rightParagraph,
  };
  self.addMarkerAttributes = @{
    NSFontAttributeName: self.font,
    NSForegroundColorAttributeName: self.addAccentColor,
    NSParagraphStyleAttributeName: self.centerParagraph,
  };
  self.removeMarkerAttributes = @{
    NSFontAttributeName: self.font,
    NSForegroundColorAttributeName: self.removeAccentColor,
    NSParagraphStyleAttributeName: self.centerParagraph,
  };
  self.mutedMarkerAttributes = @{
    NSFontAttributeName: self.font,
    NSForegroundColorAttributeName: self.mutedColor,
    NSParagraphStyleAttributeName: self.centerParagraph,
  };
}

- (void)setFontFamily:(NSString *)fontFamily fontSize:(double)fontSize
{
  NSFont *font = [NSFont fontWithName:fontFamily size:fontSize];
  NSFont *nextFont = font ?: [NSFont monospacedSystemFontOfSize:fontSize weight:NSFontWeightRegular];
  const BOOL fontChanged = ![self.font.fontName isEqualToString:nextFont.fontName]
    || fabs(self.font.pointSize - nextFont.pointSize) > 0.01;
  self.font = nextFont;
  if (fontChanged) {
    self.maxTextWidth = 0;
    self.horizontalOffset = 0;
  }
  const CGFloat spaceWidth = [@" " sizeWithAttributes:@{NSFontAttributeName: self.font}].width;
  self.textParagraph.defaultTabInterval = MAX(1, spaceWidth * 4);
  self.textParagraph.tabStops = @[];
  [self updateTextAttributes];
}

- (void)recordTextWidth:(double)textWidth
{
  if (std::isfinite(textWidth) && textWidth > self.maxTextWidth) {
    self.maxTextWidth = ceil(textWidth);
    [self updateHorizontalMetrics];
  }
}

- (void)setHorizontalOffsetClamped:(double)horizontalOffset
{
  const double nextOffset = std::clamp(horizontalOffset, 0.0, self.maxHorizontalOffset);
  if (fabs(nextOffset - self.horizontalOffset) > 0.01) {
    self.horizontalOffset = nextOffset;
    RNDiffNativeRowInvalidateViews(self.configId);
    [self.horizontalScroller syncFromConfig];
  }
}

- (void)updateHorizontalMetrics
{
  const double columnWidth = [self.presentation isEqualToString:@"blocks"]
    ? floor(self.horizontalViewportWidth / 2.0)
    : self.horizontalViewportWidth;
  const double gutterWidth = [self.presentation isEqualToString:@"blocks"]
    ? self.lineNumberWidth + self.markerWidth
    : self.changeBarWidth + self.lineNumberWidth * 2 + self.markerWidth;
  const double textViewportWidth = MAX(0, columnWidth - gutterWidth - diffSideBySideHorizontalPadding);
  const double nextMaxOffset = MAX(0, self.maxTextWidth - textViewportWidth);
  const BOOL offsetChanged = self.horizontalOffset > nextMaxOffset;
  self.maxHorizontalOffset = nextMaxOffset;
  if (offsetChanged) {
    self.horizontalOffset = nextMaxOffset;
    RNDiffNativeRowInvalidateViews(self.configId);
  }
  [self.horizontalScroller syncFromConfig];
}

- (void)setForegroundColorString:(NSString *)foregroundColor
                mutedColorString:(NSString *)mutedColor
            addAccentColorString:(NSString *)addAccentColor
         removeAccentColorString:(NSString *)removeAccentColor
        addBackgroundColorString:(NSString *)addBackgroundColor
     removeBackgroundColorString:(NSString *)removeBackgroundColor
              dividerColorString:(NSString *)dividerColor
{
  NSColor *nextForegroundColor = RNDiffColorFromString(foregroundColor, NSColor.labelColor);
  const BOOL shouldResetScopeColors = ![self.foregroundColor isEqual:nextForegroundColor];
  self.foregroundColor = nextForegroundColor;
  self.mutedColor = RNDiffColorFromString(mutedColor, NSColor.secondaryLabelColor);
  self.addAccentColor = RNDiffColorFromString(addAccentColor, nextForegroundColor);
  self.removeAccentColor = RNDiffColorFromString(removeAccentColor, nextForegroundColor);
  self.addBackgroundColor = RNDiffColorFromString(addBackgroundColor, NSColor.clearColor);
  self.removeBackgroundColor = RNDiffColorFromString(removeBackgroundColor, NSColor.clearColor);
  self.addInlineHighlightColor = [self.addAccentColor colorWithAlphaComponent:0.28];
  self.removeInlineHighlightColor = [self.removeAccentColor colorWithAlphaComponent:0.28];
  self.dividerColor = RNDiffColorFromString(dividerColor, NSColor.clearColor);
  if (shouldResetScopeColors) {
    [self.scopeColorById removeAllObjects];
  }
  [self updateTextAttributes];
}

- (void)setSearchHighlightColorString:(NSString *)searchHighlightColor
              activeHighlightColorString:(NSString *)activeSearchHighlightColor
         activeRowHighlightColorString:(NSString *)activeSearchRowHighlightColor
{
  self.searchHighlightColor = RNDiffColorFromString(
    searchHighlightColor,
    [NSColor colorWithRed:1 green:0.78 blue:0.2 alpha:0.42]
  );
  self.activeSearchHighlightColor = RNDiffColorFromString(
    activeSearchHighlightColor,
    [NSColor colorWithRed:1 green:0.48 blue:0 alpha:0.74]
  );
  self.activeSearchRowHighlightColor = RNDiffColorFromString(
    activeSearchRowHighlightColor,
    [NSColor colorWithRed:1 green:0.58 blue:0 alpha:0.22]
  );
}

- (NSDictionary<NSString *, NSString *> *)parseSearchHighlightByRowIndexString:(NSString *)value
{
  if (value.length == 0) {
    return @{};
  }

  NSData *data = [value dataUsingEncoding:NSUTF8StringEncoding];
  if (!data) {
    return @{};
  }

  id decoded = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
  if (![decoded isKindOfClass:NSDictionary.class]) {
    return @{};
  }

  NSMutableDictionary<NSString *, NSString *> *highlights = [NSMutableDictionary new];
  [(NSDictionary *)decoded enumerateKeysAndObjectsUsingBlock:^(id key, id object, BOOL *stop) {
    if ([key isKindOfClass:NSString.class] && [object isKindOfClass:NSString.class]) {
      highlights[(NSString *)key] = (NSString *)object;
    }
  }];
  return highlights;
}

- (void)setSearchHighlightByRowIndexString:(NSString *)value active:(BOOL)active
{
  NSDictionary<NSString *, NSString *> *highlights = [self parseSearchHighlightByRowIndexString:value];
  if (active) {
    self.activeSearchHighlightByRowIndex = highlights;
  } else {
    self.searchHighlightByRowIndex = highlights;
  }
}

- (NSString *)searchHighlightsForRowIndex:(double)rowIndex active:(BOOL)active
{
  if (rowIndex < 0) {
    return @"";
  }
  NSString *key = [NSString stringWithFormat:@"%.0f", floor(rowIndex)];
  NSString *highlights = active ? self.activeSearchHighlightByRowIndex[key] : self.searchHighlightByRowIndex[key];
  return highlights ?: @"";
}

- (void)setCollapsedFileIndexesString:(NSString *)value
{
  _collapsedFileIndexes.clear();
  for (NSString *part in [value componentsSeparatedByString:@","]) {
    NSString *trimmed = [part stringByTrimmingCharactersInSet:NSCharacterSet.whitespaceAndNewlineCharacterSet];
    if (trimmed.length > 0) {
      _collapsedFileIndexes.push_back(trimmed.doubleValue);
    }
  }
}

- (const std::vector<double> &)collapsedFileIndexes
{
  return _collapsedFileIndexes;
}

- (void)setSelectionAnchorRowIndex:(double)anchorRowIndex
                      anchorColumn:(NSUInteger)anchorColumn
                     focusRowIndex:(double)focusRowIndex
                       focusColumn:(NSUInteger)focusColumn
                              side:(NSInteger)side
{
  self.hasSelection = YES;
  self.selectionAnchorRowIndex = floor(anchorRowIndex);
  self.selectionAnchorColumn = anchorColumn;
  self.selectionFocusRowIndex = floor(focusRowIndex);
  self.selectionFocusColumn = focusColumn;
  self.selectionSide = side;
  RNDiffNativeRowInvalidateViews(self.configId);
}

- (void)setSelectionFocusRowIndex:(double)focusRowIndex focusColumn:(NSUInteger)focusColumn
{
  if (self.hasSelection) {
    self.selectionFocusRowIndex = floor(focusRowIndex);
    self.selectionFocusColumn = focusColumn;
    RNDiffNativeRowInvalidateViews(self.configId);
  }
}

- (NSRange)selectionRangeForRowIndex:(double)rowIndex side:(NSInteger)side textLength:(NSUInteger)textLength
{
  if (!self.hasSelection || side != self.selectionSide) {
    return NSMakeRange(NSNotFound, 0);
  }

  double startRow = self.selectionAnchorRowIndex;
  NSUInteger startColumn = self.selectionAnchorColumn;
  double endRow = self.selectionFocusRowIndex;
  NSUInteger endColumn = self.selectionFocusColumn;
  if (startRow > endRow || (startRow == endRow && startColumn > endColumn)) {
    std::swap(startRow, endRow);
    std::swap(startColumn, endColumn);
  }

  const double safeRowIndex = floor(rowIndex);
  if (safeRowIndex < startRow || safeRowIndex > endRow) {
    return NSMakeRange(NSNotFound, 0);
  }

  const NSUInteger safeStartColumn = MIN(startColumn, textLength);
  const NSUInteger safeEndColumn = MIN(endColumn, textLength);
  if (startRow == endRow) {
    return NSMakeRange(safeStartColumn, safeEndColumn - safeStartColumn);
  }
  if (safeRowIndex == startRow) {
    return NSMakeRange(safeStartColumn, textLength - safeStartColumn);
  }
  if (safeRowIndex == endRow) {
    return NSMakeRange(0, safeEndColumn);
  }
  return NSMakeRange(0, textLength);
}

- (NSColor *)colorForScopeId:(double)scopeId document:(HybridDiffDocument *)document
{
  const auto safeScopeId = std::max(0.0, std::floor(scopeId));
  NSNumber *key = @(safeScopeId);
  id cachedColor = self.scopeColorById[key];
  if (cachedColor != nil) {
    return cachedColor == NSNull.null ? nil : cachedColor;
  }

  const char *themeName = self.themeName.UTF8String;
  const auto scopeStyle = document->getNativeScopeStyle(themeName ? themeName : "", safeScopeId);
  NSColor *scopeColor = nil;
  if (!scopeStyle.foreground.empty()) {
    scopeColor = RNDiffColorFromString(RNDiffStringFromStdString(scopeStyle.foreground), self.foregroundColor);
  }
  self.scopeColorById[key] = scopeColor ?: NSNull.null;
  return scopeColor;
}

- (NSArray<NSValue *> *)inlineHighlightRangesForRow:(const DiffRenderRow &)row
                                           document:(HybridDiffDocument *)document
{
  if (!self.highlightChangedCharacters || row.index < 0 || row.kind != diffRowKindLine) {
    return @[];
  }

  NSNumber *rowKey = @(floor(row.index));
  NSArray<NSValue *> *cachedRanges = [self.inlineHighlightRangesByRowIndex objectForKey:rowKey];
  if (cachedRanges != nil) {
    return cachedRanges;
  }

  const auto pair = document->getChangedLinePair(row.index);
  if (!pair.has_value()) {
    return @[];
  }

  NSString *removedText = RNDiffStringFromStdString(pair->removedRow.text);
  NSString *addedText = RNDiffStringFromStdString(pair->addedRow.text);
  const auto removedUTF16 = RNDiffUTF16String(removedText);
  const auto addedUTF16 = RNDiffUTF16String(addedText);
  const bool similarEnough = pair->balanced || getDiffInlineLineSimilarity(removedUTF16, addedUTF16) >= 0.25;
  if (!similarEnough) {
    return @[];
  }

  const auto ranges = createDiffInlineChangeRanges(removedUTF16, addedUTF16);
  NSArray<NSValue *> *removedRanges = RNDiffInlineRangeValues(ranges.removedRanges);
  NSArray<NSValue *> *addedRanges = RNDiffInlineRangeValues(ranges.addedRanges);
  NSNumber *removedKey = @(floor(pair->removedRow.index));
  NSNumber *addedKey = @(floor(pair->addedRow.index));
  [self.inlineHighlightRangesByRowIndex setObject:removedRanges forKey:removedKey];
  [self.inlineHighlightRangesByRowIndex setObject:addedRanges forKey:addedKey];
  return row.changeType == diffChangeTypeRemove ? removedRanges : addedRanges;
}

- (NSDictionary *)lineNumberAttributesForChangeType:(double)changeType
{
  if (changeType == diffChangeTypeAdd) {
    return self.addLineNumberAttributes;
  }
  if (changeType == diffChangeTypeRemove) {
    return self.removeLineNumberAttributes;
  }
  return self.mutedLineNumberAttributes;
}

- (NSDictionary *)markerAttributesForChangeType:(double)changeType
{
  if (changeType == diffChangeTypeAdd) {
    return self.addMarkerAttributes;
  }
  if (changeType == diffChangeTypeRemove) {
    return self.removeMarkerAttributes;
  }
  return self.mutedMarkerAttributes;
}

@end

static NSMutableDictionary<NSString *, RNDiffNativeRowRenderConfig *> *RNDiffNativeRowConfigRegistry()
{
  static NSMutableDictionary<NSString *, RNDiffNativeRowRenderConfig *> *registry;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    registry = [NSMutableDictionary new];
  });
  return registry;
}

static RNDiffNativeRowRenderConfig *RNDiffNativeRowConfigForId(NSString *configId)
{
  return RNDiffNativeRowConfigRegistry()[configId];
}

static NSMutableDictionary<NSString *, NSHashTable<NSView *> *> *RNDiffNativeRowViewRegistry()
{
  static NSMutableDictionary<NSString *, NSHashTable<NSView *> *> *registry;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    registry = [NSMutableDictionary new];
  });
  return registry;
}

static void RNDiffNativeRowRegisterView(NSString *configId, NSView *view)
{
  if (configId.length == 0) {
    return;
  }
  NSMutableDictionary<NSString *, NSHashTable<NSView *> *> *registry = RNDiffNativeRowViewRegistry();
  NSHashTable<NSView *> *views = registry[configId];
  if (!views) {
    views = [NSHashTable weakObjectsHashTable];
    registry[configId] = views;
  }
  [views addObject:view];
}

static void RNDiffNativeRowUnregisterView(NSString *configId, NSView *view)
{
  if (configId.length == 0) {
    return;
  }
  NSHashTable<NSView *> *views = RNDiffNativeRowViewRegistry()[configId];
  [views removeObject:view];
  if (views.count == 0) {
    [RNDiffNativeRowViewRegistry() removeObjectForKey:configId];
  }
}

static void RNDiffNativeRowInvalidateViews(NSString *configId)
{
  for (NSView *view in RNDiffNativeRowViewRegistry()[configId]) {
    [view setNeedsDisplay:YES];
  }
}

@class RNDiffHorizontalScrollerContentView;

static NSMapTable<NSString *, RNDiffHorizontalScrollerContentView *> *RNDiffHorizontalScrollerRegistry()
{
  static NSMapTable<NSString *, RNDiffHorizontalScrollerContentView *> *registry;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    registry = [NSMapTable strongToWeakObjectsMapTable];
  });
  return registry;
}

@interface RNDiffHorizontalScrollerContentView : NSView <RNDiffHorizontalScrollerSyncing>
@property(nonatomic, copy) NSString *configId;
@property(nonatomic, strong) NSScrollView *scrollView;
@property(nonatomic, strong) NSView *scrollDocumentView;
@property(nonatomic, assign) BOOL scrollEnabled;
@property(nonatomic, assign) BOOL syncingFromConfig;
@end

@implementation RNDiffHorizontalScrollerContentView

- (instancetype)init
{
  if (self = [super initWithFrame:NSZeroRect]) {
    _configId = @"";
    _scrollDocumentView = [[NSView alloc] initWithFrame:NSMakeRect(0, 0, 1, 1)];
    _scrollView = [[NSScrollView alloc] initWithFrame:NSZeroRect];
    _scrollView.autohidesScrollers = NO;
    _scrollView.drawsBackground = NO;
    _scrollView.hasHorizontalScroller = YES;
    _scrollView.hasVerticalScroller = NO;
    _scrollView.horizontalScrollElasticity = NSScrollElasticityNone;
    _scrollView.scrollerStyle = NSScrollerStyleOverlay;
    _scrollView.verticalScrollElasticity = NSScrollElasticityNone;
    _scrollView.documentView = _scrollDocumentView;
    _scrollView.contentView.postsBoundsChangedNotifications = YES;
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(handleClipViewBoundsChanged:)
                                                 name:NSViewBoundsDidChangeNotification
                                               object:_scrollView.contentView];
    [self addSubview:_scrollView];
  }
  return self;
}

- (BOOL)isFlipped
{
  return YES;
}

- (void)setConfigId:(NSString *)configId
{
  NSString *nextConfigId = configId ?: @"";
  if ([_configId isEqualToString:nextConfigId]) {
    return;
  }
  if (_configId.length > 0 && [RNDiffHorizontalScrollerRegistry() objectForKey:_configId] == self) {
    [RNDiffHorizontalScrollerRegistry() removeObjectForKey:_configId];
    RNDiffNativeRowRenderConfig *previousConfig = RNDiffNativeRowConfigForId(_configId);
    if (previousConfig.horizontalScroller == self) {
      previousConfig.horizontalScroller = nil;
    }
  }
  _configId = [nextConfigId copy];
  if (_configId.length > 0) {
    [RNDiffHorizontalScrollerRegistry() setObject:self forKey:_configId];
    RNDiffNativeRowRenderConfig *config = RNDiffNativeRowConfigForId(_configId);
    config.horizontalScroller = self;
  }
  [self syncFromConfig];
}

- (void)dealloc
{
  [[NSNotificationCenter defaultCenter] removeObserver:self];
  if (_configId.length > 0 && [RNDiffHorizontalScrollerRegistry() objectForKey:_configId] == self) {
    [RNDiffHorizontalScrollerRegistry() removeObjectForKey:_configId];
  }
}

- (void)layout
{
  [super layout];
  self.scrollView.frame = self.bounds;
  [self syncFromConfig];
}

- (void)handleClipViewBoundsChanged:(__unused NSNotification *)notification
{
  if (!self.syncingFromConfig) {
    RNDiffNativeRowRenderConfig *config = RNDiffNativeRowConfigForId(self.configId);
    [config setHorizontalOffsetClamped:self.scrollView.contentView.bounds.origin.x];
  }
}

- (void)handleScrollWheel:(NSEvent *)event
{
  if (self.scrollEnabled) {
    [self.scrollView scrollWheel:event];
  }
}

- (void)syncFromConfig
{
  RNDiffNativeRowRenderConfig *config = RNDiffNativeRowConfigForId(self.configId);
  const double viewportWidth = MAX(0, config.horizontalViewportWidth);
  const double maxOffset = MAX(0, config.maxHorizontalOffset);
  self.scrollEnabled = config != nil && viewportWidth > 0 && maxOffset > 0.5;
  self.hidden = !self.scrollEnabled;
  self.scrollView.horizontalScroller.hidden = !self.scrollEnabled;

  const CGFloat documentWidth = MAX(1, viewportWidth + maxOffset);
  self.scrollDocumentView.frame = NSMakeRect(0, 0, documentWidth, MAX(1, self.bounds.size.height));
  self.syncingFromConfig = YES;
  [self.scrollView.contentView scrollToPoint:NSMakePoint(config.horizontalOffset, 0)];
  [self.scrollView reflectScrolledClipView:self.scrollView.contentView];
  self.syncingFromConfig = NO;
}

@end

static BOOL RNDiffHandleHorizontalScroll(NSString *configId, NSEvent *event)
{
  RNDiffNativeRowRenderConfig *config = RNDiffNativeRowConfigForId(configId);
  const CGFloat deltaX = fabs(event.scrollingDeltaX);
  const CGFloat deltaY = fabs(event.scrollingDeltaY);
  const BOOL shiftScroll = (event.modifierFlags & NSEventModifierFlagShift) != 0 && deltaY > 0.01;
  const BOOL horizontalScroll = deltaX > 0.01 && deltaX >= deltaY;
  if ((shiftScroll || horizontalScroll) && config.horizontalScroller != nil && config.maxHorizontalOffset > 0.5) {
    [config.horizontalScroller handleScrollWheel:event];
    return YES;
  }
  return NO;
}

static void RNDiffDrawHorizontalText(
    NSMutableAttributedString *attributedText,
    NSRect clipRect,
    CGFloat textY,
    RNDiffNativeRowRenderConfig *config)
{
  if (clipRect.size.width <= 0 || attributedText.length == 0) {
    return;
  }
  [config recordTextWidth:[attributedText size].width];
  [NSGraphicsContext saveGraphicsState];
  NSRectClip(clipRect);
  [attributedText drawAtPoint:NSMakePoint(clipRect.origin.x - config.horizontalOffset, textY)];
  [NSGraphicsContext restoreGraphicsState];
}

@interface RNDiffNativeRowContentView : NSView
@property(nonatomic, copy) NSString *configId;
@property(nonatomic, assign) double configVersion;
@property(nonatomic, assign) double rowIndex;
@property(nonatomic, copy) NSString *adaptiveRender;
@property(nonatomic, strong) NSMutableAttributedString *attributedTextScratch;
@end

@implementation RNDiffNativeRowContentView

- (instancetype)init
{
  if (self = [super initWithFrame:NSZeroRect]) {
    _configId = @"";
    _adaptiveRender = @"normal";
    _attributedTextScratch = [[NSMutableAttributedString alloc] initWithString:@""];
  }
  return self;
}

- (BOOL)isFlipped
{
  return YES;
}

- (NSString *)diffAccessibilityLabel
{
  RNDiffNativeRowRenderConfig *config = RNDiffNativeRowConfigForId(self.configId);
  NSString *label = @"";
  if (config) {
    auto document = getRegisteredDiffDocument(config.documentId);
    if (document) {
      if ([config.presentation isEqualToString:@"blocks"]) {
        const auto row = document->getPlainSideBySideRow(self.rowIndex, [config collapsedFileIndexes]);
        if (row.kind != "file-header") {
          if (row.newRowEqualsOldRow && row.oldRowVisible && row.newRowVisible) {
            label = RNDiffAccessibleLineDescription(row.oldRow, @"");
          } else {
            NSMutableArray<NSString *> *descriptions = [NSMutableArray new];
            if (row.oldRowVisible) {
              NSString *oldDescription = RNDiffAccessibleLineDescription(row.oldRow, @"Old side");
              if (oldDescription.length > 0) {
                [descriptions addObject:oldDescription];
              }
            }
            if (row.newRowVisible) {
              NSString *newDescription = RNDiffAccessibleLineDescription(row.newRow, @"New side");
              if (newDescription.length > 0) {
                [descriptions addObject:newDescription];
              }
            }
            label = [descriptions componentsJoinedByString:@". "];
          }
        }
      } else {
        const auto row = document->getRow(self.rowIndex);
        label = RNDiffAccessibleLineDescription(row.plain, @"");
      }
    }
  }
  return label;
}

- (BOOL)isAccessibilityElement
{
  return [self diffAccessibilityLabel].length > 0;
}

- (NSString *)accessibilityRole
{
  return NSAccessibilityStaticTextRole;
}

- (NSString *)accessibilityLabel
{
  return [self diffAccessibilityLabel];
}

- (BOOL)acceptsFirstResponder
{
  return YES;
}

- (void)resetCursorRects
{
  [super resetCursorRects];
  [self addCursorRect:self.bounds cursor:NSCursor.IBeamCursor];
}

- (NSString *)selectableTextForRowIndex:(double)rowIndex
                                    side:(NSInteger)side
                                document:(HybridDiffDocument *)document
                                  config:(RNDiffNativeRowRenderConfig *)config
{
  NSString *text = nil;
  if ([config.presentation isEqualToString:@"blocks"]) {
    const auto row = document->getPlainSideBySideRow(rowIndex, [config collapsedFileIndexes]);
    if (side == 0 && row.oldRowVisible && row.oldRow.kind == diffRowKindLine) {
      text = RNDiffStringFromStdString(row.oldRow.text);
    } else if (side == 1 && row.newRowVisible) {
      const DiffRenderRow &newRow = row.newRowEqualsOldRow ? row.oldRow : row.newRow;
      if (newRow.kind == diffRowKindLine) {
        text = RNDiffStringFromStdString(newRow.text);
      }
    }
  } else {
    const auto row = document->getRow(rowIndex);
    if (row.plain.kind == diffRowKindLine) {
      text = RNDiffStringFromStdString(row.plain.text);
    }
  }
  return text;
}

- (NSString *)selectableTextForSide:(NSInteger)side
                            document:(HybridDiffDocument *)document
                              config:(RNDiffNativeRowRenderConfig *)config
{
  return [self selectableTextForRowIndex:self.rowIndex side:side document:document config:config];
}

- (NSUInteger)textColumnForPoint:(NSPoint)point
                             side:(NSInteger)side
                             text:(NSString *)text
                           config:(RNDiffNativeRowRenderConfig *)config
{
  CGFloat textX = config.changeBarWidth + config.lineNumberWidth * 2 + config.markerWidth;
  if ([config.presentation isEqualToString:@"blocks"]) {
    const CGFloat columnWidth = floor(self.bounds.size.width / 2.0);
    textX = (side == 0 ? 0 : columnWidth) + config.lineNumberWidth + config.markerWidth;
  }
  const CGFloat relativeX = point.x - textX + config.horizontalOffset;
  NSUInteger column = 0;
  if (relativeX > 0 && text.length > 0) {
    NSAttributedString *attributedText = [[NSAttributedString alloc] initWithString:text
                                                                         attributes:config.baseTextAttributes];
    CTLineRef line = CTLineCreateWithAttributedString((__bridge CFAttributedStringRef)attributedText);
    const CFIndex stringIndex = CTLineGetStringIndexForPosition(line, CGPointMake(relativeX, 0));
    const double lineWidth = CTLineGetTypographicBounds(line, nullptr, nullptr, nullptr);
    if (stringIndex != kCFNotFound) {
      column = MIN(static_cast<NSUInteger>(stringIndex), text.length);
    } else if (relativeX >= lineWidth) {
      column = text.length;
    }
    CFRelease(line);
  }
  return column;
}

- (RNDiffNativeRowContentView *)nearestRowViewForWindowPoint:(NSPoint)windowPoint
{
  RNDiffNativeRowContentView *nearestView = self;
  CGFloat nearestDistance = CGFLOAT_MAX;
  for (NSView *view in RNDiffNativeRowViewRegistry()[self.configId]) {
    if (![view isKindOfClass:RNDiffNativeRowContentView.class]) {
      continue;
    }
    RNDiffNativeRowContentView *rowView = (RNDiffNativeRowContentView *)view;
    const NSRect windowRect = [rowView convertRect:rowView.bounds toView:nil];
    CGFloat distance = 0;
    if (windowPoint.y < NSMinY(windowRect)) {
      distance = NSMinY(windowRect) - windowPoint.y;
    } else if (windowPoint.y > NSMaxY(windowRect)) {
      distance = windowPoint.y - NSMaxY(windowRect);
    }
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearestView = rowView;
      if (distance == 0 && NSPointInRect(windowPoint, windowRect)) {
        break;
      }
    }
  }
  return nearestView;
}

- (NSRange)wordRangeAtColumn:(NSUInteger)column text:(NSString *)text
{
  if (text.length == 0) {
    return NSMakeRange(0, 0);
  }

  const NSUInteger characterIndex = MIN(column, text.length - 1);
  __block NSRange wordRange = NSMakeRange(NSNotFound, 0);
  [text enumerateSubstringsInRange:NSMakeRange(0, text.length)
                           options:NSStringEnumerationByWords | NSStringEnumerationSubstringNotRequired
                        usingBlock:^(__unused NSString *substring, NSRange substringRange, __unused NSRange enclosingRange, BOOL *stop) {
    if (NSLocationInRange(characterIndex, substringRange)) {
      wordRange = substringRange;
      *stop = YES;
    }
  }];
  if (wordRange.location == NSNotFound) {
    wordRange = [text rangeOfComposedCharacterSequenceAtIndex:characterIndex];
  }
  return wordRange;
}

- (void)mouseDown:(NSEvent *)event
{
  RNDiffNativeRowRenderConfig *config = RNDiffNativeRowConfigForId(self.configId);
  auto document = config ? getRegisteredDiffDocument(config.documentId) : nullptr;
  const NSPoint point = [self convertPoint:event.locationInWindow fromView:nil];
  const NSInteger side = config && [config.presentation isEqualToString:@"blocks"] && point.x >= floor(self.bounds.size.width / 2.0)
    ? 1
    : 0;
  NSString *text = document ? [self selectableTextForSide:side document:document.get() config:config] : nil;

  if (config && document && text != nil) {
    [self.window makeFirstResponder:self];
    const NSUInteger column = [self textColumnForPoint:point side:side text:text config:config];
    if (event.clickCount >= 3) {
      [config setSelectionAnchorRowIndex:self.rowIndex
                            anchorColumn:0
                           focusRowIndex:self.rowIndex
                             focusColumn:text.length
                                    side:side];
    } else if (event.clickCount == 2) {
      const NSRange wordRange = [self wordRangeAtColumn:column text:text];
      [config setSelectionAnchorRowIndex:self.rowIndex
                            anchorColumn:wordRange.location
                           focusRowIndex:self.rowIndex
                             focusColumn:NSMaxRange(wordRange)
                                    side:side];
    } else {
      [config setSelectionAnchorRowIndex:self.rowIndex
                            anchorColumn:column
                           focusRowIndex:self.rowIndex
                             focusColumn:column
                                    side:side];
    }

    BOOL tracking = YES;
    while (tracking) {
      NSEvent *nextEvent = [self.window nextEventMatchingMask:NSEventMaskLeftMouseDragged | NSEventMaskLeftMouseUp
                                                    untilDate:NSDate.distantFuture
                                                       inMode:NSEventTrackingRunLoopMode
                                                      dequeue:YES];
      if (nextEvent.type == NSEventTypeLeftMouseDragged) {
        [self autoscroll:nextEvent];
        RNDiffNativeRowContentView *targetView = [self nearestRowViewForWindowPoint:nextEvent.locationInWindow];
        NSPoint targetPoint = [targetView convertPoint:nextEvent.locationInWindow fromView:nil];
        NSString *targetText = [targetView selectableTextForSide:side document:document.get() config:config];
        if (targetText != nil) {
          const NSUInteger targetColumn = [targetView textColumnForPoint:targetPoint side:side text:targetText config:config];
          [config setSelectionFocusRowIndex:targetView.rowIndex focusColumn:targetColumn];
        }
      } else {
        tracking = NO;
      }
    }
  } else {
    [super mouseDown:event];
  }
}

- (NSString *)selectedTextForDocument:(HybridDiffDocument *)document
                               config:(RNDiffNativeRowRenderConfig *)config
{
  if (!config.hasSelection) {
    return @"";
  }

  double startRow = config.selectionAnchorRowIndex;
  NSUInteger startColumn = config.selectionAnchorColumn;
  double endRow = config.selectionFocusRowIndex;
  NSUInteger endColumn = config.selectionFocusColumn;
  if (startRow > endRow || (startRow == endRow && startColumn > endColumn)) {
    std::swap(startRow, endRow);
    std::swap(startColumn, endColumn);
  }

  NSMutableArray<NSString *> *lines = [NSMutableArray new];
  for (double rowIndex = startRow; rowIndex <= endRow; rowIndex += 1) {
    NSString *line = [self selectableTextForRowIndex:rowIndex
                                                side:config.selectionSide
                                            document:document
                                              config:config];
    if (line != nil) {
      const NSRange range = [config selectionRangeForRowIndex:rowIndex
                                                        side:config.selectionSide
                                                  textLength:line.length];
      if (range.location != NSNotFound) {
        [lines addObject:[line substringWithRange:range]];
      }
    }
  }
  return [lines componentsJoinedByString:@"\n"];
}

- (void)copy:(id)sender
{
  RNDiffNativeRowRenderConfig *config = RNDiffNativeRowConfigForId(self.configId);
  auto document = config ? getRegisteredDiffDocument(config.documentId) : nullptr;
  NSString *selectedText = document ? [self selectedTextForDocument:document.get() config:config] : @"";
  if (selectedText.length > 0) {
    NSPasteboard *pasteboard = NSPasteboard.generalPasteboard;
    [pasteboard clearContents];
    [pasteboard setString:selectedText forType:NSPasteboardTypeString];
  }
}

- (void)selectAll:(id)sender
{
  RNDiffNativeRowRenderConfig *config = RNDiffNativeRowConfigForId(self.configId);
  auto document = config ? getRegisteredDiffDocument(config.documentId) : nullptr;
  if (config && document) {
    const double rowCount = [config.presentation isEqualToString:@"blocks"]
      ? document->getSideBySideRowCount([config collapsedFileIndexes])
      : document->getRowCount();
    if (rowCount > 0) {
      [config setSelectionAnchorRowIndex:0
                            anchorColumn:0
                           focusRowIndex:rowCount - 1
                             focusColumn:NSUIntegerMax
                                    side:config.selectionSide];
    }
  }
}

- (BOOL)validateUserInterfaceItem:(id<NSValidatedUserInterfaceItem>)item
{
  if (item.action == @selector(copy:)) {
    RNDiffNativeRowRenderConfig *config = RNDiffNativeRowConfigForId(self.configId);
    return config.hasSelection
      && (config.selectionAnchorRowIndex != config.selectionFocusRowIndex
          || config.selectionAnchorColumn != config.selectionFocusColumn);
  }
  return YES;
}

- (void)scrollWheel:(NSEvent *)event
{
  if (!RNDiffHandleHorizontalScroll(self.configId, event)) {
    [super scrollWheel:event];
  }
}

- (void)setConfigId:(NSString *)configId
{
  NSString *nextConfigId = configId ?: @"";
  if ([_configId isEqualToString:nextConfigId]) {
    return;
  }
  RNDiffNativeRowUnregisterView(_configId, self);
  _configId = [nextConfigId copy];
  RNDiffNativeRowRegisterView(_configId, self);
  [self setNeedsDisplay:YES];
}

- (void)dealloc
{
  [_attributedTextScratch.mutableString setString:@""];
  RNDiffNativeRowUnregisterView(_configId, self);
}

- (void)applyEncodedHighlights:(NSString *)encodedHighlights
              toAttributedText:(NSMutableAttributedString *)attributedText
                          color:(NSColor *)color
{
  if (encodedHighlights.length == 0 || attributedText.length == 0) {
    return;
  }

  for (NSString *encodedHighlight in [encodedHighlights componentsSeparatedByString:@";"]) {
    if (encodedHighlight.length == 0) {
      continue;
    }
    NSArray<NSString *> *parts = [encodedHighlight componentsSeparatedByString:@","];
    if (parts.count < 2) {
      continue;
    }
    const NSInteger locationValue = parts[0].integerValue;
    const NSInteger lengthValue = parts[1].integerValue;
    if (locationValue < 0 || lengthValue <= 0 || locationValue >= attributedText.length) {
      continue;
    }
    const NSUInteger location = static_cast<NSUInteger>(locationValue);
    const NSUInteger length = MIN(static_cast<NSUInteger>(lengthValue), attributedText.length - location);
    [attributedText addAttribute:NSBackgroundColorAttributeName
                           value:color
                           range:NSMakeRange(location, length)];
  }
}

- (NSMutableAttributedString *)attributedTextForRow:(const DiffRenderRow &)plain
                                             tokens:(const std::vector<DiffSyntaxTokenRun> *)tokens
                                           document:(HybridDiffDocument *)document
                                             config:(RNDiffNativeRowRenderConfig *)config
                                         highlights:(NSString *)highlights
                                   activeHighlights:(NSString *)activeHighlights
                                  selectionRowIndex:(double)selectionRowIndex
                                      selectionSide:(NSInteger)selectionSide
{
  NSString *text = RNDiffStringFromStdString(plain.text);
  NSMutableAttributedString *attributedText = self.attributedTextScratch;
  [[attributedText mutableString] setString:text];
  if (attributedText.length > 0) {
    [attributedText setAttributes:config.baseTextAttributes range:NSMakeRange(0, attributedText.length)];
    NSColor *inlineHighlightColor = plain.changeType == diffChangeTypeAdd
      ? config.addInlineHighlightColor
      : plain.changeType == diffChangeTypeRemove
        ? config.removeInlineHighlightColor
        : nil;
    if (inlineHighlightColor != nil) {
      NSArray<NSValue *> *inlineRanges = [config inlineHighlightRangesForRow:plain document:document];
      for (NSValue *rangeValue in inlineRanges) {
        const NSRange range = rangeValue.rangeValue;
        if (range.location < attributedText.length && range.length > 0) {
          [attributedText addAttribute:NSBackgroundColorAttributeName
                                 value:inlineHighlightColor
                                 range:NSMakeRange(range.location, MIN(range.length, attributedText.length - range.location))];
        }
      }
    }
    [self applyEncodedHighlights:highlights toAttributedText:attributedText color:config.searchHighlightColor];
    [self applyEncodedHighlights:activeHighlights toAttributedText:attributedText color:config.activeSearchHighlightColor];
  }

  if (tokens != nullptr) {
    for (const auto &token : *tokens) {
      NSColor *tokenColor = [config colorForScopeId:token.scopeId document:document];
      if (tokenColor != nil) {
        const NSUInteger location = static_cast<NSUInteger>(MAX(0, token.startColumn));
        const NSUInteger length = static_cast<NSUInteger>(MAX(0, token.length));
        if (location < attributedText.length) {
          [attributedText addAttribute:NSForegroundColorAttributeName
                                 value:tokenColor
                                 range:NSMakeRange(location, MIN(length, attributedText.length - location))];
        }
      }
    }
  }

  const NSRange selectionRange = [config selectionRangeForRowIndex:selectionRowIndex
                                                              side:selectionSide
                                                        textLength:attributedText.length];
  if (selectionRange.location != NSNotFound && selectionRange.length > 0) {
    [attributedText addAttribute:NSBackgroundColorAttributeName
                           value:NSColor.selectedTextBackgroundColor
                           range:selectionRange];
    [attributedText addAttribute:NSForegroundColorAttributeName
                           value:NSColor.selectedTextColor
                           range:selectionRange];
  }

  return attributedText;
}

- (void)drawUnifiedDocument:(HybridDiffDocument *)document
                     config:(RNDiffNativeRowRenderConfig *)config
{
  const auto row = document->getRow(self.rowIndex);
  const auto plain = row.plain;
  if (plain.kind != diffRowKindLine) {
    return;
  }

  const BOOL isAdd = plain.changeType == diffChangeTypeAdd;
  const BOOL isRemove = plain.changeType == diffChangeTypeRemove;
  const BOOL lightRender = [self.adaptiveRender isEqualToString:@"light"];
  NSColor *accentColor = isAdd ? config.addAccentColor : isRemove ? config.removeAccentColor : NSColor.clearColor;
  NSColor *backgroundColor = isAdd ? config.addBackgroundColor : isRemove ? config.removeBackgroundColor : NSColor.clearColor;
  NSString *searchHighlights = [config searchHighlightsForRowIndex:self.rowIndex active:NO];
  NSString *activeSearchHighlights = [config searchHighlightsForRowIndex:self.rowIndex active:YES];

  [backgroundColor setFill];
  NSRectFill(self.bounds);
  if (activeSearchHighlights.length > 0) {
    [config.activeSearchRowHighlightColor setFill];
    NSRectFillUsingOperation(self.bounds, NSCompositingOperationSourceOver);
  }
  [accentColor setFill];
  NSRectFill(NSMakeRect(0, 0, config.changeBarWidth, self.bounds.size.height));

  const CGFloat textY = MAX(0, (config.rowHeight - config.font.ascender + config.font.descender) / 2.0);
  if (!lightRender) {
    NSDictionary *lineNumberAttributes = [config lineNumberAttributesForChangeType:plain.changeType];
    NSDictionary *markerAttributes = [config markerAttributesForChangeType:plain.changeType];

    if (plain.oldLineNumber >= 0) {
      NSString *oldLineNumber = [NSString stringWithFormat:@"%.0f", plain.oldLineNumber];
      [oldLineNumber drawInRect:NSMakeRect(config.changeBarWidth, textY, config.lineNumberWidth - 4, config.rowHeight)
                 withAttributes:lineNumberAttributes];
    }
    if (plain.newLineNumber >= 0) {
      NSString *newLineNumber = [NSString stringWithFormat:@"%.0f", plain.newLineNumber];
      [newLineNumber drawInRect:NSMakeRect(config.changeBarWidth + config.lineNumberWidth, textY, config.lineNumberWidth - 4, config.rowHeight)
                 withAttributes:lineNumberAttributes];
    }

    NSString *marker = isAdd ? @"+" : isRemove ? @"-" : @" ";
    [marker drawInRect:NSMakeRect(config.changeBarWidth + config.lineNumberWidth * 2, textY, config.markerWidth, config.rowHeight)
        withAttributes:markerAttributes];
  }

  const std::vector<DiffSyntaxTokenRun> *tokens = nullptr;
  if (!lightRender
      && config.syntaxHighlightingEnabled
      && row.tokens.has_value()
      && std::holds_alternative<std::vector<DiffSyntaxTokenRun>>(*row.tokens)) {
    tokens = &std::get<std::vector<DiffSyntaxTokenRun>>(*row.tokens);
  }
  NSMutableAttributedString *attributedText = [self attributedTextForRow:plain
                                                                  tokens:tokens
                                                                document:document
                                                                  config:config
                                                              highlights:searchHighlights
                                                        activeHighlights:activeSearchHighlights
                                                       selectionRowIndex:self.rowIndex
                                                           selectionSide:0];

  const CGFloat textX = config.changeBarWidth + config.lineNumberWidth * 2 + config.markerWidth;
  RNDiffDrawHorizontalText(
    attributedText,
    NSMakeRect(textX, 0, MAX(0, self.bounds.size.width - textX - diffSideBySideHorizontalPadding), config.rowHeight),
    textY,
    config
  );
}

- (void)drawSideBySidePlainRow:(const DiffRenderRow &)plain
                    rowVisible:(BOOL)rowVisible
                       oldSide:(BOOL)oldSide
                    columnRect:(NSRect)columnRect
                      document:(HybridDiffDocument *)document
                         config:(RNDiffNativeRowRenderConfig *)config
                     highlights:(NSString *)highlights
               activeHighlights:(NSString *)activeHighlights
{
  if (!rowVisible || plain.kind != diffRowKindLine) {
    return;
  }

  const BOOL isAdd = plain.changeType == diffChangeTypeAdd;
  const BOOL isRemove = plain.changeType == diffChangeTypeRemove;
  const BOOL lightRender = [self.adaptiveRender isEqualToString:@"light"];
  NSColor *backgroundColor = isAdd ? config.addBackgroundColor : isRemove ? config.removeBackgroundColor : NSColor.clearColor;

  [backgroundColor setFill];
  NSRectFill(columnRect);
  if (activeHighlights.length > 0) {
    [config.activeSearchRowHighlightColor setFill];
    NSRectFillUsingOperation(columnRect, NSCompositingOperationSourceOver);
  }

  const CGFloat textY = MAX(0, (config.rowHeight - config.font.ascender + config.font.descender) / 2.0);
  if (!lightRender) {
    NSDictionary *lineNumberAttributes = [config lineNumberAttributesForChangeType:plain.changeType];
    const double markerChangeType = oldSide && isRemove
      ? diffChangeTypeRemove
      : !oldSide && isAdd
        ? diffChangeTypeAdd
        : 0;
    NSDictionary *markerAttributes = [config markerAttributesForChangeType:markerChangeType];

    const double lineNumber = oldSide ? plain.oldLineNumber : plain.newLineNumber;
    if (lineNumber >= 0) {
      NSString *lineNumberText = [NSString stringWithFormat:@"%.0f", lineNumber];
      [lineNumberText drawInRect:NSMakeRect(columnRect.origin.x, textY, config.lineNumberWidth - 4, config.rowHeight)
                  withAttributes:lineNumberAttributes];
    }

    NSString *marker = oldSide && isRemove ? @"-" : !oldSide && isAdd ? @"+" : @" ";
    [marker drawInRect:NSMakeRect(columnRect.origin.x + config.lineNumberWidth, textY, config.markerWidth, config.rowHeight)
        withAttributes:markerAttributes];
  }

  const std::vector<DiffSyntaxTokenRun> *tokens = nullptr;
  if (!lightRender
      && config.syntaxHighlightingEnabled
      && !plain.tokens.empty()) {
    tokens = &plain.tokens;
  }
  NSMutableAttributedString *attributedText = [self attributedTextForRow:plain
                                                                  tokens:tokens
                                                                document:document
                                                                  config:config
                                                              highlights:highlights
                                                        activeHighlights:activeHighlights
                                                       selectionRowIndex:self.rowIndex
                                                           selectionSide:oldSide ? 0 : 1];
  const CGFloat textX = columnRect.origin.x + config.lineNumberWidth + config.markerWidth;
  RNDiffDrawHorizontalText(
    attributedText,
    NSMakeRect(textX, columnRect.origin.y, MAX(0, NSMaxX(columnRect) - textX - diffSideBySideHorizontalPadding), config.rowHeight),
    textY,
    config
  );
}

- (void)drawSideBySideDocument:(HybridDiffDocument *)document
                         config:(RNDiffNativeRowRenderConfig *)config
{
  const auto row = document->getPlainSideBySideRow(self.rowIndex, [config collapsedFileIndexes]);
  if (row.kind == "file-header") {
    return;
  }

  const CGFloat width = self.bounds.size.width;
  const CGFloat leftWidth = floor(width / 2.0);
  const CGFloat rightWidth = MAX(0, width - leftWidth);
  NSRect leftRect = NSMakeRect(0, 0, leftWidth, self.bounds.size.height);
  NSRect rightRect = NSMakeRect(leftWidth, 0, rightWidth, self.bounds.size.height);
  const double oldRowIndex = row.oldRowVisible ? row.oldRow.index : -1;
  const DiffRenderRow &newRow = row.newRowEqualsOldRow ? row.oldRow : row.newRow;
  const double newRowIndex = row.newRowVisible ? newRow.index : -1;

  [self drawSideBySidePlainRow:row.oldRow
                    rowVisible:row.oldRowVisible
                       oldSide:YES
                    columnRect:leftRect
                      document:document
                         config:config
                     highlights:[config searchHighlightsForRowIndex:oldRowIndex active:NO]
               activeHighlights:[config searchHighlightsForRowIndex:oldRowIndex active:YES]];
  [self drawSideBySidePlainRow:newRow
                    rowVisible:row.newRowVisible
                       oldSide:NO
                    columnRect:rightRect
                      document:document
                         config:config
                     highlights:[config searchHighlightsForRowIndex:newRowIndex active:NO]
               activeHighlights:[config searchHighlightsForRowIndex:newRowIndex active:YES]];

  [config.dividerColor setFill];
  NSRectFill(NSMakeRect(leftWidth, 0, 1, self.bounds.size.height));
}

- (void)drawRect:(NSRect)dirtyRect
{
  [super drawRect:dirtyRect];

  RNDiffNativeRowRenderConfig *config = RNDiffNativeRowConfigForId(self.configId);
  if (!config) {
    return;
  }
  auto document = getRegisteredDiffDocument(config.documentId);
  if (!document) {
    return;
  }
  if ([config.presentation isEqualToString:@"blocks"]) {
    [self drawSideBySideDocument:document.get() config:config];
  } else {
    [self drawUnifiedDocument:document.get() config:config];
  }
}

@end

@interface RNDiffMergeNativePaneContentView : NSView
@property(nonatomic, assign) double configVersion;
@property(nonatomic, copy) NSString *fontFamily;
@property(nonatomic, assign) double fontSize;
@property(nonatomic, strong) NSColor *foregroundColor;
@property(nonatomic, copy) NSString *horizontalConfigId;
@property(nonatomic, strong) NSColor *inlineHighlightColor;
@property(nonatomic, copy) NSString *inlineHighlights;
@property(nonatomic, assign) double lineNumber;
@property(nonatomic, assign) double lineNumberWidth;
@property(nonatomic, strong) NSColor *mutedColor;
@property(nonatomic, assign) double rowHeight;
@property(nonatomic, copy) NSString *text;
@property(nonatomic, copy) NSString *tokens;
@property(nonatomic, strong) NSMutableAttributedString *attributedTextScratch;
@property(nonatomic, strong) NSMutableParagraphStyle *textParagraph;
@property(nonatomic, strong) NSMutableParagraphStyle *rightParagraph;
@end

@implementation RNDiffMergeNativePaneContentView

- (instancetype)init
{
  if (self = [super initWithFrame:NSZeroRect]) {
    _fontFamily = @"Menlo";
    _fontSize = 13;
    _foregroundColor = NSColor.labelColor;
    _horizontalConfigId = @"";
    _inlineHighlightColor = [NSColor colorWithRed:0.75 green:0.53 blue:0 alpha:0.3];
    _inlineHighlights = @"";
    _lineNumber = -1;
    _lineNumberWidth = 40;
    _mutedColor = NSColor.secondaryLabelColor;
    _rowHeight = 22;
    _text = @"";
    _tokens = @"";
    _attributedTextScratch = [[NSMutableAttributedString alloc] initWithString:@""];
    _textParagraph = [NSMutableParagraphStyle new];
    _textParagraph.lineBreakMode = NSLineBreakByClipping;
    _rightParagraph = [NSMutableParagraphStyle new];
    _rightParagraph.alignment = NSTextAlignmentRight;
  }
  return self;
}

- (void)dealloc
{
  [_attributedTextScratch.mutableString setString:@""];
  RNDiffNativeRowUnregisterView(_horizontalConfigId, self);
}

- (BOOL)isFlipped
{
  return YES;
}

- (void)setHorizontalConfigId:(NSString *)horizontalConfigId
{
  NSString *nextConfigId = horizontalConfigId ?: @"";
  if ([_horizontalConfigId isEqualToString:nextConfigId]) {
    return;
  }
  RNDiffNativeRowUnregisterView(_horizontalConfigId, self);
  _horizontalConfigId = [nextConfigId copy];
  RNDiffNativeRowRegisterView(_horizontalConfigId, self);
  [self setNeedsDisplay:YES];
}

- (void)scrollWheel:(NSEvent *)event
{
  if (!RNDiffHandleHorizontalScroll(self.horizontalConfigId, event)) {
    [super scrollWheel:event];
  }
}

- (NSFont *)baseFont
{
  NSFont *font = [NSFont fontWithName:self.fontFamily size:self.fontSize];
  return font ?: [NSFont monospacedSystemFontOfSize:self.fontSize weight:NSFontWeightRegular];
}

- (NSFont *)fontWithBaseFont:(NSFont *)baseFont style:(NSInteger)fontStyle
{
  NSFont *font = baseFont;
  NSFontManager *fontManager = [NSFontManager sharedFontManager];
  if (fontStyle == 1 || fontStyle == 3) {
    font = [fontManager convertFont:font toHaveTrait:NSItalicFontMask] ?: font;
  }
  if (fontStyle == 2 || fontStyle == 3) {
    font = [fontManager convertFont:font toHaveTrait:NSBoldFontMask] ?: font;
  }
  return font;
}

- (void)applyEncodedInlineHighlightsToAttributedText:(NSMutableAttributedString *)attributedText
{
  if (self.inlineHighlights.length == 0 || attributedText.length == 0) {
    return;
  }

  for (NSString *encodedHighlight in [self.inlineHighlights componentsSeparatedByString:@";"]) {
    if (encodedHighlight.length == 0) {
      continue;
    }
    NSArray<NSString *> *parts = [encodedHighlight componentsSeparatedByString:@","];
    if (parts.count < 2) {
      continue;
    }
    const NSInteger locationValue = parts[0].integerValue;
    const NSInteger lengthValue = parts[1].integerValue;
    if (locationValue < 0 || lengthValue <= 0 || locationValue >= attributedText.length) {
      continue;
    }
    const NSUInteger location = static_cast<NSUInteger>(locationValue);
    const NSUInteger length = MIN(static_cast<NSUInteger>(lengthValue), attributedText.length - location);
    [attributedText addAttribute:NSBackgroundColorAttributeName
                           value:self.inlineHighlightColor
                           range:NSMakeRange(location, length)];
  }
}

- (void)applyEncodedTokensToAttributedText:(NSMutableAttributedString *)attributedText baseFont:(NSFont *)baseFont
{
  if (self.tokens.length == 0 || attributedText.length == 0) {
    return;
  }

  for (NSString *encodedToken in [self.tokens componentsSeparatedByString:@";"]) {
    if (encodedToken.length == 0) {
      continue;
    }
    NSArray<NSString *> *parts = [encodedToken componentsSeparatedByString:@","];
    if (parts.count < 4) {
      continue;
    }
    const NSInteger locationValue = parts[0].integerValue;
    const NSInteger lengthValue = parts[1].integerValue;
    const NSInteger fontStyle = parts[3].integerValue;
    if (locationValue < 0 || lengthValue <= 0 || locationValue >= attributedText.length) {
      continue;
    }
    const NSUInteger location = static_cast<NSUInteger>(locationValue);
    const NSUInteger length = MIN(static_cast<NSUInteger>(lengthValue), attributedText.length - location);
    NSColor *tokenColor = RNDiffColorFromString(parts[2], self.foregroundColor);
    [attributedText addAttribute:NSForegroundColorAttributeName
                           value:tokenColor
                           range:NSMakeRange(location, length)];
    NSFont *tokenFont = fontStyle == 0 ? baseFont : [self fontWithBaseFont:baseFont style:fontStyle];
    [attributedText addAttribute:NSFontAttributeName
                           value:tokenFont
                           range:NSMakeRange(location, length)];
  }
}

- (void)drawRect:(NSRect)dirtyRect
{
  [super drawRect:dirtyRect];

  NSFont *baseFont = [self baseFont];
  const CGFloat spaceWidth = [@" " sizeWithAttributes:@{NSFontAttributeName: baseFont}].width;
  self.textParagraph.defaultTabInterval = MAX(1, spaceWidth * 4);
  self.textParagraph.tabStops = @[];
  const CGFloat textY = MAX(0, (self.rowHeight - baseFont.ascender + baseFont.descender) / 2.0);
  NSDictionary *lineNumberAttributes = @{
    NSFontAttributeName: baseFont,
    NSForegroundColorAttributeName: self.mutedColor,
    NSParagraphStyleAttributeName: self.rightParagraph,
  };
  if (self.lineNumber >= 0) {
    NSString *lineNumberText = [NSString stringWithFormat:@"%.0f", self.lineNumber];
    [lineNumberText drawInRect:NSMakeRect(0, textY, MAX(0, self.lineNumberWidth - 4), self.rowHeight)
                withAttributes:lineNumberAttributes];
  }

  NSMutableAttributedString *attributedText = self.attributedTextScratch;
  [[attributedText mutableString] setString:self.text ?: @""];
  if (attributedText.length > 0) {
    [attributedText setAttributes:@{
      NSFontAttributeName: baseFont,
      NSForegroundColorAttributeName: self.foregroundColor,
      NSParagraphStyleAttributeName: self.textParagraph,
    } range:NSMakeRange(0, attributedText.length)];
    [self applyEncodedInlineHighlightsToAttributedText:attributedText];
    [self applyEncodedTokensToAttributedText:attributedText baseFont:baseFont];
  }

  const CGFloat textX = self.lineNumberWidth;
  RNDiffNativeRowRenderConfig *config = RNDiffNativeRowConfigForId(self.horizontalConfigId);
  if (config) {
    RNDiffDrawHorizontalText(
      attributedText,
      NSMakeRect(textX, 0, MAX(0, self.bounds.size.width - textX - diffSideBySideHorizontalPadding), self.rowHeight),
      textY,
      config
    );
  } else {
    [attributedText drawAtPoint:NSMakePoint(textX, textY)];
  }
}

@end
#endif

@interface RNDiffMergeNativePane () <RCTDiffMergeNativePaneViewProtocol>
@end

@implementation RNDiffMergeNativePane {
#if TARGET_OS_OSX
  RNDiffMergeNativePaneContentView *_contentView;
#endif
}

- (instancetype)init
{
  if (self = [super init]) {
    _props = std::make_shared<const DiffMergeNativePaneProps>();
#if TARGET_OS_OSX
    _contentView = [RNDiffMergeNativePaneContentView new];
    _contentView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    [self addSubview:_contentView];
#endif
  }
  return self;
}

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps
{
  const auto &newProps = *std::static_pointer_cast<DiffMergeNativePaneProps const>(props);
#if TARGET_OS_OSX
  _contentView.configVersion = newProps.configVersion;
  _contentView.fontFamily = [NSString stringWithUTF8String:newProps.fontFamily.c_str()] ?: @"Menlo";
  _contentView.fontSize = newProps.fontSize;
  _contentView.foregroundColor = RNDiffColorFromString([NSString stringWithUTF8String:newProps.foregroundColor.c_str()] ?: @"", NSColor.labelColor);
  _contentView.horizontalConfigId = [NSString stringWithUTF8String:newProps.horizontalConfigId.c_str()] ?: @"";
  _contentView.inlineHighlightColor = RNDiffColorFromString([NSString stringWithUTF8String:newProps.inlineHighlightColor.c_str()] ?: @"", [NSColor colorWithRed:0.75 green:0.53 blue:0 alpha:0.3]);
  _contentView.inlineHighlights = [NSString stringWithUTF8String:newProps.inlineHighlights.c_str()] ?: @"";
  _contentView.lineNumber = newProps.lineNumber;
  _contentView.lineNumberWidth = newProps.lineNumberWidth;
  _contentView.mutedColor = RNDiffColorFromString([NSString stringWithUTF8String:newProps.mutedColor.c_str()] ?: @"", NSColor.secondaryLabelColor);
  _contentView.rowHeight = newProps.rowHeight;
  _contentView.text = [NSString stringWithUTF8String:newProps.text.c_str()] ?: @"";
  _contentView.tokens = [NSString stringWithUTF8String:newProps.tokens.c_str()] ?: @"";
  [_contentView setNeedsDisplay:YES];
#endif
  [super updateProps:props oldProps:oldProps];
}

- (void)prepareForRecycle
{
  [super prepareForRecycle];
#if TARGET_OS_OSX
  _contentView.configVersion = 0;
  _contentView.horizontalConfigId = @"";
  _contentView.inlineHighlights = @"";
  _contentView.lineNumber = -1;
  _contentView.text = @"";
  _contentView.tokens = @"";
  [_contentView.attributedTextScratch.mutableString setString:@""];
  [_contentView setNeedsDisplay:YES];
#endif
}

- (void)layoutSubviews
{
  [super layoutSubviews];
#if TARGET_OS_OSX
  _contentView.frame = self.bounds;
#endif
}

- (void)updateLayoutMetrics:(const LayoutMetrics &)layoutMetrics
           oldLayoutMetrics:(const LayoutMetrics &)oldLayoutMetrics
{
  [super updateLayoutMetrics:layoutMetrics oldLayoutMetrics:oldLayoutMetrics];
  [self layoutSubviews];
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<DiffMergeNativePaneComponentDescriptor>();
}

@end

@interface RNDiffHorizontalScroller () <RCTDiffHorizontalScrollerViewProtocol>
@end

@implementation RNDiffHorizontalScroller {
#if TARGET_OS_OSX
  RNDiffHorizontalScrollerContentView *_contentView;
#endif
}

- (instancetype)init
{
  if (self = [super init]) {
    _props = std::make_shared<const DiffHorizontalScrollerProps>();
#if TARGET_OS_OSX
    _contentView = [RNDiffHorizontalScrollerContentView new];
    _contentView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    [self addSubview:_contentView];
#endif
  }
  return self;
}

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps
{
  const auto &newProps = *std::static_pointer_cast<DiffHorizontalScrollerProps const>(props);
#if TARGET_OS_OSX
  _contentView.configId = [NSString stringWithUTF8String:newProps.configId.c_str()] ?: @"";
#endif
  [super updateProps:props oldProps:oldProps];
}

- (void)prepareForRecycle
{
  [super prepareForRecycle];
#if TARGET_OS_OSX
  _contentView.configId = @"";
#endif
}

- (void)layoutSubviews
{
  [super layoutSubviews];
#if TARGET_OS_OSX
  _contentView.frame = self.bounds;
#endif
}

- (void)updateLayoutMetrics:(const LayoutMetrics &)layoutMetrics
           oldLayoutMetrics:(const LayoutMetrics &)oldLayoutMetrics
{
  [super updateLayoutMetrics:layoutMetrics oldLayoutMetrics:oldLayoutMetrics];
  [self layoutSubviews];
}

#if TARGET_OS_OSX
- (NSView *)hitTest:(NSPoint)point
{
  return _contentView.scrollEnabled ? [super hitTest:point] : nil;
}
#endif

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<DiffHorizontalScrollerComponentDescriptor>();
}

@end

@interface RNDiffNativeRowConfig () <RCTDiffNativeRowConfigViewProtocol>
@end

@implementation RNDiffNativeRowConfig {
#if TARGET_OS_OSX
  NSString *_configId;
#endif
}

- (instancetype)init
{
  if (self = [super init]) {
    _props = std::make_shared<const DiffNativeRowConfigProps>();
  }
  return self;
}

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps
{
  const auto &newProps = *std::static_pointer_cast<DiffNativeRowConfigProps const>(props);
#if TARGET_OS_OSX
  NSString *nextConfigId = [NSString stringWithUTF8String:newProps.configId.c_str()] ?: @"";
  if (_configId.length > 0 && ![_configId isEqualToString:nextConfigId]) {
    [RNDiffNativeRowConfigRegistry() removeObjectForKey:_configId];
  }
  _configId = nextConfigId;
  RNDiffNativeRowRenderConfig *config = RNDiffNativeRowConfigRegistry()[nextConfigId];
  if (!config) {
    config = [RNDiffNativeRowRenderConfig new];
    RNDiffNativeRowConfigRegistry()[nextConfigId] = config;
  }
  config.configId = nextConfigId;
  config.horizontalScroller = [RNDiffHorizontalScrollerRegistry() objectForKey:nextConfigId];
  config.documentId = newProps.documentId;
  config.rowHeight = newProps.rowHeight;
  config.changeBarWidth = newProps.changeBarWidth;
  config.lineNumberWidth = newProps.lineNumberWidth;
  config.markerWidth = newProps.markerWidth;
  config.horizontalViewportWidth = newProps.horizontalViewportWidth;
  config.highlightChangedCharacters = newProps.highlightChangedCharacters;
  config.syntaxHighlightingEnabled = newProps.syntaxHighlightingEnabled;
  config.themeName = [NSString stringWithUTF8String:newProps.themeName.c_str()] ?: @"dark-plus";
  config.presentation = [NSString stringWithUTF8String:newProps.presentation.c_str()] ?: @"unified";
  [config setFontFamily:[NSString stringWithUTF8String:newProps.fontFamily.c_str()] ?: @"Menlo"
               fontSize:newProps.fontSize];
  [config setForegroundColorString:[NSString stringWithUTF8String:newProps.foregroundColor.c_str()] ?: @""
                  mutedColorString:[NSString stringWithUTF8String:newProps.mutedColor.c_str()] ?: @""
              addAccentColorString:[NSString stringWithUTF8String:newProps.addAccentColor.c_str()] ?: @""
           removeAccentColorString:[NSString stringWithUTF8String:newProps.removeAccentColor.c_str()] ?: @""
          addBackgroundColorString:[NSString stringWithUTF8String:newProps.addBackgroundColor.c_str()] ?: @""
       removeBackgroundColorString:[NSString stringWithUTF8String:newProps.removeBackgroundColor.c_str()] ?: @""
                dividerColorString:[NSString stringWithUTF8String:newProps.dividerColor.c_str()] ?: @""];
  [config setSearchHighlightColorString:[NSString stringWithUTF8String:newProps.searchHighlightColor.c_str()] ?: @""
            activeHighlightColorString:[NSString stringWithUTF8String:newProps.activeSearchHighlightColor.c_str()] ?: @""
       activeRowHighlightColorString:[NSString stringWithUTF8String:newProps.activeSearchRowHighlightColor.c_str()] ?: @""];
  [config setCollapsedFileIndexesString:[NSString stringWithUTF8String:newProps.collapsedFileIndexes.c_str()] ?: @""];
  [config setSearchHighlightByRowIndexString:[NSString stringWithUTF8String:newProps.searchHighlightByRowIndex.c_str()] ?: @""
                                      active:NO];
  [config setSearchHighlightByRowIndexString:[NSString stringWithUTF8String:newProps.activeSearchHighlightByRowIndex.c_str()] ?: @""
                                      active:YES];
  [config updateHorizontalMetrics];
  RNDiffNativeRowInvalidateViews(nextConfigId);
#endif
  [super updateProps:props oldProps:oldProps];
}

- (void)prepareForRecycle
{
  [super prepareForRecycle];
#if TARGET_OS_OSX
  if (_configId.length > 0) {
    [RNDiffNativeRowConfigRegistry() removeObjectForKey:_configId];
    _configId = @"";
  }
#endif
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<DiffNativeRowConfigComponentDescriptor>();
}

@end

@interface RNDiffNativeRow () <RCTDiffNativeRowViewProtocol>
@end

@implementation RNDiffNativeRow {
#if TARGET_OS_OSX
  RNDiffNativeRowContentView *_contentView;
#endif
}

- (instancetype)init
{
  if (self = [super init]) {
    _props = std::make_shared<const DiffNativeRowProps>();
#if TARGET_OS_OSX
    _contentView = [RNDiffNativeRowContentView new];
    _contentView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    [self addSubview:_contentView];
#endif
  }
  return self;
}

- (void)updateProps:(Props::Shared const &)props oldProps:(Props::Shared const &)oldProps
{
  const auto &newProps = *std::static_pointer_cast<DiffNativeRowProps const>(props);
#if TARGET_OS_OSX
  _contentView.configId = [NSString stringWithUTF8String:newProps.configId.c_str()] ?: @"";
  _contentView.configVersion = newProps.configVersion;
  _contentView.rowIndex = newProps.rowIndex;
  _contentView.adaptiveRender = [NSString stringWithUTF8String:newProps.adaptiveRender.c_str()] ?: @"normal";
  [_contentView setNeedsDisplay:YES];
  NSAccessibilityPostNotification(_contentView, NSAccessibilityValueChangedNotification);
#endif
  [super updateProps:props oldProps:oldProps];
}

- (void)prepareForRecycle
{
  [super prepareForRecycle];
#if TARGET_OS_OSX
  _contentView.configId = @"";
  _contentView.configVersion = 0;
  _contentView.rowIndex = -1;
  _contentView.adaptiveRender = @"normal";
  [_contentView.attributedTextScratch.mutableString setString:@""];
  [_contentView setNeedsDisplay:YES];
  NSAccessibilityPostNotification(_contentView, NSAccessibilityValueChangedNotification);
#endif
}

- (void)layoutSubviews
{
  [super layoutSubviews];
#if TARGET_OS_OSX
  _contentView.frame = self.bounds;
#endif
}

- (void)updateLayoutMetrics:(const LayoutMetrics &)layoutMetrics
           oldLayoutMetrics:(const LayoutMetrics &)oldLayoutMetrics
{
  [super updateLayoutMetrics:layoutMetrics oldLayoutMetrics:oldLayoutMetrics];
  [self layoutSubviews];
}

+ (ComponentDescriptorProvider)componentDescriptorProvider
{
  return concreteComponentDescriptorProvider<DiffNativeRowComponentDescriptor>();
}

@end
