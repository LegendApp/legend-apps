#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>
#import <React/RCTLinkingManager.h>
#import <React/RCTUIKit.h>
#import <ReactAppDependencyProvider/RCTAppDependencyProvider.h>
#import <Carbon/Carbon.h>
#import <QuartzCore/QuartzCore.h>

#include <cxxreact/ReactMarker.h>

static NSString * const LegendApplicationReopenRequestedNotification = @"LegendApplicationReopenRequestedNotification";

static BOOL LegendIsMarkdownPath(NSString *value)
{
  if (![value isKindOfClass:NSString.class] || value.length == 0) {
    return NO;
  }

  NSSet<NSString *> *extensions = [NSSet setWithArray:@[@"md", @"markdown", @"mdown", @"mkd", @"mdx"]];
  return [extensions containsObject:value.pathExtension.lowercaseString];
}

static NSString *LegendInitialMarkdownWindowTitle(void)
{
  for (NSString *argument in NSProcessInfo.processInfo.arguments) {
    if (LegendIsMarkdownPath(argument)) {
      return argument.lastPathComponent.stringByDeletingPathExtension ?: @"Untitled";
    }
  }

  return @"Untitled";
}

static NSString *LegendMainWindowFrameAutoSaveName(NSString *appId)
{
  if ([appId isEqualToString:@"music"]) {
    return @"MainWindow";
  }

  NSString *normalizedAppId = appId.length > 0 ? appId : @"default";
  return [NSString stringWithFormat:@"RCTAppDelegateMainWindow.%@", normalizedAppId];
}

static NSString *LegendCurrentAppId(void)
{
  return NSProcessInfo.processInfo.environment[@"LEGEND_APP"] ?: NSBundle.mainBundle.infoDictionary[@"LegendAppId"];
}


static NSString *LegendCurrentDisplayName(void)
{
  NSDictionary *info = NSBundle.mainBundle.infoDictionary;
  NSString *bundleDisplayName = [info[@"CFBundleDisplayName"] isKindOfClass:NSString.class] ? info[@"CFBundleDisplayName"] : nil;
  NSString *legendDisplayName = [info[@"LegendAppDisplayName"] isKindOfClass:NSString.class] ? info[@"LegendAppDisplayName"] : nil;
  NSString *bundleName = [info[@"CFBundleName"] isKindOfClass:NSString.class] ? info[@"CFBundleName"] : nil;
  NSString *displayName = NSProcessInfo.processInfo.processName;

  if (bundleName.length > 0) {
    displayName = bundleName;
  }
  if (legendDisplayName.length > 0) {
    displayName = legendDisplayName;
  }
  if (bundleDisplayName.length > 0) {
    displayName = bundleDisplayName;
  }

  return displayName;
}

static BOOL LegendHostWindowHidden(void)
{
  id value = NSBundle.mainBundle.infoDictionary[@"LegendHostWindowHidden"];
  return [value respondsToSelector:@selector(boolValue)] && [value boolValue];
}

static BOOL LegendUsesExpoModules(void)
{
  id value = NSBundle.mainBundle.infoDictionary[@"LegendUseExpoModules"];
  return ![value respondsToSelector:@selector(boolValue)] || [value boolValue];
}

static BOOL LegendAppearanceIsDark(NSAppearance *appearance)
{
  if (@available(macOS 10.14, *)) {
    NSAppearanceName match = [appearance bestMatchFromAppearancesWithNames:@[
      NSAppearanceNameDarkAqua,
      NSAppearanceNameAqua,
    ]];
    return [match isEqualToString:NSAppearanceNameDarkAqua];
  }

  return NO;
}

