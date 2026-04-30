#import "RNMarkdownParser.h"

#import <React/RCTBridgeModule.h>

#include "../vendor/md4c/src/md4c.h"

static id RNMarkdownParserJSONObjectFromString(NSString *json)
{
  if (![json isKindOfClass:NSString.class] || json.length == 0) {
    return nil;
  }
  NSData *data = [json dataUsingEncoding:NSUTF8StringEncoding];
  return data ? [NSJSONSerialization JSONObjectWithData:data options:0 error:nil] : nil;
}

static NSString *RNMarkdownParserJSONString(id object)
{
  NSData *data = [NSJSONSerialization dataWithJSONObject:(object ?: [NSNull null]) options:0 error:nil];
  return data ? [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] : @"null";
}

static NSString *RNMarkdownParserString(const MD_CHAR *text, MD_SIZE size)
{
  if (!text || size == 0) {
    return @"";
  }
  return [[NSString alloc] initWithBytes:text length:size encoding:NSUTF8StringEncoding] ?: @"";
}

static NSString *RNMarkdownParserAttributeString(MD_ATTRIBUTE attribute)
{
  return RNMarkdownParserString(attribute.text, attribute.size);
}

static BOOL RNMarkdownParserByteIsLineBreak(char value)
{
  return value == '\n' || value == '\r';
}

static BOOL RNMarkdownParserByteIsWhitespace(char value)
{
  return value == ' ' || value == '\t' || value == '\n' || value == '\r';
}

static NSUInteger RNMarkdownParserLineStart(const char *bytes, NSUInteger offset)
{
  while (offset > 0 && bytes[offset - 1] != '\n' && bytes[offset - 1] != '\r') {
    offset -= 1;
  }
  return offset;
}

static NSUInteger RNMarkdownParserLineEnd(const char *bytes, NSUInteger length, NSUInteger offset)
{
  while (offset < length && !RNMarkdownParserByteIsLineBreak(bytes[offset])) {
    offset += 1;
  }
  return offset;
}

static BOOL RNMarkdownParserLineIsBlank(const char *bytes, NSUInteger start, NSUInteger end)
{
  for (NSUInteger index = start; index < end; index += 1) {
    if (!RNMarkdownParserByteIsWhitespace(bytes[index])) {
      return NO;
    }
  }
  return YES;
}

static NSUInteger RNMarkdownParserTrimLinePrefix(const char *bytes, NSUInteger start, NSUInteger end)
{
  while (start < end && (bytes[start] == ' ' || bytes[start] == '\t')) {
    start += 1;
  }
  return start;
}

static BOOL RNMarkdownParserLineStartsHeading(const char *bytes, NSUInteger start, NSUInteger end)
{
  start = RNMarkdownParserTrimLinePrefix(bytes, start, end);
  if (start >= end || bytes[start] != '#') {
    return NO;
  }

  NSUInteger hashCount = 0;
  while (start + hashCount < end && bytes[start + hashCount] == '#') {
    hashCount += 1;
  }

  return hashCount > 0 && hashCount <= 6 && start + hashCount < end &&
      RNMarkdownParserByteIsWhitespace(bytes[start + hashCount]);
}

static BOOL RNMarkdownParserLineStartsFence(const char *bytes, NSUInteger start, NSUInteger end, char fenceChar)
{
  start = RNMarkdownParserTrimLinePrefix(bytes, start, end);
  NSUInteger fenceCount = 0;
  while (start + fenceCount < end && bytes[start + fenceCount] == fenceChar) {
    fenceCount += 1;
  }
  return fenceCount >= 3;
}

static char RNMarkdownParserLineFenceChar(const char *bytes, NSUInteger start, NSUInteger end)
{
  start = RNMarkdownParserTrimLinePrefix(bytes, start, end);
  if (start >= end || (bytes[start] != '`' && bytes[start] != '~')) {
    return 0;
  }
  return RNMarkdownParserLineStartsFence(bytes, start, end, bytes[start]) ? bytes[start] : 0;
}

static BOOL RNMarkdownParserLineStartsBlockquote(const char *bytes, NSUInteger start, NSUInteger end)
{
  start = RNMarkdownParserTrimLinePrefix(bytes, start, end);
  return start < end && bytes[start] == '>';
}

static BOOL RNMarkdownParserLineStartsUnorderedList(const char *bytes, NSUInteger start, NSUInteger end)
{
  start = RNMarkdownParserTrimLinePrefix(bytes, start, end);
  return start + 1 < end && (bytes[start] == '-' || bytes[start] == '*' || bytes[start] == '+') &&
      RNMarkdownParserByteIsWhitespace(bytes[start + 1]);
}

