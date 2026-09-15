#import <Foundation/Foundation.h>
#import "ENRMInputParser.h"

int main() {
  @autoreleasepool {
    ENRMInputParser *parser = [ENRMInputParser new];
    NSArray<NSString *> *cases = @[
      @"Pasted paragraphSuffix", @"**bold**Suffix", @"**👩🏽‍💻 café**Suffix",
      @"## [中文](https://example.com)Suffix", @"`inline code`Suffix",
      @"First\nsecondSuffix", @"```js\nconst n = 1;Suffix\n```"
    ];
    for (NSString *markdown in cases) {
      NSUInteger source = [markdown rangeOfString:@"Suffix"].location;
      ENRMParseResult *parsed = [parser parseToPlainTextAndRanges:markdown sourceSelection:source];
      NSUInteger expected = [parsed.plainText rangeOfString:@"Suffix"].location;
      if (expected == NSNotFound || parsed.selectionOffset != expected) {
        NSLog(@"FAIL paste caret %@: %lu != %lu", markdown, parsed.selectionOffset, expected);
        return 1;
      }
    }
    if ([parser parseToPlainTextAndRanges:@"" sourceSelection:9].selectionOffset != 0 ||
        [parser parseToPlainTextAndRanges:@"**bold**" sourceSelection:99].selectionOffset != 4) return 1;
    NSLog(@"PASS 9 native Markdown paste selection cases");
  }
  return 0;
}