static NSColor *LegendColorFromHexString(NSString *value)
{
  if (![value isKindOfClass:NSString.class] || value.length == 0) {
    return nil;
  }

  NSString *hex = [value hasPrefix:@"#"] ? [value substringFromIndex:1] : value;
  if (hex.length != 6 && hex.length != 8) {
    return nil;
  }

  unsigned long long raw = 0;
  if (![[NSScanner scannerWithString:hex] scanHexLongLong:&raw]) {
    return nil;
  }

  CGFloat red = hex.length == 8 ? ((raw >> 24) & 0xff) / 255.0 : ((raw >> 16) & 0xff) / 255.0;
  CGFloat green = hex.length == 8 ? ((raw >> 16) & 0xff) / 255.0 : ((raw >> 8) & 0xff) / 255.0;
  CGFloat blue = hex.length == 8 ? ((raw >> 8) & 0xff) / 255.0 : (raw & 0xff) / 255.0;
  CGFloat alpha = hex.length == 8 ? (raw & 0xff) / 255.0 : 1;
  return [NSColor colorWithSRGBRed:red green:green blue:blue alpha:alpha];
}

static BOOL LegendHostWindowUsesDarkAppearance(NSWindow *window)
{
  if (window.appearance != nil) {
    return LegendAppearanceIsDark(window.appearance);
  }
  if (NSApp.appearance != nil) {
    return LegendAppearanceIsDark(NSApp.appearance);
  }

  // AppKit initially reports Aqua before an unshown window joins the app's
  // appearance hierarchy, so consult the current system style at launch.
  NSString *interfaceStyle = [NSUserDefaults.standardUserDefaults stringForKey:@"AppleInterfaceStyle"];
  return [interfaceStyle caseInsensitiveCompare:@"Dark"] == NSOrderedSame ||
    LegendAppearanceIsDark(NSApp.effectiveAppearance);
}

static NSColor *LegendHostWindowStartupBackgroundColor(NSWindow *window)
{
  BOOL isDark = LegendHostWindowUsesDarkAppearance(window);
  NSString *key = isDark ? @"LegendHostWindowDarkBackgroundColor" : @"LegendHostWindowLightBackgroundColor";
  NSColor *configuredColor = LegendColorFromHexString(NSBundle.mainBundle.infoDictionary[key]);
  if (configuredColor != nil) {
    return configuredColor;
  }

  return isDark
    ? [NSColor colorWithSRGBRed:25.0 / 255.0 green:26.0 / 255.0 blue:27.0 / 255.0 alpha:1]
    : [NSColor colorWithSRGBRed:245.0 / 255.0 green:246.0 / 255.0 blue:248.0 / 255.0 alpha:1];
}

static BOOL LegendCanFocusManagedReopenWindow(NSWindow *window, NSWindow *hostWindow)
{
  return window != nil && window != hostWindow && window.isVisible && !window.sheet && ![window isKindOfClass:NSPanel.class];
}

static void LegendRetitleMenuItemsWithPrefix(NSMenu *menu, NSString *prefix, NSString *displayName)
{
  for (NSMenuItem *item in menu.itemArray) {
    if ([item.title hasPrefix:prefix]) {
      item.title = [prefix stringByAppendingString:displayName];
    }
  }
}

static void LegendRetitleMenuItemsWithSuffix(NSMenu *menu, NSString *suffix, NSString *displayName)
{
  for (NSMenuItem *item in menu.itemArray) {
    if ([item.title hasSuffix:suffix]) {
      item.title = [displayName stringByAppendingString:suffix];
    }
  }
}

static void LegendConfigureApplicationMenuTitles(void)
{
  NSString *displayName = LegendCurrentDisplayName();
  NSMenu *mainMenu = NSApp.mainMenu;

  if (displayName.length > 0 && mainMenu.numberOfItems > 0) {
    NSMenuItem *appMenuItem = [mainMenu itemAtIndex:0];
    appMenuItem.title = displayName;
    appMenuItem.submenu.title = displayName;

    if (appMenuItem.submenu) {
      LegendRetitleMenuItemsWithPrefix(appMenuItem.submenu, @"About ", displayName);
      LegendRetitleMenuItemsWithPrefix(appMenuItem.submenu, @"Hide ", displayName);
      LegendRetitleMenuItemsWithPrefix(appMenuItem.submenu, @"Quit ", displayName);
    }

    for (NSMenuItem *rootItem in mainMenu.itemArray) {
      if ([rootItem.title isEqualToString:@"Help"] && rootItem.submenu) {
        LegendRetitleMenuItemsWithSuffix(rootItem.submenu, @" Help", displayName);
      }
    }
  }
}