static BOOL RNMarkdownParserLineStartsOrderedList(const char *bytes, NSUInteger start, NSUInteger end)
{
  start = RNMarkdownParserTrimLinePrefix(bytes, start, end);
  NSUInteger index = start;
  while (index < end && bytes[index] >= '0' && bytes[index] <= '9') {
    index += 1;
  }
  return index > start && index + 1 < end && (bytes[index] == '.' || bytes[index] == ')') &&
      RNMarkdownParserByteIsWhitespace(bytes[index + 1]);
}

static BOOL RNMarkdownParserLineStartsOrderedListAtOne(const char *bytes, NSUInteger start, NSUInteger end)
{
  start = RNMarkdownParserTrimLinePrefix(bytes, start, end);
  NSUInteger index = start;
  NSUInteger value = 0;
  while (index < end && bytes[index] >= '0' && bytes[index] <= '9') {
    value = value * 10 + (NSUInteger)(bytes[index] - '0');
    index += 1;
  }
  return value == 1 && index > start && index + 1 < end && (bytes[index] == '.' || bytes[index] == ')') &&
      RNMarkdownParserByteIsWhitespace(bytes[index + 1]);
}

static BOOL RNMarkdownParserLineStartsThematicBreak(const char *bytes, NSUInteger start, NSUInteger end)
{
  start = RNMarkdownParserTrimLinePrefix(bytes, start, end);
  if (start >= end || (bytes[start] != '-' && bytes[start] != '*' && bytes[start] != '_')) {
    return NO;
  }

  const char marker = bytes[start];
  NSUInteger count = 0;
  for (NSUInteger index = start; index < end; index += 1) {
    if (bytes[index] == marker) {
      count += 1;
    } else if (!RNMarkdownParserByteIsWhitespace(bytes[index])) {
      return NO;
    }
  }
  return count >= 3;
}

static BOOL RNMarkdownParserLineLooksLikeTableDelimiter(const char *bytes, NSUInteger start, NSUInteger end)
{
  start = RNMarkdownParserTrimLinePrefix(bytes, start, end);
  BOOL hasDash = NO;
  BOOL hasPipe = NO;
  for (NSUInteger index = start; index < end; index += 1) {
    const char value = bytes[index];
    if (value == '-') {
      hasDash = YES;
    } else if (value == '|') {
      hasPipe = YES;
    } else if (value != ':' && !RNMarkdownParserByteIsWhitespace(value)) {
      return NO;
    }
  }
  return hasDash && hasPipe;
}

static NSUInteger RNMarkdownParserNextLineStart(const char *bytes, NSUInteger length, NSUInteger end)
{
  while (end < length && RNMarkdownParserByteIsLineBreak(bytes[end])) {
    end += 1;
  }
  return end;
}

static NSUInteger RNMarkdownParserNextPhysicalLineStart(const char *bytes, NSUInteger length, NSUInteger end)
{
  if (end < length && bytes[end] == '\r') {
    end += 1;
  }
  if (end < length && bytes[end] == '\n') {
    end += 1;
  }
  return end;
}

static BOOL RNMarkdownParserLineStartsBoundaryBlock(const char *bytes, NSUInteger start, NSUInteger end)
{
  return RNMarkdownParserLineStartsHeading(bytes, start, end) || RNMarkdownParserLineFenceChar(bytes, start, end) != 0 ||
      RNMarkdownParserLineStartsThematicBreak(bytes, start, end);
}

static BOOL RNMarkdownParserLineInterruptsParagraph(const char *bytes, NSUInteger start, NSUInteger end)
{
  return RNMarkdownParserLineStartsBoundaryBlock(bytes, start, end) ||
      RNMarkdownParserLineStartsUnorderedList(bytes, start, end) ||
      RNMarkdownParserLineStartsOrderedListAtOne(bytes, start, end);
}

static NSUInteger RNMarkdownParserBlockStartForText(const char *bytes, NSUInteger length, NSUInteger offset)
{
  NSUInteger start = RNMarkdownParserLineStart(bytes, MIN(offset, length));
  NSUInteger end = RNMarkdownParserLineEnd(bytes, length, start);
  if (RNMarkdownParserLineStartsHeading(bytes, start, end)) {
    return start;
  }

  while (start > 0) {
    NSUInteger previousEnd = start;
    while (previousEnd > 0 && RNMarkdownParserByteIsLineBreak(bytes[previousEnd - 1])) {
      previousEnd -= 1;
    }
    NSUInteger previousStart = RNMarkdownParserLineStart(bytes, previousEnd);
    if (RNMarkdownParserLineIsBlank(bytes, previousStart, previousEnd) ||
        RNMarkdownParserLineStartsHeading(bytes, previousStart, previousEnd)) {
      break;
    }
    start = previousStart;
  }

  return start;
}

