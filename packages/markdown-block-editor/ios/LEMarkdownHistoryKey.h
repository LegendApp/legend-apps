#import <AppKit/AppKit.h>

// Only buffer a history shortcut the app's menu will actually dispatch.
// Disabled/absent Undo or Redo must never leave ordinary typing queued.
static inline BOOL LEMarkdownMenuHandlesHistoryKey(NSMenu *menu, NSEvent *event) {
  NSEventModifierFlags relevant = NSEventModifierFlagCommand | NSEventModifierFlagShift |
    NSEventModifierFlagOption | NSEventModifierFlagControl;
  NSEventModifierFlags modifiers = event.modifierFlags & relevant;
  if ((modifiers != NSEventModifierFlagCommand && modifiers != (NSEventModifierFlagCommand | NSEventModifierFlagShift)) ||
      ![event.charactersIgnoringModifiers.lowercaseString isEqualToString:@"z"]) return NO;
  for (NSMenuItem *item in menu.itemArray) {
    if (item.submenu && LEMarkdownMenuHandlesHistoryKey(item.submenu, event)) return YES;
    NSEventModifierFlags itemModifiers = item.keyEquivalentModifierMask & relevant;
    if ([item.keyEquivalent isEqualToString:@"Z"]) itemModifiers |= NSEventModifierFlagShift;
    if (item.enabled && item.action && [item.keyEquivalent.lowercaseString isEqualToString:@"z"] && itemModifiers == modifiers) return YES;
  }
  return NO;
}