static void LegendConfigureMusicWindow(NSWindow *window)
{
  [window setTitleVisibility:NSWindowTitleHidden];
  [window setTitlebarAppearsTransparent:YES];
  [window setStyleMask:[window styleMask] | NSWindowStyleMaskFullSizeContentView];
  [[window standardWindowButton:NSWindowCloseButton] setHidden:YES];
  [[window standardWindowButton:NSWindowMiniaturizeButton] setHidden:YES];
  [[window standardWindowButton:NSWindowZoomButton] setHidden:YES];
}

static void LegendConfigureChatHistoryWindow(NSWindow *window)
{
  window.title = @"Legend Chat History";
  window.minSize = NSMakeSize(640, 460);
  window.styleMask = NSWindowStyleMaskTitled
    | NSWindowStyleMaskClosable
    | NSWindowStyleMaskMiniaturizable
    | NSWindowStyleMaskResizable
    | NSWindowStyleMaskFullSizeContentView
    | NSWindowStyleMaskUnifiedTitleAndToolbar;
  window.titleVisibility = NSWindowTitleVisible;
  window.titlebarAppearsTransparent = YES;
  if (!window.toolbar) {
    NSToolbar *toolbar = [[NSToolbar alloc] initWithIdentifier:@"LegendMainWindowToolbar"];
    toolbar.displayMode = NSToolbarDisplayModeIconOnly;
    toolbar.showsBaselineSeparator = NO;
    window.toolbar = toolbar;
  }
  if (@available(macOS 11.0, *)) {
    window.toolbarStyle = NSWindowToolbarStyleUnified;
    window.titlebarSeparatorStyle = NSTitlebarSeparatorStyleShadow;
  }
}

static void LegendMakeViewTransparent(NSView *view)
{
  view.wantsLayer = YES;
  view.layer.backgroundColor = NSColor.clearColor.CGColor;
  view.layer.masksToBounds = NO;
}

static NSView *LegendCreateMusicGlassHostView(NSRect frame, NSView **contentView)
{
  NSRect bounds = NSMakeRect(0, 0, NSWidth(frame), NSHeight(frame));
  NSView *content = [[NSView alloc] initWithFrame:bounds];
  content.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  LegendMakeViewTransparent(content);

  NSView *hostView = content;
  if (@available(macOS 26.0, *)) {
    NSGlassEffectView *glassView = [[NSGlassEffectView alloc] initWithFrame:bounds];
    glassView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    glassView.contentView = content;
    LegendMakeViewTransparent(glassView);
    hostView = glassView;
  }

  *contentView = content;
  return hostView;
}

@interface AppDelegate ()

@property (nonatomic, weak) NSWindow *lastFocusedManagedWindow;

@end

@implementation AppDelegate

- (void)applicationWillFinishLaunching:(NSNotification *)notification
{
  facebook::react::ReactMarker::logMarkerDone(
    facebook::react::ReactMarker::APP_STARTUP_START,
    CACurrentMediaTime() * 1000);
  LegendConfigureApplicationMenuTitles();

  Class documentControllerClass = NSClassFromString(@"RNRecentDocumentController");
  if (documentControllerClass && [documentControllerClass isSubclassOfClass:[NSDocumentController class]]) {
    (void)[[documentControllerClass alloc] init];
  }

  [[NSAppleEventManager sharedAppleEventManager] setEventHandler:RCTLinkingManager.class
                                                    andSelector:@selector(getUrlEventHandler:withReplyEvent:)
                                                  forEventClass:kInternetEventClass
                                                     andEventID:kAEGetURL];
}