static NSUInteger RNMarkdownParserBlockEndForText(const char *bytes, NSUInteger length, NSUInteger offset)
{
  NSUInteger lineStart = RNMarkdownParserLineStart(bytes, MIN(offset, length));
  NSUInteger end = RNMarkdownParserLineEnd(bytes, length, lineStart);
  if (RNMarkdownParserLineStartsHeading(bytes, lineStart, end)) {
    return end;
  }

  while (end < length) {
    NSUInteger nextStart = end;
    while (nextStart < length && RNMarkdownParserByteIsLineBreak(bytes[nextStart])) {
      nextStart += 1;
    }
    NSUInteger nextEnd = RNMarkdownParserLineEnd(bytes, length, nextStart);
    if (nextStart >= length || RNMarkdownParserLineIsBlank(bytes, nextStart, nextEnd) ||
        RNMarkdownParserLineStartsHeading(bytes, nextStart, nextEnd)) {
      break;
    }
    end = nextEnd;
  }

  while (end > 0 && RNMarkdownParserByteIsLineBreak(bytes[end - 1])) {
    end -= 1;
  }
  return end;
}

static NSUInteger RNMarkdownParserFencedCodeBlockStart(const char *bytes, NSUInteger length, NSUInteger offset, char fenceChar)
{
  NSUInteger start = RNMarkdownParserLineStart(bytes, MIN(offset, length));
  while (start > 0) {
    NSUInteger lineStart = start;
    NSUInteger lineEnd = RNMarkdownParserLineEnd(bytes, length, lineStart);
    if (RNMarkdownParserLineStartsFence(bytes, lineStart, lineEnd, fenceChar)) {
      return lineStart;
    }

    NSUInteger previousEnd = lineStart;
    while (previousEnd > 0 && RNMarkdownParserByteIsLineBreak(bytes[previousEnd - 1])) {
      previousEnd -= 1;
    }
    start = RNMarkdownParserLineStart(bytes, previousEnd);
  }
  return RNMarkdownParserBlockStartForText(bytes, length, offset);
}

static NSUInteger RNMarkdownParserFencedCodeBlockEnd(const char *bytes, NSUInteger length, NSUInteger offset, char fenceChar)
{
  NSUInteger lineStart = RNMarkdownParserLineEnd(bytes, length, MIN(offset, length));
  while (lineStart < length) {
    while (lineStart < length && RNMarkdownParserByteIsLineBreak(bytes[lineStart])) {
      lineStart += 1;
    }
    NSUInteger lineEnd = RNMarkdownParserLineEnd(bytes, length, lineStart);
    if (RNMarkdownParserLineStartsFence(bytes, lineStart, lineEnd, fenceChar)) {
      return lineEnd;
    }
    lineStart = lineEnd;
  }
  return RNMarkdownParserBlockEndForText(bytes, length, offset);
}

static NSString *RNMarkdownParserScannedBlockType(const char *bytes, NSUInteger length, NSUInteger start, NSUInteger end)
{
  if (RNMarkdownParserLineStartsHeading(bytes, start, end)) {
    return @"heading";
  }
  if (RNMarkdownParserLineFenceChar(bytes, start, end) != 0) {
    return @"codeBlock";
  }
  if (RNMarkdownParserLineStartsThematicBreak(bytes, start, end)) {
    return @"thematicBreak";
  }
  if (RNMarkdownParserLineStartsBlockquote(bytes, start, end)) {
    return @"quote";
  }
  if (RNMarkdownParserLineStartsUnorderedList(bytes, start, end)) {
    return @"unorderedList";
  }
  if (RNMarkdownParserLineStartsOrderedList(bytes, start, end)) {
    return @"orderedList";
  }

  const NSUInteger nextStart = RNMarkdownParserNextPhysicalLineStart(bytes, length, end);
  if (nextStart < length &&
      RNMarkdownParserLineLooksLikeTableDelimiter(bytes, nextStart, RNMarkdownParserLineEnd(bytes, length, nextStart))) {
    return @"table";
  }

  return @"paragraph";
}

static NSUInteger RNMarkdownParserScannedBlockEnd(const char *bytes, NSUInteger length, NSUInteger start, NSString *type)
{
  NSUInteger end = RNMarkdownParserLineEnd(bytes, length, start);
  if ([type isEqualToString:@"heading"] || [type isEqualToString:@"thematicBreak"]) {
    return end;
  }

  if ([type isEqualToString:@"codeBlock"]) {
    return RNMarkdownParserFencedCodeBlockEnd(bytes, length, end, RNMarkdownParserLineFenceChar(bytes, start, end));
  }

  NSUInteger nextStart = RNMarkdownParserNextPhysicalLineStart(bytes, length, end);
  while (nextStart < length) {
    const NSUInteger nextEnd = RNMarkdownParserLineEnd(bytes, length, nextStart);
    if (RNMarkdownParserLineIsBlank(bytes, nextStart, nextEnd)) {
      break;
    }
    if ([type isEqualToString:@"paragraph"] && RNMarkdownParserLineInterruptsParagraph(bytes, nextStart, nextEnd)) {
      break;
    }
    end = nextEnd;
    nextStart = RNMarkdownParserNextPhysicalLineStart(bytes, length, end);
  }
  return end;
}

