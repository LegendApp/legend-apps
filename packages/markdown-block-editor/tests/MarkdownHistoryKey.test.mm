#import "../ios/LEMarkdownHistoryKey.h"
static void check(BOOL value) { if (!value) abort(); }
static NSEvent *key(NSString *text, NSEventModifierFlags modifiers) {
  return [NSEvent keyEventWithType:NSEventTypeKeyDown location:NSZeroPoint modifierFlags:modifiers timestamp:0 windowNumber:1 context:nil characters:text charactersIgnoringModifiers:text isARepeat:NO keyCode:6];
}
int main() { @autoreleasepool {
  NSMenu *root = [NSMenu new], *edit = [NSMenu new];
  NSMenuItem *parent = [[NSMenuItem alloc] initWithTitle:@"Edit" action:nil keyEquivalent:@""];
  parent.submenu = edit;
  [root addItem:parent];
  NSMenuItem *undo = [[NSMenuItem alloc] initWithTitle:@"Undo" action:@selector(undo:) keyEquivalent:@"z"];
  NSMenuItem *redo = [[NSMenuItem alloc] initWithTitle:@"Redo" action:@selector(redo:) keyEquivalent:@"Z"];
  [edit addItem:undo]; [edit addItem:redo];
  NSEvent *undoKey = key(@"z", NSEventModifierFlagCommand);
  NSEvent *redoKey = key(@"Z", NSEventModifierFlagCommand | NSEventModifierFlagShift);
  check(LEMarkdownMenuHandlesHistoryKey(root, undoKey));
  check(LEMarkdownMenuHandlesHistoryKey(root, redoKey));
  redo.enabled = NO;
  check(!LEMarkdownMenuHandlesHistoryKey(root, redoKey));
  undo.enabled = NO;
  check(!LEMarkdownMenuHandlesHistoryKey(root, undoKey));
  check(!LEMarkdownMenuHandlesHistoryKey(root, key(@"z", 0)));
  check(!LEMarkdownMenuHandlesHistoryKey(root, key(@"z", NSEventModifierFlagCommand | NSEventModifierFlagOption)));
  check(!LEMarkdownMenuHandlesHistoryKey(root, key(@"x", NSEventModifierFlagCommand)));
  check(!LEMarkdownMenuHandlesHistoryKey([NSMenu new], undoKey));
  NSLog(@"PASS history shortcut routing: enabled, disabled, nested menu, modifiers, and unrelated keys");
} return 0; }