- (void)applicationDidFinishLaunching:(NSNotification *)notification
{
  self.moduleName = @"main";
  self.initialProps = @{
    @"launchArguments": [[NSProcessInfo processInfo] arguments] ?: @[],
  };
  self.dependencyProvider = [RCTAppDependencyProvider new];

  [[NSNotificationCenter defaultCenter] addObserver:self
                                           selector:@selector(windowDidBecomeKey:)
                                               name:NSWindowDidBecomeKeyNotification
                                             object:nil];

  facebook::react::ReactMarker::logMarkerDone(
    facebook::react::ReactMarker::INIT_REACT_RUNTIME_START,
    CACurrentMediaTime() * 1000);
  [super applicationDidFinishLaunching:notification];

  if ([LegendCurrentAppId() isEqualToString:@"music"]) {
    NSAppearance *darkAppearance = [NSAppearance appearanceNamed:NSAppearanceNameDarkAqua];
    if (darkAppearance) {
      [NSApp setAppearance:darkAppearance];
    }
  }
}

- (void)dealloc
{
  [[NSNotificationCenter defaultCenter] removeObserver:self];
}

- (NSApplicationTerminateReply)applicationShouldTerminate:(NSApplication *)sender
{
  Class appExitClass = NSClassFromString(@"RNAppExit");
  SEL selector = NSSelectorFromString(@"applicationShouldTerminate");
  if (!appExitClass || ![appExitClass respondsToSelector:selector]) {
    return NSTerminateNow;
  }

  NSMethodSignature *signature = [appExitClass methodSignatureForSelector:selector];
  if (!signature) {
    return NSTerminateNow;
  }

  NSInvocation *invocation = [NSInvocation invocationWithMethodSignature:signature];
  invocation.target = appExitClass;
  invocation.selector = selector;
  [invocation invoke];

  NSApplicationTerminateReply reply = NSTerminateNow;
  [invocation getReturnValue:&reply];
  return reply;
}

- (BOOL)applicationShouldHandleReopen:(NSApplication *)sender hasVisibleWindows:(BOOL)flag
{
  NSString *appId = LegendCurrentAppId();
  BOOL isMusic = [appId isEqualToString:@"music"];
  BOOL hostWindowHidden = LegendHostWindowHidden();
  BOOL shouldHandleReopen = YES;

  if (isMusic) {
    if (self.window == nil) {
      [self loadReactNativeWindow:nil];
    } else if (!self.window.isVisible) {
      [self.window makeKeyAndOrderFront:self];
    } else {
      [self.window makeKeyAndOrderFront:self];
    }
    [NSApp activateIgnoringOtherApps:YES];
  } else if (hostWindowHidden) {
    [self.window orderOut:self];

    NSWindow *targetWindow = [self reopenTargetWindow];

    if (targetWindow) {
      [targetWindow makeKeyAndOrderFront:self];
    } else {
      [NSNotificationCenter.defaultCenter postNotificationName:LegendApplicationReopenRequestedNotification
                                                        object:self
                                                      userInfo:@{@"hasVisibleWindows": @NO}];
    }
    [NSApp activateIgnoringOtherApps:YES];
    shouldHandleReopen = NO;
  }

  return shouldHandleReopen;
}

- (NSWindow *)reopenTargetWindow
{
  NSWindow *targetWindow = nil;
  NSWindow *keyWindow = NSApp.keyWindow;
  NSWindow *mainWindow = NSApp.mainWindow;

  if (LegendCanFocusManagedReopenWindow(keyWindow, self.window)) {
    targetWindow = keyWindow;
  } else if (LegendCanFocusManagedReopenWindow(mainWindow, self.window)) {
    targetWindow = mainWindow;
  } else if (LegendCanFocusManagedReopenWindow(self.lastFocusedManagedWindow, self.window)) {
    targetWindow = self.lastFocusedManagedWindow;
  } else {
    for (NSWindow *window in NSApp.windows) {
      if (LegendCanFocusManagedReopenWindow(window, self.window)) {
        targetWindow = window;
        break;
      }
    }
  }

  return targetWindow;
}

