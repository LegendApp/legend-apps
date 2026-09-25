#import <TargetConditionals.h>
#if TARGET_OS_OSX && __has_include(<RNDesktopApp/SparkLifecycle.h>)
#import <RNDesktopApp/SparkLifecycle.h>
extern "C" void LegendPrecreateRestorableWindows(void);
extern "C" NSDictionary *LegendMainWindowStartupSplitViewConfiguration(void);
extern "C" void LegendPrepareSidebarSplitViewStartup(NSWindow *, NSDictionary *) __attribute__((weak_import));
extern "C" BOOL LegendAttachSidebarSplitViewStartupRoot(NSWindow *, NSView *, void (^)(void)) __attribute__((weak_import));

@interface RNWindowManagerStartup : NSObject <SparkStartupPlugin>
@end
@implementation RNWindowManagerStartup
- (void)prepareApplication { LegendPrecreateRestorableWindows(); }
- (void)prepareMainWindow:(NSWindow *)window {
  if ([SparkLifecycleConfiguration()[@"mainWindow"][@"hidden"] boolValue]) return;
  NSDictionary *configuration = LegendMainWindowStartupSplitViewConfiguration();
  NSDictionary *initial = [NSBundle.mainBundle objectForInfoDictionaryKey:@"LegendInitialSplitView"];
  if (!configuration && initial) {
    // Unshown AppKit windows may still report Aqua; match the host startup theme.
    NSAppearance *appearance = window.appearance ?: NSApp.appearance;
    BOOL dark = appearance
      ? [[appearance bestMatchFromAppearancesWithNames:@[NSAppearanceNameDarkAqua, NSAppearanceNameAqua]] isEqualToString:NSAppearanceNameDarkAqua]
      : [[[NSUserDefaults.standardUserDefaults stringForKey:@"AppleInterfaceStyle"] lowercaseString] isEqualToString:@"dark"];
    configuration = initial[dark ? @"dark" : @"light"];
  }
  if (LegendPrepareSidebarSplitViewStartup && configuration) LegendPrepareSidebarSplitViewStartup(window, configuration);
}
- (void)attachRootView:(NSView *)root toWindow:(NSWindow *)window installRoot:(void (^)(void))installRoot {
  if (!LegendAttachSidebarSplitViewStartupRoot || !LegendAttachSidebarSplitViewStartupRoot(window, root, installRoot)) installRoot();
}
@end
#endif
