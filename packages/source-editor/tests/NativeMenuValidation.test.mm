#import "../../native-menu/ios/NativeMenuValidation.h"
#include <cassert>
#include <iostream>
int main() { @autoreleasepool {
  NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:@"Save" action:nil keyEquivalent:@"s"];
  LegendSetConfiguredMenuEnabled(item, @YES);
  item.enabled = NO; // Modal-panel validation temporarily disables the item.
  assert(LegendValidateConfiguredMenuItem(item));
  LegendSetConfiguredMenuEnabled(item, @NO);
  item.enabled = YES;
  assert(!LegendValidateConfiguredMenuItem(item));
  LegendSetConfiguredMenuEnabled(item, nil); // Restore the original native action.
  assert(LegendValidateConfiguredMenuItem(item));
  std::cout << "Menu validation: modal state cannot overwrite configured command availability\n";
} }