- (BOOL)windowShouldClose:(NSWindow *)sender
{
  NSString *appId = LegendCurrentAppId();
  BOOL shouldHideMusicWindow = [appId isEqualToString:@"music"] && sender == self.window;

  if (shouldHideMusicWindow) {
    [self.window orderOut:self];
  }

  return !shouldHideMusicWindow;
}

- (void)windowDidBecomeKey:(NSNotification *)notification
{
  NSWindow *window = [notification.object isKindOfClass:NSWindow.class] ? notification.object : nil;
  BOOL isMusicMainWindow = [LegendCurrentAppId() isEqualToString:@"music"] && window == self.window;

  if (LegendCanFocusManagedReopenWindow(window, self.window)) {
    self.lastFocusedManagedWindow = window;
  }

  if (isMusicMainWindow) {
    if (!self.mainWindowFrameAdjusted) {
      CGFloat titleBarHeight = NSHeight(window.frame) - NSHeight(window.contentLayoutRect);
      if (titleBarHeight > 0.0) {
        NSRect frame = window.frame;
        frame.size.height += titleBarHeight;
        frame.origin.y -= titleBarHeight;
        [window setFrame:frame display:NO animate:NO];
      }
      self.mainWindowFrameAdjusted = YES;
    }

    LegendConfigureMusicWindow(window);
    [window setDelegate:self];
  }
}

