#import <AppKit/AppKit.h>
#import "ENRMAutoLinkDetector.h"
#import "ENRMDetectorPipeline.h"
#import "ENRMMarkdownSerializer.h"
#import "ENRMInputParser.h"

static NSString *serialize(NSTextStorage *storage, ENRMAutoLinkDetector *detector) {
  return [ENRMMarkdownSerializer serializePlainText:storage.string ranges:detector.transientFormattingRanges];
}

static void requireEqual(NSString *actual, NSString *expected) {
  if (![actual isEqualToString:expected]) {
    NSLog(@"FAIL auto-link round trip\nexpected: %@\nactual: %@", expected, actual);
    exit(1);
  }
}

int main() {
  @autoreleasepool {
    // Editing adjacent prose must keep source escapes byte-exact, including adjacent escapes.
    for (NSString *source in @[@"alpha \\*literal\\* \\[bracket\\] \\_under\\_", @"alpha \\*\\* \\\\ end"]) {
      ENRMParseResult *parsed = [[ENRMInputParser new] parseToPlainTextAndRanges:source];
      ENRMFormattingStore *ranges = [ENRMFormattingStore new];
      [ranges setRanges:parsed.formattingRanges];
      NSMutableString *text = [parsed.plainText mutableCopy];
      [text replaceCharactersInRange:NSMakeRange(0, 5) withString:@"ALPHA"];
      [ranges adjustForEditAtLocation:0 deletedLength:5 insertedLength:5];
      requireEqual([ENRMMarkdownSerializer serializePlainText:text ranges:ranges.allRanges],
                   [source stringByReplacingOccurrencesOfString:@"alpha" withString:@"ALPHA"]);
    }
    for (NSString *source in @[@"alpha [label](https://example.com \"keep title\") end", @"alpha [label](https://example.com 'title') end"]) {
      ENRMParseResult *parsed = [[ENRMInputParser new] parseToPlainTextAndRanges:source];
      ENRMFormattingStore *ranges = [ENRMFormattingStore new];
      [ranges setRanges:parsed.formattingRanges];
      [ranges adjustForEditAtLocation:0 deletedLength:5 insertedLength:5];
      NSString *text = [parsed.plainText stringByReplacingOccurrencesOfString:@"alpha" withString:@"ALPHA"];
      requireEqual([ENRMMarkdownSerializer serializePlainText:text ranges:ranges.allRanges],
                   [source stringByReplacingOccurrencesOfString:@"alpha" withString:@"ALPHA"]);
    }
    NSArray<NSString *> *literalCases = @[
      @"```ts\nconsole.log(greeting);\nconst qa = true;\n```",
      @"`console.log`",
      @"``code ` console.log``",
      @"~~~ts\nconsole.log(greeting);\n~~~",
      @"```ts\nconsole.log(greeting);", // unfinished fence
      @"    console.log(greeting);", // indented code
      @"🌍 café `console.log`",
      @"`https://example.com`",
      @"> ```ts\n> console.log(greeting);\n> ```",
    ];
    for (NSString *text in literalCases) {
      NSTextStorage *storage = [[NSTextStorage alloc] initWithString:text];
      ENRMFormattingStore *store = [ENRMFormattingStore new];
      ENRMAutoLinkDetector *detector = [[ENRMAutoLinkDetector alloc] initWithTextStorage:storage formattingStore:store style:nil];
      ENRMDetectorPipeline *pipeline = [ENRMDetectorPipeline new];
      [pipeline addDetector:detector];
      [pipeline processTextChange:text modificationRange:NSMakeRange(0, text.length)];
      requireEqual(serialize(storage, detector), text);
    }
    // Ordinary prose still auto-links, even adjacent to code in the same token.
    for (NSString *text in @[@"example.com", @"`console.log` example.com", @"`console.log`,example.com"]) {
      NSTextStorage *storage = [[NSTextStorage alloc] initWithString:text];
      ENRMFormattingStore *store = [ENRMFormattingStore new];
      ENRMAutoLinkDetector *detector = [[ENRMAutoLinkDetector alloc] initWithTextStorage:storage formattingStore:store style:nil];
      ENRMDetectorPipeline *pipeline = [ENRMDetectorPipeline new];
      [pipeline addDetector:detector];
      [pipeline processTextChange:text modificationRange:NSMakeRange(0, text.length)];
      requireEqual(serialize(storage, detector), [text stringByReplacingOccurrencesOfString:@"example.com" withString:@"[example.com](https://example.com)"]);
    }
    // Existing transient links must disappear from serialization when wrapped in code,
    // even if the edit touched delimiters rather than the linked token.
    NSTextStorage *storage = [[NSTextStorage alloc] initWithString:@"console.log"];
    ENRMFormattingStore *store = [ENRMFormattingStore new];
    ENRMAutoLinkDetector *detector = [[ENRMAutoLinkDetector alloc] initWithTextStorage:storage formattingStore:store style:nil];
    ENRMDetectorPipeline *pipeline = [ENRMDetectorPipeline new];
    [pipeline addDetector:detector];
    [pipeline processTextChange:storage.string modificationRange:NSMakeRange(0, storage.length)];
    requireEqual(serialize(storage, detector), @"[console.log](https://console.log)");
    [storage replaceCharactersInRange:NSMakeRange(storage.length, 0) withString:@"`"];
    [storage replaceCharactersInRange:NSMakeRange(0, 0) withString:@"`"];
    requireEqual(serialize(storage, detector), @"`console.log`");
    NSLog(@"PASS 14 native code/prose auto-link round trips");
  }
  return 0;
}