static NSString *RNMarkdownParserSourceString(const char *bytes, NSUInteger length, NSUInteger start, NSUInteger end)
{
  if (!bytes || start >= end || start >= length) {
    return @"";
  }
  end = MIN(end, length);
  return [[NSString alloc] initWithBytes:bytes + start length:end - start encoding:NSUTF8StringEncoding] ?: @"";
}

static NSString *RNMarkdownBlockType(MD_BLOCKTYPE type)
{
  switch (type) {
    case MD_BLOCK_DOC:
      return @"document";
    case MD_BLOCK_QUOTE:
      return @"quote";
    case MD_BLOCK_UL:
      return @"unorderedList";
    case MD_BLOCK_OL:
      return @"orderedList";
    case MD_BLOCK_LI:
      return @"listItem";
    case MD_BLOCK_HR:
      return @"thematicBreak";
    case MD_BLOCK_H:
      return @"heading";
    case MD_BLOCK_CODE:
      return @"codeBlock";
    case MD_BLOCK_HTML:
      return @"htmlBlock";
    case MD_BLOCK_P:
      return @"paragraph";
    case MD_BLOCK_TABLE:
      return @"table";
    case MD_BLOCK_THEAD:
      return @"tableHead";
    case MD_BLOCK_TBODY:
      return @"tableBody";
    case MD_BLOCK_TR:
      return @"tableRow";
    case MD_BLOCK_TH:
      return @"tableHeaderCell";
    case MD_BLOCK_TD:
      return @"tableCell";
  }
}

static NSString *RNMarkdownSpanType(MD_SPANTYPE type)
{
  switch (type) {
    case MD_SPAN_EM:
      return @"emphasis";
    case MD_SPAN_STRONG:
      return @"strong";
    case MD_SPAN_A:
      return @"link";
    case MD_SPAN_IMG:
      return @"image";
    case MD_SPAN_CODE:
      return @"code";
    case MD_SPAN_DEL:
      return @"strikethrough";
    case MD_SPAN_LATEXMATH:
      return @"latexMath";
    case MD_SPAN_LATEXMATH_DISPLAY:
      return @"latexMathDisplay";
    case MD_SPAN_WIKILINK:
      return @"wikiLink";
    case MD_SPAN_U:
      return @"underline";
  }
}

static NSString *RNMarkdownTextType(MD_TEXTTYPE type)
{
  switch (type) {
    case MD_TEXT_NORMAL:
      return @"text";
    case MD_TEXT_NULLCHAR:
      return @"null";
    case MD_TEXT_BR:
      return @"lineBreak";
    case MD_TEXT_SOFTBR:
      return @"softBreak";
    case MD_TEXT_ENTITY:
      return @"entity";
    case MD_TEXT_CODE:
      return @"code";
    case MD_TEXT_HTML:
      return @"html";
    case MD_TEXT_LATEXMATH:
      return @"latexMath";
  }
}

static NSString *RNMarkdownAlignName(MD_ALIGN align)
{
  switch (align) {
    case MD_ALIGN_DEFAULT:
      return @"default";
    case MD_ALIGN_LEFT:
      return @"left";
    case MD_ALIGN_CENTER:
      return @"center";
    case MD_ALIGN_RIGHT:
      return @"right";
  }
}

@interface RNMarkdownParserState : NSObject
@property (nonatomic, strong) NSMutableArray<NSMutableDictionary *> *blocks;
@property (nonatomic, strong) NSMutableArray<NSMutableDictionary *> *blockStack;
@property (nonatomic, strong) NSMutableArray<NSMutableDictionary *> *spanStack;
@property (nonatomic, strong) NSMutableArray<NSString *> *errors;
@property (nonatomic, assign) const char *sourceBytes;
@property (nonatomic, assign) NSUInteger sourceLength;
@end

@implementation RNMarkdownParserState

- (instancetype)init
{
  if (self = [super init]) {
    _blocks = [NSMutableArray array];
    _blockStack = [NSMutableArray array];
    _spanStack = [NSMutableArray array];
    _errors = [NSMutableArray array];
  }
  return self;
}

- (NSMutableDictionary *)currentTextBlock
{
  for (NSInteger index = self.blockStack.count - 1; index >= 0; index -= 1) {
    NSMutableDictionary *block = self.blockStack[index];
    NSString *type = block[@"type"];
    if (![type isEqualToString:@"document"] && ![type isEqualToString:@"unorderedList"] &&
        ![type isEqualToString:@"orderedList"] && ![type isEqualToString:@"table"] &&
        ![type isEqualToString:@"tableHead"] && ![type isEqualToString:@"tableBody"] &&
        ![type isEqualToString:@"tableRow"]) {
      return block;
    }
  }
  return nil;
}