- (void)loadReactNativeWindow:(NSDictionary *)launchOptions
{
  NSString *appId = LegendCurrentAppId();
  BOOL isMarkdown = [appId isEqualToString:@"markdown"];
  BOOL isMusic = [appId isEqualToString:@"music"];
  BOOL isChatHistory = [appId isEqualToString:@"chat-history"];
  BOOL hostWindowHidden = LegendHostWindowHidden();
  NSRect frame = isMusic ? NSMakeRect(0, 0, 360, 640) : NSMakeRect(0, 0, 1280, 720);
  self.window = [[NSWindow alloc] initWithContentRect:frame
                                           styleMask:NSWindowStyleMaskTitled | NSWindowStyleMaskResizable | NSWindowStyleMaskClosable | NSWindowStyleMaskMiniaturizable
                                             backing:NSBackingStoreBuffered
                                               defer:NO];

  if (isMarkdown) {
    NSColor *backgroundColor = [NSColor colorWithSRGBRed:0.960784 green:0.964706 blue:0.972549 alpha:1];
    self.window.title = LegendInitialMarkdownWindowTitle();
    self.window.backgroundColor = backgroundColor;
    self.window.opaque = YES;
    self.window.titleVisibility = NSWindowTitleVisible;
    self.window.titlebarAppearsTransparent = YES;
    self.window.styleMask = self.window.styleMask | NSWindowStyleMaskFullSizeContentView;
    if (@available(macOS 11.0, *)) {
      self.window.titlebarSeparatorStyle = NSTitlebarSeparatorStyleNone;
    }
  } else if (isMusic) {
    self.window.title = @"Legend Music";
    self.window.backgroundColor = NSColor.clearColor;
    self.window.opaque = NO;
    self.window.minSize = NSMakeSize(200, 300);
    if (@available(macOS 10.14, *)) {
      self.window.appearance = [NSAppearance appearanceNamed:NSAppearanceNameDarkAqua];
    }
    LegendConfigureMusicWindow(self.window);
    [self.window setDelegate:self];
  } else if (isChatHistory) {
    LegendConfigureChatHistoryWindow(self.window);
  } else {
    self.window.title = self.moduleName;
  }

  self.window.autorecalculatesKeyViewLoop = YES;

  if (isChatHistory) {
    [self.window setContentSize:frame.size];
    [self.window center];
  } else {
    NSString *autosaveName = LegendMainWindowFrameAutoSaveName(appId);
    [self.window setFrameAutosaveName:autosaveName];
    if (![self.window setFrameUsingName:autosaveName]) {
      [self.window center];
    }
  }

  BOOL presentBeforeReactRoot = !hostWindowHidden;
  NSColor *startupBackgroundColor = nil;
  if (presentBeforeReactRoot) {
    startupBackgroundColor = LegendHostWindowStartupBackgroundColor(self.window);
    NSView *placeholderView = [[NSView alloc] initWithFrame:self.window.contentView.bounds];
    placeholderView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
    placeholderView.wantsLayer = YES;
    placeholderView.layer.backgroundColor = startupBackgroundColor.CGColor;
    self.window.backgroundColor = startupBackgroundColor;
    self.window.contentView = placeholderView;
    [self.window makeKeyAndOrderFront:self];
    [self.window displayIfNeeded];
  }

  RCTPlatformView *rootView = [self.rootViewFactory viewWithModuleName:self.moduleName
                                                     initialProperties:self.initialProps
                                                         launchOptions:launchOptions];

  rootView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  if (startupBackgroundColor != nil) {
    ((RCTUIView *)rootView).backgroundColor = startupBackgroundColor;
  }

  if (isMusic) {
    NSView *glassContentView = nil;
    NSView *glassHostView = LegendCreateMusicGlassHostView(frame, &glassContentView);
    self.musicGlassContentView = glassContentView;

    NSViewController *glassViewController = [NSViewController new];
    glassViewController.view = glassHostView;
    self.window.contentViewController = glassViewController;

    self.musicRootViewController = [NSViewController new];
    self.musicRootViewController.view = rootView;
    [glassViewController addChildViewController:self.musicRootViewController];

    rootView.frame = glassContentView.bounds;
    [glassContentView addSubview:rootView];
  } else {
    NSViewController *rootViewController = [NSViewController new];
    rootView.frame = self.window.contentView.bounds;
    rootViewController.view = rootView;
    self.window.contentViewController = rootViewController;
  }

  if (isMarkdown || isMusic) {
    NSColor *backgroundColor = isMusic
      ? NSColor.clearColor
      : [NSColor colorWithSRGBRed:0.960784 green:0.964706 blue:0.972549 alpha:1];
    LegendMakeViewTransparent(self.window.contentView);
    if (isMarkdown) {
      self.window.contentView.layer.backgroundColor = backgroundColor.CGColor;
    }
    if (isMusic && [rootView respondsToSelector:@selector(setBackgroundColor:)]) {
      [(id)rootView setBackgroundColor:[NSColor clearColor]];
    }
    LegendMakeViewTransparent(rootView);
    rootView.layer.backgroundColor = backgroundColor.CGColor;
  }
  if (hostWindowHidden) {
    [self.window orderOut:self];
  } else {
    [self.window makeKeyAndOrderFront:self];
  }
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}

- (NSURL *)bundleURL
{
#if DEBUG
  NSString *bundleRoot = LegendUsesExpoModules() ? @".expo/.virtual-metro-entry" : @"index.native";
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:bundleRoot];
#else
  return [[NSBundle mainBundle] URLForResource:@"main" withExtension:@"jsbundle"];
#endif
}

/// This method controls whether the `concurrentRoot`feature of React18 is turned on or off.
///
/// @see: https://reactjs.org/blog/2022/03/29/react-v18.html
/// @note: This requires to be rendering on Fabric (i.e. on the New Architecture).
/// @return: `true` if the `concurrentRoot` feature is enabled. Otherwise, it returns `false`.
- (BOOL)concurrentRootEnabled
{
#ifdef RN_FABRIC_ENABLED
  return true;
#else
  return false;
#endif
}

@end
