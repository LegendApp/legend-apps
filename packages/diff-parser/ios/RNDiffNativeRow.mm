#import "RNDiffNativeRow.h"

#import <react/renderer/components/RNDiffParserSpec/ComponentDescriptors.h>
#import <react/renderer/components/RNDiffParserSpec/Props.h>
#import <react/renderer/components/RNDiffParserSpec/RCTComponentViewHelpers.h>

#import "../cpp/HybridDiffDocument.hpp"

#include <algorithm>
#include <variant>
#include <vector>

using namespace facebook::react;
using namespace margelo::nitro::legenddesktop::diffparser;

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

@interface RNDiffNativeRowContentView : NSView
@property(nonatomic, assign) double documentId;
@property(nonatomic, assign) double rowIndex;
@property(nonatomic, assign) double rowHeight;
@property(nonatomic, assign) double tokenizedMaxRow;
@property(nonatomic, assign) double changeBarWidth;
@property(nonatomic, assign) double lineNumberWidth;
@property(nonatomic, assign) double markerWidth;
@property(nonatomic, assign) double fontSize;
@property(nonatomic, assign) BOOL syntaxHighlightingEnabled;
@property(nonatomic, copy) NSString *fontFamily;
@property(nonatomic, copy) NSString *themeName;
@property(nonatomic, copy) NSString *foregroundColor;
@property(nonatomic, copy) NSString *mutedColor;
@property(nonatomic, copy) NSString *addAccentColor;
@property(nonatomic, copy) NSString *removeAccentColor;
@property(nonatomic, copy) NSString *addBackgroundColor;
@property(nonatomic, copy) NSString *removeBackgroundColor;
@property(nonatomic, copy) NSString *dividerColor;
@property(nonatomic, copy) NSString *presentation;
- (void)setCollapsedFileIndexesString:(NSString *)value;
@end

@implementation RNDiffNativeRowContentView {
  std::vector<double> _collapsedFileIndexes;
}

- (instancetype)init
{
  if (self = [super initWithFrame:NSZeroRect]) {
    _fontFamily = @"Menlo";
    _themeName = @"dark-plus";
    _foregroundColor = @"#ffffff";
    _mutedColor = @"#8b949e";
    _addAccentColor = @"#7ee787";
    _removeAccentColor = @"#ff7b72";
    _addBackgroundColor = @"#17351f";
    _removeBackgroundColor = @"#3a1d24";
    _dividerColor = @"transparent";
    _presentation = @"unified";
    _rowHeight = 18;
    _lineNumberWidth = 44;
    _markerWidth = 14;
    _changeBarWidth = 3;
    _fontSize = 12;
  }
  return self;
}