- (NSArray<NSString *> *)currentMarks
{
  NSMutableArray<NSString *> *marks = [NSMutableArray arrayWithCapacity:self.spanStack.count];
  for (NSDictionary *span in self.spanStack) {
    NSString *type = span[@"type"];
    if (type.length > 0) {
      [marks addObject:type];
    }
  }
  return marks;
}

- (NSDictionary *)currentLinkAttributes
{
  NSMutableDictionary *attributes = [NSMutableDictionary dictionary];
  for (NSDictionary *span in self.spanStack) {
    NSString *href = span[@"href"];
    NSString *title = span[@"title"];
    NSString *src = span[@"src"];
    NSString *target = span[@"target"];
    if (href.length > 0) {
      attributes[@"href"] = href;
    }
    if (title.length > 0) {
      attributes[@"title"] = title;
    }
    if (src.length > 0) {
      attributes[@"src"] = src;
    }
    if (target.length > 0) {
      attributes[@"target"] = target;
    }
  }
  return attributes;
}

- (NSMutableDictionary *)currentTopLevelBlock
{
  return self.blockStack.count > 1 ? self.blockStack[1] : nil;
}

- (void)recordSourceText:(const MD_CHAR *)text size:(MD_SIZE)size
{
  NSMutableDictionary *block = [self currentTopLevelBlock];
  if (!block || !self.sourceBytes || !text || size == 0) {
    return;
  }

  const char *sourceStart = self.sourceBytes;
  const char *sourceEnd = self.sourceBytes + self.sourceLength;
  const char *textStart = text;
  const char *textEnd = text + size;
  if (textStart < sourceStart || textEnd > sourceEnd) {
    return;
  }

  NSUInteger start = (NSUInteger)(textStart - sourceStart);
  NSUInteger end = (NSUInteger)(textEnd - sourceStart);
  NSNumber *currentStart = block[@"sourceStart"];
  NSNumber *currentEnd = block[@"sourceEnd"];
  if (!currentStart || start < currentStart.unsignedIntegerValue) {
    block[@"sourceStart"] = @(start);
  }
  if (!currentEnd || end > currentEnd.unsignedIntegerValue) {
    block[@"sourceEnd"] = @(end);
  }
}

- (void)attachSourceMarkdownToTopLevelBlock:(NSMutableDictionary *)block
{
  NSNumber *sourceStart = block[@"sourceStart"];
  NSNumber *sourceEnd = block[@"sourceEnd"];
  [block removeObjectForKey:@"sourceStart"];
  [block removeObjectForKey:@"sourceEnd"];
  if (!sourceStart || !sourceEnd || !self.sourceBytes) {
    return;
  }

  NSUInteger start = sourceStart.unsignedIntegerValue;
  NSUInteger end = sourceEnd.unsignedIntegerValue;
  NSDictionary *attrs = block[@"attrs"];
  NSString *type = block[@"type"];
  NSString *fence = [attrs[@"fence"] isKindOfClass:NSString.class] ? attrs[@"fence"] : nil;

  if ([type isEqualToString:@"codeBlock"] && fence.length > 0) {
    char fenceChar = [fence characterAtIndex:0] == '~' ? '~' : '`';
    start = RNMarkdownParserFencedCodeBlockStart(self.sourceBytes, self.sourceLength, start, fenceChar);
    end = RNMarkdownParserFencedCodeBlockEnd(self.sourceBytes, self.sourceLength, end, fenceChar);
  } else {
    start = RNMarkdownParserBlockStartForText(self.sourceBytes, self.sourceLength, start);
    end = RNMarkdownParserBlockEndForText(self.sourceBytes, self.sourceLength, end);
  }

  NSString *markdown = RNMarkdownParserSourceString(self.sourceBytes, self.sourceLength, start, end);
  if (markdown.length > 0) {
    block[@"markdown"] = markdown;
  }
}

- (void)appendText:(NSString *)text type:(NSString *)type
{
  NSMutableDictionary *block = [self currentTextBlock];
  if (!block) {
    return;
  }

  NSMutableString *blockText = block[@"text"];
  NSMutableArray *runs = block[@"runs"];
  NSUInteger offset = blockText.length;
  NSString *normalizedText = text ?: @"";
  if ([type isEqualToString:@"softBreak"] || [type isEqualToString:@"lineBreak"]) {
    normalizedText = @"\n";
  } else if ([type isEqualToString:@"null"]) {
    normalizedText = @"\uFFFD";
  }
  [blockText appendString:normalizedText];

  NSMutableDictionary *run = [@{
    @"type": type ?: @"text",
    @"text": normalizedText,
    @"offset": @(offset),
    @"length": @(normalizedText.length),
  } mutableCopy];

  NSArray<NSString *> *marks = [self currentMarks];
  if (marks.count > 0) {
    run[@"marks"] = marks;
  }
  [run addEntriesFromDictionary:[self currentLinkAttributes]];
  [runs addObject:run];
}

