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

@interface RNDiffNativeRowRenderConfig : NSObject
@property(nonatomic, assign) double documentId;
@property(nonatomic, assign) double rowHeight;
@property(nonatomic, assign) double changeBarWidth;
@property(nonatomic, assign) double lineNumberWidth;
@property(nonatomic, assign) double markerWidth;
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
@property(nonatomic, strong) NSColor *dividerColor;
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
- (void)setFontFamily:(NSString *)fontFamily fontSize:(double)fontSize;
- (void)setForegroundColorString:(NSString *)foregroundColor
                mutedColorString:(NSString *)mutedColor
            addAccentColorString:(NSString *)addAccentColor
         removeAccentColorString:(NSString *)removeAccentColor
        addBackgroundColorString:(NSString *)addBackgroundColor
     removeBackgroundColorString:(NSString *)removeBackgroundColor
              dividerColorString:(NSString *)dividerColor;
- (void)setCollapsedFileIndexesString:(NSString *)value;
- (const std::vector<double> &)collapsedFileIndexes;
- (NSColor *)colorForScopeId:(double)scopeId document:(HybridDiffDocument *)document;
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
    _documentId = 0;
    _rowHeight = 18;
    _changeBarWidth = 3;
    _lineNumberWidth = 44;
    _markerWidth = 14;
    _syntaxHighlightingEnabled = YES;
    _themeName = @"dark-plus";
    _presentation = @"unified";
    _scopeColorById = [NSMutableDictionary new];
    _font = [NSFont monospacedSystemFontOfSize:12 weight:NSFontWeightRegular];
    _foregroundColor = NSColor.labelColor;
    _mutedColor = NSColor.secondaryLabelColor;
    _addAccentColor = _foregroundColor;
    _removeAccentColor = _foregroundColor;
    _addBackgroundColor = NSColor.clearColor;
    _removeBackgroundColor = NSColor.clearColor;
    _dividerColor = NSColor.clearColor;
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
  self.font = font ?: [NSFont monospacedSystemFontOfSize:fontSize weight:NSFontWeightRegular];
  [self updateTextAttributes];
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
  self.dividerColor = RNDiffColorFromString(dividerColor, NSColor.clearColor);
  if (shouldResetScopeColors) {
    [self.scopeColorById removeAllObjects];
  }
  [self updateTextAttributes];
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

@class RNDiffNativeRowContentView;

static NSMutableDictionary<NSString *, NSHashTable<RNDiffNativeRowContentView *> *> *RNDiffNativeRowViewRegistry()
{
  static NSMutableDictionary<NSString *, NSHashTable<RNDiffNativeRowContentView *> *> *registry;
  static dispatch_once_t onceToken;
  dispatch_once(&onceToken, ^{
    registry = [NSMutableDictionary new];
  });
  return registry;
}

static void RNDiffNativeRowRegisterView(NSString *configId, RNDiffNativeRowContentView *view)
{
  if (configId.length == 0) {
    return;
  }
  NSMutableDictionary<NSString *, NSHashTable<RNDiffNativeRowContentView *> *> *registry = RNDiffNativeRowViewRegistry();
  NSHashTable<RNDiffNativeRowContentView *> *views = registry[configId];
  if (!views) {
    views = [NSHashTable weakObjectsHashTable];
    registry[configId] = views;
  }
  [views addObject:view];
}

static void RNDiffNativeRowUnregisterView(NSString *configId, RNDiffNativeRowContentView *view)
{
  if (configId.length == 0) {
    return;
  }
  NSHashTable<RNDiffNativeRowContentView *> *views = RNDiffNativeRowViewRegistry()[configId];
  [views removeObject:view];
  if (views.count == 0) {
    [RNDiffNativeRowViewRegistry() removeObjectForKey:configId];
  }
}

