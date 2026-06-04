#import "AppDelegate.h"

#import <React/RCTBundleURLProvider.h>
#import <React/RCTUIKit.h>
#import <ReactAppDependencyProvider/RCTAppDependencyProvider.h>

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

static void LegendConfigureMusicWindow(NSWindow *window)
{
  [window setTitleVisibility:NSWindowTitleHidden];
  [window setTitlebarAppearsTransparent:YES];
  [window setStyleMask:[window styleMask] | NSWindowStyleMaskFullSizeContentView];
  [[window standardWindowButton:NSWindowCloseButton] setHidden:YES];
  [[window standardWindowButton:NSWindowMiniaturizeButton] setHidden:YES];
  [[window standardWindowButton:NSWindowZoomButton] setHidden:YES];
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

@implementation AppDelegate

- (void)applicationWillFinishLaunching:(NSNotification *)notification
{
  Class documentControllerClass = NSClassFromString(@"RNRecentDocumentController");
  if (documentControllerClass && [documentControllerClass isSubclassOfClass:[NSDocumentController class]]) {
    (void)[[documentControllerClass alloc] init];
  }
}

- (void)applicationDidFinishLaunching:(NSNotification *)notification
{
  self.moduleName = @"main";
  self.initialProps = @{
    @"launchArguments": [[NSProcessInfo processInfo] arguments] ?: @[],
  };
  self.dependencyProvider = [RCTAppDependencyProvider new];

  if ([LegendCurrentAppId() isEqualToString:@"music"]) {
    [[NSNotificationCenter defaultCenter] addObserver:self
                                             selector:@selector(windowDidBecomeKey:)
                                                 name:NSWindowDidBecomeKeyNotification
                                               object:nil];
  }
  
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

  if (isMusic) {
    if (self.window == nil) {
      [self loadReactNativeWindow:nil];
    } else if (!self.window.isVisible) {
      [self.window makeKeyAndOrderFront:self];
    } else {
      [self.window makeKeyAndOrderFront:self];
    }
    [NSApp activateIgnoringOtherApps:YES];
  }

  return YES;
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
  NSWindow *window = notification.object;
  BOOL isMusicMainWindow = [LegendCurrentAppId() isEqualToString:@"music"] && window == self.window;

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
  } else {
    self.window.title = self.moduleName;
  }

  self.window.autorecalculatesKeyViewLoop = YES;

  RCTPlatformView *rootView = [self.rootViewFactory viewWithModuleName:self.moduleName
                                                     initialProperties:self.initialProps
                                                         launchOptions:launchOptions];

  rootView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;

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
  if (isMusic) {
    [self.window setDelegate:self];
  }

  NSString *autosaveName = LegendMainWindowFrameAutoSaveName(appId);
  [self.window setFrameAutosaveName:autosaveName];
  if (![self.window setFrameUsingName:autosaveName]) {
    [self.window center];
  }
  if (!isMarkdown) {
    [self.window makeKeyAndOrderFront:self];
  }
  if (isMusic) {
    LegendConfigureMusicWindow(self.window);
  }
}

- (NSURL *)sourceURLForBridge:(RCTBridge *)bridge
{
  return [self bundleURL];
}

- (NSURL *)bundleURL
{
#if DEBUG
  return [[RCTBundleURLProvider sharedSettings] jsBundleURLForBundleRoot:@".expo/.virtual-metro-entry"];
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