@end

@interface RNMarkdownParser ()
- (NSString *)scanMarkdownSync:(NSString *)markdown optionsJson:(NSString *)optionsJson;
@end

static NSMutableDictionary *RNMarkdownParserBlock(MD_BLOCKTYPE type, void *detail, RNMarkdownParserState *state)
{
  NSString *typeName = RNMarkdownBlockType(type);
  NSMutableDictionary *attrs = [NSMutableDictionary dictionary];

  switch (type) {
    case MD_BLOCK_UL: {
      MD_BLOCK_UL_DETAIL *ul = (MD_BLOCK_UL_DETAIL *)detail;
      attrs[@"tight"] = @(ul ? ul->is_tight != 0 : NO);
      attrs[@"mark"] = ul ? [NSString stringWithFormat:@"%c", ul->mark] : @"";
      break;
    }
    case MD_BLOCK_OL: {
      MD_BLOCK_OL_DETAIL *ol = (MD_BLOCK_OL_DETAIL *)detail;
      attrs[@"start"] = @(ol ? ol->start : 1);
      attrs[@"tight"] = @(ol ? ol->is_tight != 0 : NO);
      attrs[@"markDelimiter"] = ol ? [NSString stringWithFormat:@"%c", ol->mark_delimiter] : @".";
      break;
    }
    case MD_BLOCK_LI: {
      MD_BLOCK_LI_DETAIL *li = (MD_BLOCK_LI_DETAIL *)detail;
      if (li && li->is_task) {
        attrs[@"task"] = @YES;
        attrs[@"checked"] = @(li->task_mark == 'x' || li->task_mark == 'X');
      }
      break;
    }
    case MD_BLOCK_H: {
      MD_BLOCK_H_DETAIL *heading = (MD_BLOCK_H_DETAIL *)detail;
      attrs[@"level"] = @(heading ? heading->level : 1);
      break;
    }
    case MD_BLOCK_CODE: {
      MD_BLOCK_CODE_DETAIL *code = (MD_BLOCK_CODE_DETAIL *)detail;
      if (code) {
        NSString *info = RNMarkdownParserAttributeString(code->info);
        NSString *lang = RNMarkdownParserAttributeString(code->lang);
        if (info.length > 0) {
          attrs[@"info"] = info;
        }
        if (lang.length > 0) {
          attrs[@"lang"] = lang;
        }
        if (code->fence_char != 0) {
          attrs[@"fence"] = [NSString stringWithFormat:@"%c", code->fence_char];
        }
      }
      break;
    }
    case MD_BLOCK_TABLE: {
      MD_BLOCK_TABLE_DETAIL *table = (MD_BLOCK_TABLE_DETAIL *)detail;
      attrs[@"columns"] = @(table ? table->col_count : 0);
      break;
    }
    case MD_BLOCK_TH:
    case MD_BLOCK_TD: {
      MD_BLOCK_TD_DETAIL *cell = (MD_BLOCK_TD_DETAIL *)detail;
      attrs[@"align"] = RNMarkdownAlignName(cell ? cell->align : MD_ALIGN_DEFAULT);
      break;
    }
    default:
      break;
  }

  NSNumber *parentIndex = nil;
  if (state.blockStack.count > 0) {
    parentIndex = state.blockStack.lastObject[@"index"];
  }

  NSUInteger index = state.blocks.count;
  NSMutableDictionary *block = [@{
    @"id": [NSString stringWithFormat:@"%lu", (unsigned long)index],
    @"type": typeName,
    @"index": @(index),
    @"depth": @(state.blockStack.count),
    @"text": [NSMutableString string],
    @"runs": [NSMutableArray array],
  } mutableCopy];
  if (parentIndex) {
    block[@"parentIndex"] = parentIndex;
  }
  if (attrs.count > 0) {
    block[@"attrs"] = attrs;
  }

  [state.blocks addObject:block];
  [state.blockStack addObject:block];
  return block;
}

static NSMutableDictionary *RNMarkdownParserSpan(MD_SPANTYPE type, void *detail)
{
  NSMutableDictionary *span = [@{@"type": RNMarkdownSpanType(type)} mutableCopy];
  switch (type) {
    case MD_SPAN_A: {
      MD_SPAN_A_DETAIL *link = (MD_SPAN_A_DETAIL *)detail;
      if (link) {
        NSString *href = RNMarkdownParserAttributeString(link->href);
        NSString *title = RNMarkdownParserAttributeString(link->title);
        if (href.length > 0) {
          span[@"href"] = href;
        }
        if (title.length > 0) {
          span[@"title"] = title;
        }
        if (link->is_autolink) {
          span[@"autolink"] = @YES;
        }
      }
      break;
    }
    case MD_SPAN_IMG: {
      MD_SPAN_IMG_DETAIL *image = (MD_SPAN_IMG_DETAIL *)detail;
      if (image) {
        NSString *src = RNMarkdownParserAttributeString(image->src);
        NSString *title = RNMarkdownParserAttributeString(image->title);
        if (src.length > 0) {
          span[@"src"] = src;
        }
        if (title.length > 0) {
          span[@"title"] = title;
        }
      }
      break;
    }
    case MD_SPAN_WIKILINK: {
      MD_SPAN_WIKILINK_DETAIL *wikiLink = (MD_SPAN_WIKILINK_DETAIL *)detail;
      if (wikiLink) {
        NSString *target = RNMarkdownParserAttributeString(wikiLink->target);
        if (target.length > 0) {
          span[@"target"] = target;
        }
      }
      break;
    }
    default:
      break;
  }
  return span;
}

