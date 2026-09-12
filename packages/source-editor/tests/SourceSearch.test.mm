#import "../macos/SourceSearch.h"
#include <cassert>
#include <iostream>
int main() { @autoreleasepool {
  NSError *error = nil;
  auto *result = LESearchSource(@"cat scatter CAT cat_ cat", @"cat", NO, NO, YES, ^BOOL { return NO; }, &error);
  assert(!error && result.matches.count == 3);
  result = LESearchSource(@"😀 one\r\ntwo", @"two", NO, YES, NO, ^BOOL { return NO; }, &error);
  assert(result.matches.count == 1 && result.matches[0].range.location == 8);
  result = LESearchSource(@"a1 b22", @"([a-z])(\\d+)", YES, YES, NO, ^BOOL { return NO; }, &error);
  assert(result.matches.count == 2);
  assert([[result.expression replacementStringForResult:result.matches[1] inString:@"a1 b22" offset:0 template:@"$2-$1"] isEqual:@"22-b"]);
  result = LESearchSource(@"ab", @"(?=.)", YES, YES, NO, ^BOOL { return NO; }, &error);
  assert(result.matches.count == 2 && result.matches[0].range.length == 0);
  result = LESearchSource(@"abc", @"[", YES, YES, NO, ^BOOL { return NO; }, &error);
  assert(!result && error);
  result = LESearchSource(@"abc", @"a", NO, YES, NO, ^BOOL { return YES; }, &error);
  assert(!result);
  result = LESearchSource([@"a" stringByPaddingToLength:100001 withString:@"a" startingAtIndex:0], @"a", NO, YES, NO, ^BOOL { return NO; }, &error);
  assert(result.truncated && result.matches.count == 100000);
  std::cout << "Search: literal/regex, Unicode offsets, whole words, capture replacements, zero-width, cancellation and limits passed\n";
} }
