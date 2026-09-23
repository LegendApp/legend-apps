#import <TargetConditionals.h>

#if TARGET_OS_OSX
#import <AppKit/AppKit.h>

// RNAppKitSplitView is optional. Supply linkable defaults for static release/LTO
// builds; its strong definitions replace these when that pod is included.
extern "C" __attribute__((weak)) void LegendPrepareSidebarSplitViewStartup(NSWindow *, NSDictionary *) {}
extern "C" __attribute__((weak)) BOOL LegendAttachSidebarSplitViewStartupRoot(NSWindow *, NSView *, void (^)(void))
{
  return NO;
}
extern "C" __attribute__((weak)) void LegendFinishSidebarSplitViewStartup(NSWindow *) {}
#endif