static int RNMarkdownEnterBlock(MD_BLOCKTYPE type, void *detail, void *userdata)
{
  RNMarkdownParserState *state = (__bridge RNMarkdownParserState *)userdata;
  RNMarkdownParserBlock(type, detail, state);
  return 0;
}

static int RNMarkdownLeaveBlock(MD_BLOCKTYPE type, void *detail, void *userdata)
{
  RNMarkdownParserState *state = (__bridge RNMarkdownParserState *)userdata;
  if (state.blockStack.count > 0) {
    NSMutableDictionary *block = state.blockStack.lastObject;
    NSNumber *depth = block[@"depth"];
    NSString *typeName = block[@"type"];
    if (depth.unsignedIntegerValue == 1 && ![typeName isEqualToString:@"document"]) {
      [state attachSourceMarkdownToTopLevelBlock:block];
    }
    [state.blockStack removeLastObject];
  }
  return 0;
}

static int RNMarkdownEnterSpan(MD_SPANTYPE type, void *detail, void *userdata)
{
  RNMarkdownParserState *state = (__bridge RNMarkdownParserState *)userdata;
  [state.spanStack addObject:RNMarkdownParserSpan(type, detail)];
  return 0;
}

static int RNMarkdownLeaveSpan(MD_SPANTYPE type, void *detail, void *userdata)
{
  RNMarkdownParserState *state = (__bridge RNMarkdownParserState *)userdata;
  if (state.spanStack.count > 0) {
    [state.spanStack removeLastObject];
  }
  return 0;
}

static int RNMarkdownText(MD_TEXTTYPE type, const MD_CHAR *text, MD_SIZE size, void *userdata)
{
  RNMarkdownParserState *state = (__bridge RNMarkdownParserState *)userdata;
  [state recordSourceText:text size:size];
  [state appendText:RNMarkdownParserString(text, size) type:RNMarkdownTextType(type)];
  return 0;
}

static void RNMarkdownDebugLog(const char *msg, void *userdata)
{
  RNMarkdownParserState *state = (__bridge RNMarkdownParserState *)userdata;
  if (msg) {
    [state.errors addObject:[NSString stringWithUTF8String:msg] ?: @"Unknown markdown parser warning"];
  }
}

static unsigned RNMarkdownParserFlags(NSDictionary *options)
{
  NSString *dialect = [options[@"dialect"] isKindOfClass:NSString.class] ? options[@"dialect"] : @"github";
  unsigned flags = [dialect isEqualToString:@"commonmark"] ? MD_DIALECT_COMMONMARK : MD_DIALECT_GITHUB;

  if ([options[@"collapseWhitespace"] boolValue]) {
    flags |= MD_FLAG_COLLAPSEWHITESPACE;
  }
  if ([options[@"hardSoftBreaks"] boolValue]) {
    flags |= MD_FLAG_HARD_SOFT_BREAKS;
  }
  if ([options[@"noHtml"] boolValue]) {
    flags |= MD_FLAG_NOHTML;
  }
  if ([options[@"noIndentedCodeBlocks"] boolValue]) {
    flags |= MD_FLAG_NOINDENTEDCODEBLOCKS;
  }
  if ([options[@"permissiveAutolinks"] boolValue]) {
    flags |= MD_FLAG_PERMISSIVEAUTOLINKS;
  }
  if ([options[@"tables"] boolValue]) {
    flags |= MD_FLAG_TABLES;
  }
  if ([options[@"taskLists"] boolValue]) {
    flags |= MD_FLAG_TASKLISTS;
  }
  if ([options[@"strikethrough"] boolValue]) {
    flags |= MD_FLAG_STRIKETHROUGH;
  }
  if ([options[@"latexMath"] boolValue]) {
    flags |= MD_FLAG_LATEXMATHSPANS;
  }
  if ([options[@"wikiLinks"] boolValue]) {
    flags |= MD_FLAG_WIKILINKS;
  }
  if ([options[@"underline"] boolValue]) {
    flags |= MD_FLAG_UNDERLINE;
  }

  return flags;
}

@implementation RNMarkdownParser

RCT_EXPORT_MODULE(NativeMarkdownParser)

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeMarkdownParserSpecJSI>(params);
}

