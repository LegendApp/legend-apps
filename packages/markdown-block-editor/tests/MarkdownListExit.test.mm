#import "../ios/LEMarkdownListExit.h"
static void check(BOOL value) { if (!value) abort(); }
int main() { @autoreleasepool {
  // Real serialization omits the empty final item's marker.
  for (NSString *prefix in @[@"1. First\n2. 👩🏽‍💻 café", @"- First\n- Second", @"- [ ] First\n- [x] Second"]) {
    NSString *before = [prefix stringByAppendingString:@"\n"];
    check([LEMarkdownListBeforeExit(before, @"", 0) isEqualToString:prefix]);
    check([LEMarkdownListBeforeExit(before, @"", 1) isEqualToString:prefix]);
    check(LEMarkdownListBeforeExit(before, @"", -1) == nil);
    check(LEMarkdownListBeforeExit(before, @"remaining", 0) == nil);
  }
  check([LEMarkdownListBeforeExit(@"- Parent\n   - Child\n", @"", 1) isEqualToString:@"- Parent\n   - Child"]);
  check(LEMarkdownListBeforeExit(@"1. First\n2. Text", @"", 0) == nil);
  check(LEMarkdownListBeforeExit(@"", @"", 0) == nil);
  NSLog(@"PASS 15 list-exit cases: ordered, bullets, tasks, Unicode, nested, and mid-list");
} return 0; }
