#import "../ios/LEMarkdownKeyboardHandoff.h"
static void check(BOOL value) { if (!value) abort(); }
static NSEvent *key(NSString *text, unsigned short code) {
  return [NSEvent keyEventWithType:NSEventTypeKeyDown location:NSZeroPoint modifierFlags:0 timestamp:0 windowNumber:1 context:nil characters:text charactersIgnoringModifiers:text isARepeat:NO keyCode:code];
}
int main() { @autoreleasepool {
  LEMarkdownKeyboardHandoff *handoff = [LEMarkdownKeyboardHandoff new];
  NSEvent *a = key(@"a", 0), *enter = key(@"\r", 36), *b = key(@"b", 11);
  check(![handoff enqueue:a]);
  [handoff beginFromBlock:@"first"];
  check([handoff enqueue:a]);
  check([handoff enqueue:enter]);
  check([handoff enqueue:b]);
  check([handoff finishAtBlock:@"first"].count == 0);
  NSArray *events = [handoff finishAtBlock:@"second"];
  check([events isEqualToArray:@[a, enter, b]]);
  check(![handoff enqueue:a]);
  // Replayed Enter starts another transition; remaining keys wait again.
  [handoff beginFromBlock:@"second"];
  check([handoff enqueue:b]);
  check([[handoff finishAtBlock:@"third"] isEqualToArray:@[b]]);
  [handoff beginFromBlock:@"third"];
  check([handoff enqueue:a]);
  check([[handoff cancel] isEqualToArray:@[a]]);
  check([handoff finishAtBlock:@"fourth"].count == 0);
  check(![handoff enqueue:b]);
  NSLog(@"PASS keyboard handoff ordering, stale readiness, repeated Enter, and cleanup");
} return 0; }