- (NSString *)parseMarkdownSync:(NSString *)markdown optionsJson:(NSString *)optionsJson
{
  id rawOptions = RNMarkdownParserJSONObjectFromString(optionsJson);
  NSDictionary *options = [rawOptions isKindOfClass:NSDictionary.class] ? rawOptions : @{};
  if ([options[@"scanner"] boolValue]) {
    return [self scanMarkdownSync:markdown optionsJson:optionsJson];
  }

  RNMarkdownParserState *state = [RNMarkdownParserState new];
  MD_PARSER parser = {};
  parser.abi_version = 0;
  parser.flags = RNMarkdownParserFlags(options);
  parser.enter_block = RNMarkdownEnterBlock;
  parser.leave_block = RNMarkdownLeaveBlock;
  parser.enter_span = RNMarkdownEnterSpan;
  parser.leave_span = RNMarkdownLeaveSpan;
  parser.text = RNMarkdownText;
  parser.debug_log = RNMarkdownDebugLog;

  NSData *data = [(markdown ?: @"") dataUsingEncoding:NSUTF8StringEncoding] ?: [NSData data];
  state.sourceBytes = (const char *)data.bytes;
  state.sourceLength = data.length;
  int result = md_parse((const MD_CHAR *)data.bytes, (MD_SIZE)data.length, &parser, (__bridge void *)state);
  NSMutableDictionary *payload = [@{@"blocks": state.blocks} mutableCopy];
  if (result != 0) {
    payload[@"error"] = [NSString stringWithFormat:@"Markdown parse failed with code %d", result];
  }
  if (state.errors.count > 0) {
    payload[@"warnings"] = state.errors;
  }
  return RNMarkdownParserJSONString(payload);
}

- (NSString *)scanMarkdownSync:(NSString *)markdown optionsJson:(NSString *)optionsJson
{
  (void)optionsJson;
  NSData *data = [(markdown ?: @"") dataUsingEncoding:NSUTF8StringEncoding] ?: [NSData data];
  const char *bytes = (const char *)data.bytes;
  const NSUInteger length = data.length;
  NSMutableArray<NSDictionary *> *blocks = [NSMutableArray array];
  NSUInteger start = 0;

  while (start < length) {
    NSUInteger end = RNMarkdownParserLineEnd(bytes, length, start);
    if (RNMarkdownParserLineIsBlank(bytes, start, end)) {
      start = RNMarkdownParserNextLineStart(bytes, length, end);
      continue;
    }

    NSString *type = RNMarkdownParserScannedBlockType(bytes, length, start, end);
    end = RNMarkdownParserScannedBlockEnd(bytes, length, start, type);
    NSString *source = RNMarkdownParserSourceString(bytes, length, start, MIN(end, length));
    NSUInteger index = blocks.count;
    [blocks addObject:@{
      @"id": [NSString stringWithFormat:@"%lu", (unsigned long)index],
      @"type": type,
      @"index": @(index),
      @"depth": @1,
      @"text": @"",
      @"markdown": source,
      @"runs": @[],
    }];
    start = RNMarkdownParserNextLineStart(bytes, length, end);
  }

  return RNMarkdownParserJSONString(@{@"blocks": blocks});
}

- (void)parseMarkdown:(NSString *)markdown
          optionsJson:(NSString *)optionsJson
              resolve:(RCTPromiseResolveBlock)resolve
               reject:(RCTPromiseRejectBlock)reject
{
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    NSString *json = [self parseMarkdownSync:markdown optionsJson:optionsJson];
    resolve(json);
  });
}

- (void)parseMarkdownFile:(NSString *)filePath
              optionsJson:(NSString *)optionsJson
                  resolve:(RCTPromiseResolveBlock)resolve
                   reject:(RCTPromiseRejectBlock)reject
{
  dispatch_async(dispatch_get_global_queue(QOS_CLASS_USER_INITIATED, 0), ^{
    NSString *path = filePath ?: @"";
    if ([path hasPrefix:@"file://"]) {
      NSURL *url = [NSURL URLWithString:path];
      path = url.path ?: @"";
    }
    NSError *error = nil;
    NSString *markdown = [NSString stringWithContentsOfFile:path encoding:NSUTF8StringEncoding error:&error];
    if (!markdown) {
      reject(@"READ_FAILED", error.localizedDescription ?: @"Failed to read markdown file", error);
      return;
    }
    id rawOptions = RNMarkdownParserJSONObjectFromString(optionsJson);
    NSDictionary *options = [rawOptions isKindOfClass:NSDictionary.class] ? rawOptions : @{};
    NSString *json = [options[@"scanner"] boolValue] ? [self scanMarkdownSync:markdown optionsJson:optionsJson]
                                                     : [self parseMarkdownSync:markdown optionsJson:optionsJson];
    resolve(json);
  });
}

@end