- (BOOL)isFlipped
{
  return YES;
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

- (NSFont *)rowFont
{
  NSFont *font = [NSFont fontWithName:self.fontFamily size:self.fontSize];
  return font ?: [NSFont monospacedSystemFontOfSize:self.fontSize weight:NSFontWeightRegular];
}

- (NSMutableAttributedString *)attributedTextForRow:(const DiffRenderRow &)plain
                                             tokens:(const std::vector<DiffSyntaxTokenRun> *)tokens
                                           document:(HybridDiffDocument *)document
                                               font:(NSFont *)font
                                    foregroundColor:(NSColor *)foregroundColor
{
  NSString *text = RNDiffStringFromStdString(plain.text);
  NSMutableAttributedString *attributedText = [[NSMutableAttributedString alloc] initWithString:text attributes:@{
    NSFontAttributeName: font,
    NSForegroundColorAttributeName: foregroundColor,
  }];

  if (tokens != nullptr) {
    const char *themeName = self.themeName.UTF8String;
    for (const auto &token : *tokens) {
      const auto scopeStyle = document->getNativeScopeStyle(themeName ? themeName : "", token.scopeId);
      if (!scopeStyle.foreground.empty()) {
        NSColor *tokenColor = RNDiffColorFromString(RNDiffStringFromStdString(scopeStyle.foreground), foregroundColor);
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

  return attributedText;
}

- (void)drawUnifiedDocument:(HybridDiffDocument *)document
{
  const auto row = document->getRow(self.rowIndex);
  const auto plain = row.plain;
  if (plain.kind != diffRowKindLine) {
    return;
  }

  const BOOL isAdd = plain.changeType == diffChangeTypeAdd;
  const BOOL isRemove = plain.changeType == diffChangeTypeRemove;
  const BOOL isChanged = isAdd || isRemove;
  NSColor *foregroundColor = RNDiffColorFromString(self.foregroundColor, NSColor.labelColor);
  NSColor *mutedColor = RNDiffColorFromString(self.mutedColor, NSColor.secondaryLabelColor);
  NSColor *addAccentColor = RNDiffColorFromString(self.addAccentColor, foregroundColor);
  NSColor *removeAccentColor = RNDiffColorFromString(self.removeAccentColor, foregroundColor);
  NSColor *accentColor = isAdd ? addAccentColor : isRemove ? removeAccentColor : NSColor.clearColor;
  NSColor *lineNumberColor = isChanged ? accentColor : mutedColor;
  NSColor *backgroundColor = isAdd
    ? RNDiffColorFromString(self.addBackgroundColor, NSColor.clearColor)
    : isRemove
      ? RNDiffColorFromString(self.removeBackgroundColor, NSColor.clearColor)
      : NSColor.clearColor;

  [backgroundColor setFill];
  NSRectFill(self.bounds);
  [accentColor setFill];
  NSRectFill(NSMakeRect(0, 0, self.changeBarWidth, self.bounds.size.height));

  NSFont *font = [self rowFont];
  NSMutableParagraphStyle *rightParagraph = [NSMutableParagraphStyle new];
  rightParagraph.alignment = NSTextAlignmentRight;
  NSMutableParagraphStyle *centerParagraph = [NSMutableParagraphStyle new];
  centerParagraph.alignment = NSTextAlignmentCenter;
  NSDictionary *lineNumberAttributes = @{
    NSFontAttributeName: font,
    NSForegroundColorAttributeName: lineNumberColor,
    NSParagraphStyleAttributeName: rightParagraph,
  };
  NSDictionary *markerAttributes = @{
    NSFontAttributeName: font,
    NSForegroundColorAttributeName: isChanged ? accentColor : mutedColor,
    NSParagraphStyleAttributeName: centerParagraph,
  };

  const CGFloat textY = MAX(0, (self.rowHeight - font.ascender + font.descender) / 2.0);
  if (plain.oldLineNumber >= 0) {
    NSString *oldLineNumber = [NSString stringWithFormat:@"%.0f", plain.oldLineNumber];
    [oldLineNumber drawInRect:NSMakeRect(self.changeBarWidth, textY, self.lineNumberWidth - 4, self.rowHeight)
               withAttributes:lineNumberAttributes];
  }
  if (plain.newLineNumber >= 0) {
    NSString *newLineNumber = [NSString stringWithFormat:@"%.0f", plain.newLineNumber];
    [newLineNumber drawInRect:NSMakeRect(self.changeBarWidth + self.lineNumberWidth, textY, self.lineNumberWidth - 4, self.rowHeight)
               withAttributes:lineNumberAttributes];
  }

  NSString *marker = isAdd ? @"+" : isRemove ? @"-" : @" ";
  [marker drawInRect:NSMakeRect(self.changeBarWidth + self.lineNumberWidth * 2, textY, self.markerWidth, self.rowHeight)
      withAttributes:markerAttributes];

  const std::vector<DiffSyntaxTokenRun> *tokens = nullptr;
  if (self.syntaxHighlightingEnabled
      && self.rowIndex < self.tokenizedMaxRow
      && row.tokens.has_value()
      && std::holds_alternative<std::vector<DiffSyntaxTokenRun>>(*row.tokens)) {
    tokens = &std::get<std::vector<DiffSyntaxTokenRun>>(*row.tokens);
  }
  NSMutableAttributedString *attributedText = [self attributedTextForRow:plain
                                                                  tokens:tokens
                                                                document:document
                                                                    font:font
                                                         foregroundColor:foregroundColor];

  const CGFloat textX = self.changeBarWidth + self.lineNumberWidth * 2 + self.markerWidth;
  [attributedText drawInRect:NSMakeRect(textX, textY, MAX(0, self.bounds.size.width - textX - 12), self.rowHeight)];
}

- (void)drawSideBySidePlainRow:(const DiffRenderRow &)plain
                    rowVisible:(BOOL)rowVisible
                       oldSide:(BOOL)oldSide
                    columnRect:(NSRect)columnRect
                      document:(HybridDiffDocument *)document
                          font:(NSFont *)font
               foregroundColor:(NSColor *)foregroundColor
                    mutedColor:(NSColor *)mutedColor
                addAccentColor:(NSColor *)addAccentColor
             removeAccentColor:(NSColor *)removeAccentColor
{
  if (!rowVisible || plain.kind != diffRowKindLine) {
    return;
  }

  const BOOL isAdd = plain.changeType == diffChangeTypeAdd;
  const BOOL isRemove = plain.changeType == diffChangeTypeRemove;
  const BOOL isChanged = isAdd || isRemove;
  NSColor *accentColor = isAdd ? addAccentColor : isRemove ? removeAccentColor : NSColor.clearColor;
  NSColor *lineNumberColor = isChanged ? accentColor : mutedColor;
  NSColor *backgroundColor = isAdd
    ? RNDiffColorFromString(self.addBackgroundColor, NSColor.clearColor)
    : isRemove
      ? RNDiffColorFromString(self.removeBackgroundColor, NSColor.clearColor)
      : NSColor.clearColor;

  [backgroundColor setFill];
  NSRectFill(columnRect);

  NSMutableParagraphStyle *rightParagraph = [NSMutableParagraphStyle new];
  rightParagraph.alignment = NSTextAlignmentRight;
  NSMutableParagraphStyle *centerParagraph = [NSMutableParagraphStyle new];
  centerParagraph.alignment = NSTextAlignmentCenter;
  NSDictionary *lineNumberAttributes = @{
    NSFontAttributeName: font,
    NSForegroundColorAttributeName: lineNumberColor,
    NSParagraphStyleAttributeName: rightParagraph,
  };
  NSDictionary *markerAttributes = @{
    NSFontAttributeName: font,
    NSForegroundColorAttributeName: isChanged ? accentColor : mutedColor,
    NSParagraphStyleAttributeName: centerParagraph,
  };

  const CGFloat textY = MAX(0, (self.rowHeight - font.ascender + font.descender) / 2.0);
  const double lineNumber = oldSide ? plain.oldLineNumber : plain.newLineNumber;
  if (lineNumber >= 0) {
    NSString *lineNumberText = [NSString stringWithFormat:@"%.0f", lineNumber];
    [lineNumberText drawInRect:NSMakeRect(columnRect.origin.x, textY, self.lineNumberWidth - 4, self.rowHeight)
                withAttributes:lineNumberAttributes];
  }

  NSString *marker = oldSide && isRemove ? @"-" : !oldSide && isAdd ? @"+" : @" ";
  [marker drawInRect:NSMakeRect(columnRect.origin.x + self.lineNumberWidth, textY, self.markerWidth, self.rowHeight)
      withAttributes:markerAttributes];

  const std::vector<DiffSyntaxTokenRun> *tokens = nullptr;
  if (self.syntaxHighlightingEnabled && plain.index < self.tokenizedMaxRow && !plain.tokens.empty()) {
    tokens = &plain.tokens;
  }
  NSMutableAttributedString *attributedText = [self attributedTextForRow:plain
                                                                  tokens:tokens
                                                                document:document
                                                                    font:font
                                                         foregroundColor:foregroundColor];
  const CGFloat textX = columnRect.origin.x + self.lineNumberWidth + self.markerWidth;
  [attributedText drawInRect:NSMakeRect(
    textX,
    textY,
    MAX(0, NSMaxX(columnRect) - textX - diffSideBySideHorizontalPadding),
    self.rowHeight
  )];
}

- (void)drawSideBySideDocument:(HybridDiffDocument *)document
{
  const auto row = document->getPlainSideBySideRow(self.rowIndex, _collapsedFileIndexes);
  if (row.kind == "file-header") {
    return;
  }

  NSFont *font = [self rowFont];
  NSColor *foregroundColor = RNDiffColorFromString(self.foregroundColor, NSColor.labelColor);
  NSColor *mutedColor = RNDiffColorFromString(self.mutedColor, NSColor.secondaryLabelColor);
  NSColor *addAccentColor = RNDiffColorFromString(self.addAccentColor, foregroundColor);
  NSColor *removeAccentColor = RNDiffColorFromString(self.removeAccentColor, foregroundColor);
  const CGFloat width = self.bounds.size.width;
  const CGFloat leftWidth = floor(width / 2.0);
  const CGFloat rightWidth = MAX(0, width - leftWidth);
  NSRect leftRect = NSMakeRect(0, 0, leftWidth, self.bounds.size.height);
  NSRect rightRect = NSMakeRect(leftWidth, 0, rightWidth, self.bounds.size.height);

  [self drawSideBySidePlainRow:row.oldRow
                    rowVisible:row.oldRowVisible
                       oldSide:YES
                    columnRect:leftRect
                      document:document
                          font:font
               foregroundColor:foregroundColor
                    mutedColor:mutedColor
                addAccentColor:addAccentColor
             removeAccentColor:removeAccentColor];
  const DiffRenderRow &newRow = row.newRowEqualsOldRow ? row.oldRow : row.newRow;
  [self drawSideBySidePlainRow:newRow
                    rowVisible:row.newRowVisible
                       oldSide:NO
                    columnRect:rightRect
                      document:document
                          font:font
               foregroundColor:foregroundColor
                    mutedColor:mutedColor
                addAccentColor:addAccentColor
             removeAccentColor:removeAccentColor];

  NSColor *dividerColor = RNDiffColorFromString(self.dividerColor, NSColor.clearColor);
  [dividerColor setFill];
  NSRectFill(NSMakeRect(leftWidth, 0, 1, self.bounds.size.height));
}

- (void)drawRect:(NSRect)dirtyRect
{
  [super drawRect:dirtyRect];

  auto document = getRegisteredDiffDocument(self.documentId);
  if (!document) {
    return;
  }
  if ([self.presentation isEqualToString:@"blocks"]) {
    [self drawSideBySideDocument:document.get()];
  } else {
    [self drawUnifiedDocument:document.get()];
  }
}

@end
#endif

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
  _contentView.documentId = newProps.documentId;
  _contentView.rowIndex = newProps.rowIndex;
  _contentView.rowHeight = newProps.rowHeight;
  _contentView.tokenizedMaxRow = newProps.tokenizedMaxRow;
  _contentView.changeBarWidth = newProps.changeBarWidth;
  _contentView.lineNumberWidth = newProps.lineNumberWidth;
  _contentView.markerWidth = newProps.markerWidth;
  _contentView.fontSize = newProps.fontSize;
  _contentView.syntaxHighlightingEnabled = newProps.syntaxHighlightingEnabled;
  _contentView.fontFamily = [NSString stringWithUTF8String:newProps.fontFamily.c_str()] ?: @"Menlo";
  _contentView.themeName = [NSString stringWithUTF8String:newProps.themeName.c_str()] ?: @"dark-plus";
  _contentView.foregroundColor = [NSString stringWithUTF8String:newProps.foregroundColor.c_str()] ?: @"";
  _contentView.mutedColor = [NSString stringWithUTF8String:newProps.mutedColor.c_str()] ?: @"";
  _contentView.addAccentColor = [NSString stringWithUTF8String:newProps.addAccentColor.c_str()] ?: @"";
  _contentView.removeAccentColor = [NSString stringWithUTF8String:newProps.removeAccentColor.c_str()] ?: @"";
  _contentView.addBackgroundColor = [NSString stringWithUTF8String:newProps.addBackgroundColor.c_str()] ?: @"";
  _contentView.removeBackgroundColor = [NSString stringWithUTF8String:newProps.removeBackgroundColor.c_str()] ?: @"";
  _contentView.dividerColor = [NSString stringWithUTF8String:newProps.dividerColor.c_str()] ?: @"";
  _contentView.presentation = [NSString stringWithUTF8String:newProps.presentation.c_str()] ?: @"unified";
  [_contentView setCollapsedFileIndexesString:[NSString stringWithUTF8String:newProps.collapsedFileIndexes.c_str()] ?: @""];
  [_contentView setNeedsDisplay:YES];
#endif
  [super updateProps:props oldProps:oldProps];
}

- (void)prepareForRecycle
{
  [super prepareForRecycle];
#if TARGET_OS_OSX
  _contentView.documentId = 0;
  _contentView.rowIndex = -1;
  _contentView.tokenizedMaxRow = 0;
  _contentView.presentation = @"unified";
  [_contentView setCollapsedFileIndexesString:@""];
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
  return concreteComponentDescriptorProvider<DiffNativeRowComponentDescriptor>();
}

@end