static void RNDiffNativeRowInvalidateViews(NSString *configId)
{
  for (RNDiffNativeRowContentView *view in RNDiffNativeRowViewRegistry()[configId]) {
    [(NSView *)view setNeedsDisplay:YES];
  }
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
  RNDiffNativeRowUnregisterView(_configId, self);
}

- (NSMutableAttributedString *)attributedTextForRow:(const DiffRenderRow &)plain
                                             tokens:(const std::vector<DiffSyntaxTokenRun> *)tokens
                                           document:(HybridDiffDocument *)document
                                             config:(RNDiffNativeRowRenderConfig *)config
{
  NSString *text = RNDiffStringFromStdString(plain.text);
  NSMutableAttributedString *attributedText = self.attributedTextScratch;
  [[attributedText mutableString] setString:text];
  if (attributedText.length > 0) {
    [attributedText setAttributes:config.baseTextAttributes range:NSMakeRange(0, attributedText.length)];
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

  [backgroundColor setFill];
  NSRectFill(self.bounds);
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
  const double tokenizedMaxRow = document->getTokenizedMaxRow();
  if (!lightRender
      && config.syntaxHighlightingEnabled
      && self.rowIndex < tokenizedMaxRow
      && row.tokens.has_value()
      && std::holds_alternative<std::vector<DiffSyntaxTokenRun>>(*row.tokens)) {
    tokens = &std::get<std::vector<DiffSyntaxTokenRun>>(*row.tokens);
  }
  NSMutableAttributedString *attributedText = [self attributedTextForRow:plain
                                                                  tokens:tokens
                                                                document:document
                                                                  config:config];

  const CGFloat textX = config.changeBarWidth + config.lineNumberWidth * 2 + config.markerWidth;
  [attributedText drawInRect:NSMakeRect(textX, textY, MAX(0, self.bounds.size.width - textX - 12), config.rowHeight)];
}

- (void)drawSideBySidePlainRow:(const DiffRenderRow &)plain
                    rowVisible:(BOOL)rowVisible
                       oldSide:(BOOL)oldSide
                    columnRect:(NSRect)columnRect
                      document:(HybridDiffDocument *)document
                         config:(RNDiffNativeRowRenderConfig *)config
                tokenizedMaxRow:(double)tokenizedMaxRow
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
      && plain.index < tokenizedMaxRow
      && !plain.tokens.empty()) {
    tokens = &plain.tokens;
  }
  NSMutableAttributedString *attributedText = [self attributedTextForRow:plain
                                                                  tokens:tokens
                                                                document:document
                                                                  config:config];
  const CGFloat textX = columnRect.origin.x + config.lineNumberWidth + config.markerWidth;
  [attributedText drawInRect:NSMakeRect(
    textX,
    textY,
    MAX(0, NSMaxX(columnRect) - textX - diffSideBySideHorizontalPadding),
    config.rowHeight
  )];
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
  const double tokenizedMaxRow = document->getTokenizedMaxRow();

  [self drawSideBySidePlainRow:row.oldRow
                    rowVisible:row.oldRowVisible
                       oldSide:YES
                    columnRect:leftRect
                      document:document
                         config:config
                tokenizedMaxRow:tokenizedMaxRow];
  const DiffRenderRow &newRow = row.newRowEqualsOldRow ? row.oldRow : row.newRow;
  [self drawSideBySidePlainRow:newRow
                    rowVisible:row.newRowVisible
                       oldSide:NO
                    columnRect:rightRect
                      document:document
                         config:config
                tokenizedMaxRow:tokenizedMaxRow];

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
#endif

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
  config.documentId = newProps.documentId;
  config.rowHeight = newProps.rowHeight;
  config.changeBarWidth = newProps.changeBarWidth;
  config.lineNumberWidth = newProps.lineNumberWidth;
  config.markerWidth = newProps.markerWidth;
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
  [config setCollapsedFileIndexesString:[NSString stringWithUTF8String:newProps.collapsedFileIndexes.c_str()] ?: @""];
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
