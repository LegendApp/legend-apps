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
    return @"LegendMusicMainWindow";
  }

  NSString *normalizedAppId = appId.length > 0 ? appId : @"default";
  return [NSString stringWithFormat:@"RCTAppDelegateMainWindow.%@", normalizedAppId];
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
  
  [super applicationDidFinishLaunching:notification];
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

- (void)loadReactNativeWindow:(NSDictionary *)launchOptions
{
  RCTPlatformView *rootView = [self.rootViewFactory viewWithModuleName:self.moduleName
                                                     initialProperties:self.initialProps
                                                         launchOptions:launchOptions];

  NSString *appId = NSProcessInfo.processInfo.environment[@"LEGEND_APP"] ?: NSBundle.mainBundle.infoDictionary[@"LegendAppId"];
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
    self.window.titleVisibility = NSWindowTitleHidden;
    self.window.titlebarAppearsTransparent = YES;
    self.window.styleMask = self.window.styleMask | NSWindowStyleMaskFullSizeContentView;
    if (@available(macOS 10.14, *)) {
      self.window.appearance = [NSAppearance appearanceNamed:NSAppearanceNameDarkAqua];
    }
    if (@available(macOS 11.0, *)) {
      self.window.titlebarSeparatorStyle = NSTitlebarSeparatorStyleNone;
    }
  } else {
    self.window.title = self.moduleName;
  }

  self.window.autorecalculatesKeyViewLoop = YES;
  NSViewController *rootViewController = [NSViewController new];
  rootViewController.view = rootView;
  rootView.frame = self.window.contentView.bounds;
  rootView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  self.window.contentViewController = rootViewController;

  if (isMarkdown || isMusic) {
    NSColor *backgroundColor = isMusic
      ? NSColor.clearColor
      : [NSColor colorWithSRGBRed:0.960784 green:0.964706 blue:0.972549 alpha:1];
    self.window.contentView.wantsLayer = YES;
    self.window.contentView.layer.backgroundColor = backgroundColor.CGColor;
    self.window.contentView.layer.masksToBounds = NO;
    rootView.wantsLayer = YES;
    rootView.layer.backgroundColor = backgroundColor.CGColor;
    rootView.layer.masksToBounds = NO;
  }

  NSString *autosaveName = LegendMainWindowFrameAutoSaveName(appId);
  [self.window setFrameAutosaveName:autosaveName];
  if (![self.window setFrameUsingName:autosaveName]) {
    [self.window center];
  }
  [self.window makeKeyAndOrderFront:self];
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
