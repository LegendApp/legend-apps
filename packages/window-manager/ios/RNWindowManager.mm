#import "RNWindowManager.h"

#import <React-RCTAppDelegate/RCTRootViewFactory.h>
#import <React/RCTBridge.h>
#import <React/RCTBridgeModule.h>
#import <React/RCTRootView.h>
#import <React/RCTUIKit.h>
#import <React/RCTUtils.h>
#import <TargetConditionals.h>

#if TARGET_OS_OSX
#import <AppKit/AppKit.h>
#import <CoreImage/CoreImage.h>
#import <objc/runtime.h>
#import <QuartzCore/QuartzCore.h>
#endif

@protocol RNWindowManagerRootViewFactoryProvider <NSObject>
- (RCTRootViewFactory *)rootViewFactory;
@end

#if TARGET_OS_OSX
static NSString * const LegendApplicationReopenRequestedNotification = @"LegendApplicationReopenRequestedNotification";

static inline NSAppearance *LegendDarkAppearance()
{
  if (@available(macOS 10.14, *)) {
    return [NSAppearance appearanceNamed:NSAppearanceNameDarkAqua];
  } else if (@available(macOS 10.10, *)) {
    return [NSAppearance appearanceNamed:NSAppearanceNameVibrantDark];
  }
  return nil;
}

static void LegendWindowOpenTiming(NSString *event, NSDictionary *payload)
{
  NSLog(@"[WindowOpenTiming] %@ %@", event, payload ?: @{});
}

static NSAppearance *LegendAppearanceForName(NSString *value)
{
  if (![value isKindOfClass:NSString.class] || value.length == 0 || [value isEqualToString:@"system"]) {
    return nil;
  }

  if ([value isEqualToString:@"light"]) {
    return [NSAppearance appearanceNamed:NSAppearanceNameAqua];
  }

  if ([value isEqualToString:@"dark"]) {
    return [NSAppearance appearanceNamed:NSAppearanceNameDarkAqua] ?: LegendDarkAppearance();
  }

  return nil;
}

static void LegendApplyWindowAppearance(NSWindow *window, NSString *value)
{
  if (![value isKindOfClass:NSString.class] || value.length == 0) {
    return;
  }

  window.appearance = LegendAppearanceForName(value);
  [window displayIfNeeded];
}

static void LegendApplyTitleVisibility(NSWindow *window, NSString *value)
{
  if (![value isKindOfClass:NSString.class] || value.length == 0) {
    return;
  }

  if ([value isEqualToString:@"hidden"]) {
    window.titleVisibility = NSWindowTitleHidden;
  } else if ([value isEqualToString:@"visible"]) {
    window.titleVisibility = NSWindowTitleVisible;
  }
}

static void LegendApplyToolbarStyle(NSWindow *window, NSString *value)
{
  if (![value isKindOfClass:NSString.class] || value.length == 0) {
    return;
  }

  if (@available(macOS 11.0, *)) {
    if ([value isEqualToString:@"automatic"]) {
      window.toolbarStyle = NSWindowToolbarStyleAutomatic;
    } else if ([value isEqualToString:@"expanded"]) {
      window.toolbarStyle = NSWindowToolbarStyleExpanded;
    } else if ([value isEqualToString:@"preference"]) {
      window.toolbarStyle = NSWindowToolbarStylePreference;
    } else if ([value isEqualToString:@"unified"]) {
      window.toolbarStyle = NSWindowToolbarStyleUnified;
    } else if ([value isEqualToString:@"unifiedCompact"]) {
      window.toolbarStyle = NSWindowToolbarStyleUnifiedCompact;
    }
  }
}

static void LegendApplyTitlebarSeparatorStyle(NSWindow *window, NSString *value)
{
  if (![value isKindOfClass:NSString.class] || value.length == 0) {
    return;
  }

  if (@available(macOS 11.0, *)) {
    if ([value isEqualToString:@"automatic"]) {
      window.titlebarSeparatorStyle = NSTitlebarSeparatorStyleAutomatic;
    } else if ([value isEqualToString:@"none"]) {
      window.titlebarSeparatorStyle = NSTitlebarSeparatorStyleNone;
    } else if ([value isEqualToString:@"line"]) {
      window.titlebarSeparatorStyle = NSTitlebarSeparatorStyleLine;
    } else if ([value isEqualToString:@"shadow"]) {
      window.titlebarSeparatorStyle = NSTitlebarSeparatorStyleShadow;
    }
  }
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
  NSScanner *scanner = [NSScanner scannerWithString:hex];
  if (![scanner scanHexLongLong:&raw]) {
    return nil;
  }

  CGFloat red = 0;
  CGFloat green = 0;
  CGFloat blue = 0;
  CGFloat alpha = 1;

  if (hex.length == 8) {
    red = ((raw >> 24) & 0xff) / 255.0;
    green = ((raw >> 16) & 0xff) / 255.0;
    blue = ((raw >> 8) & 0xff) / 255.0;
    alpha = (raw & 0xff) / 255.0;
  } else {
    red = ((raw >> 16) & 0xff) / 255.0;
    green = ((raw >> 8) & 0xff) / 255.0;
    blue = (raw & 0xff) / 255.0;
  }

  return [NSColor colorWithSRGBRed:red green:green blue:blue alpha:alpha];
}

static void LegendApplyBackgroundColorToView(NSView *view, NSColor *backgroundColor)
{
  if (!view || !backgroundColor) {
    return;
  }

  if ([view respondsToSelector:@selector(setBackgroundColor:)]) {
    [(id)view setBackgroundColor:backgroundColor];
  }
  view.wantsLayer = YES;
  view.layer.backgroundColor = backgroundColor.CGColor;
}

static BOOL LegendViewIsTitlebarContainer(NSView *view)
{
  NSString *className = NSStringFromClass(view.class);
  return [className isEqualToString:@"NSTitlebarContainerView"] ||
    [className isEqualToString:@"NSTitlebarView"] ||
    [className isEqualToString:@"NSTitlebarBackgroundView"];
}

static NSVisualEffectMaterial LegendVisualEffectMaterialForTitlebarMaterial(NSString *value)
{
  if ([value isEqualToString:@"hudWindow"]) {
    return NSVisualEffectMaterialHUDWindow;
  }
  if ([value isEqualToString:@"sidebar"]) {
    return NSVisualEffectMaterialSidebar;
  }
  if ([value isEqualToString:@"windowBackground"]) {
    return NSVisualEffectMaterialWindowBackground;
  }
  if ([value isEqualToString:@"titlebar"]) {
    return NSVisualEffectMaterialTitlebar;
  }
  if ([value isEqualToString:@"glass"] || [value isEqualToString:@"headerView"]) {
    if (@available(macOS 10.14, *)) {
      return NSVisualEffectMaterialHeaderView;
    }
    return NSVisualEffectMaterialTitlebar;
  }
  return NSVisualEffectMaterialTitlebar;
}

static NSVisualEffectBlendingMode LegendVisualEffectBlendingModeForName(NSString *value)
{
  return [value isEqualToString:@"withinWindow"] ? NSVisualEffectBlendingModeWithinWindow : NSVisualEffectBlendingModeBehindWindow;
}

static NSVisualEffectState LegendVisualEffectStateForName(NSString *value)
{
  if ([value isEqualToString:@"active"]) {
    return NSVisualEffectStateActive;
  }
  if ([value isEqualToString:@"inactive"]) {
    return NSVisualEffectStateInactive;
  }
  return NSVisualEffectStateFollowsWindowActiveState;
}

static NSRect LegendTitlebarMaterialFrame(NSWindow *window, NSView *frameView)
{
  NSRect frameBounds = frameView.bounds;
  NSRect contentLayoutRect = [frameView convertRect:window.contentLayoutRect fromView:nil];
  CGFloat materialMinY = NSMaxY(contentLayoutRect);
  CGFloat materialHeight = NSMaxY(frameBounds) - materialMinY;

  if (materialHeight <= 0 || materialHeight > NSHeight(frameBounds)) {
    materialHeight = MAX(0, NSHeight(window.frame) - NSHeight(window.contentLayoutRect));
    materialMinY = NSMaxY(frameBounds) - materialHeight;
  }

  return NSMakeRect(0, materialMinY, NSWidth(frameBounds), materialHeight);
}

API_AVAILABLE(macos(26.0))
static NSView *LegendCreateOverscannedGlassEffectView(NSRect frame)
{
  NSView *containerView = [[NSView alloc] initWithFrame:frame];
  containerView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  containerView.wantsLayer = YES;
  containerView.layer.backgroundColor = NSColor.clearColor.CGColor;
  containerView.layer.masksToBounds = YES;

  CGFloat overscan = 48;
  NSRect glassFrame = NSMakeRect(-overscan, 0, NSWidth(frame) + overscan, NSHeight(frame) + overscan);
  NSGlassEffectView *glassView = [[NSGlassEffectView alloc] initWithFrame:glassFrame];
  glassView.cornerRadius = 0;
  glassView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  glassView.wantsLayer = YES;
  glassView.layer.backgroundColor = NSColor.clearColor.CGColor;
  [containerView addSubview:glassView];

  return containerView;
}

static void LegendApplyTitlebarBackgroundColor(NSView *view, NSColor *backgroundColor)
{
  BOOL isTitlebarContainer = LegendViewIsTitlebarContainer(view);

  if (isTitlebarContainer) {
    LegendApplyBackgroundColorToView(view, backgroundColor);
  }

  for (NSView *subview in view.subviews) {
    LegendApplyTitlebarBackgroundColor(subview, backgroundColor);
  }
}

static BOOL LegendUsesFullSizeContentLayout(NSWindow *window);

static void LegendApplyWindowBackgroundColor(NSWindow *window, NSString *value)
{
  NSColor *backgroundColor = LegendColorFromHexString(value);
  if (!backgroundColor) {
    return;
  }

  window.backgroundColor = backgroundColor;
  window.opaque = backgroundColor.alphaComponent >= 1;

  NSView *contentView = window.contentView;
  if (contentView) {
    LegendApplyBackgroundColorToView(contentView, backgroundColor);
  }

  NSView *frameView = contentView.superview;
  if (frameView) {
    NSColor *titlebarBackgroundColor = LegendUsesFullSizeContentLayout(window) ? NSColor.clearColor : backgroundColor;
    LegendApplyTitlebarBackgroundColor(frameView, titlebarBackgroundColor);
    dispatch_async(dispatch_get_main_queue(), ^{
      NSView *currentFrameView = window.contentView.superview;
      if (currentFrameView) {
        LegendApplyTitlebarBackgroundColor(currentFrameView, titlebarBackgroundColor);
      }
    });
  }
}

static char LegendManagedRootViewKey;
static char LegendContentLayoutModeKey;
static char LegendTitlebarControlMetadataKey;
static char LegendToolbarControlMetadataKey;

static RCTUIView *LegendManagedRootView(NSWindow *window)
{
  id associatedRootView = objc_getAssociatedObject(window, &LegendManagedRootViewKey);
  if ([associatedRootView isKindOfClass:RCTUIView.class]) {
    return associatedRootView;
  }

  if ([window.contentView isKindOfClass:RCTUIView.class]) {
    return (RCTUIView *)window.contentView;
  }

  return nil;
}

static void LegendEnsureRootViewContainer(NSWindow *window, RCTUIView *rootView)
{
  if (!window || !rootView || window.contentView != rootView) {
    return;
  }

  NSView *containerView = [[NSView alloc] initWithFrame:rootView.frame];
  containerView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  LegendApplyBackgroundColorToView(containerView, window.backgroundColor);

  window.contentView = containerView;
  [containerView addSubview:rootView];
  objc_setAssociatedObject(window, &LegendManagedRootViewKey, rootView, OBJC_ASSOCIATION_ASSIGN);
}

static void LegendApplyContentLayoutModeOption(NSWindow *window, NSString *contentLayoutMode)
{
  if (!window || ![contentLayoutMode isKindOfClass:NSString.class]) {
    return;
  }

  objc_setAssociatedObject(window, &LegendContentLayoutModeKey, contentLayoutMode, OBJC_ASSOCIATION_COPY_NONATOMIC);
}

static BOOL LegendUsesFullSizeContentLayout(NSWindow *window)
{
  id contentLayoutMode = objc_getAssociatedObject(window, &LegendContentLayoutModeKey);
  return [contentLayoutMode isKindOfClass:NSString.class] && [(NSString *)contentLayoutMode isEqualToString:@"fullSize"];
}

static void LegendPrepareWindowForDisplay(NSWindow *window, NSString *backgroundColor)
{
  LegendApplyWindowBackgroundColor(window, backgroundColor);
  [window.contentView displayIfNeeded];
  [window displayIfNeeded];
}

static void LegendApplyContentLayoutMode(NSWindow *window, NSNumber *maskNumber, BOOL usesTitlebarBackground)
{
  if (usesTitlebarBackground) {
    window.styleMask = window.styleMask | NSWindowStyleMaskFullSizeContentView;
    return;
  }

  if (maskNumber && (maskNumber.unsignedIntegerValue & NSWindowStyleMaskFullSizeContentView) == 0) {
    window.styleMask = window.styleMask & ~NSWindowStyleMaskFullSizeContentView;
  }
}

static BOOL LegendDictionaryHasKey(NSDictionary *dictionary, NSString *key)
{
  return [dictionary isKindOfClass:NSDictionary.class] && dictionary[key] != nil;
}

static void LegendSizeRootViewToWindow(RCTUIView *rootView, NSWindow *window);

static NSURL *LegendURLFromString(NSString *value)
{
  if (![value isKindOfClass:NSString.class] || value.length == 0) {
    return nil;
  }

  NSURL *url = [NSURL URLWithString:value];
  if (url.scheme.length > 0) {
    return url;
  }

  return [NSURL fileURLWithPath:value];
}

static void LegendApplyWindowTitleAndRepresentedURL(NSWindow *window,
                                                    NSString *title,
                                                    BOOL hasRepresentedURL,
                                                    id representedURLValue,
                                                    NSString *fallbackTitle)
{
  NSURL *representedURL = [representedURLValue isKindOfClass:NSString.class]
    ? LegendURLFromString((NSString *)representedURLValue)
    : nil;

  if (hasRepresentedURL) {
    if ([representedURLValue isKindOfClass:NSNull.class]) {
      window.representedURL = nil;
    } else if (representedURL.fileURL && representedURL.path.length > 0) {
      [window setTitleWithRepresentedFilename:representedURL.path];
      window.representedURL = representedURL;
      return;
    } else {
      window.representedURL = representedURL;
    }
  }

  if (!title && representedURL.lastPathComponent.length > 0) {
    title = representedURL.lastPathComponent;
  }
  window.title = title ?: fallbackTitle ?: @"";
}

static void LegendApplyWindowOptions(NSWindow *window, NSDictionary *options)
{
  if (!window || ![options isKindOfClass:NSDictionary.class]) {
    return;
  }

  BOOL hasTitle = LegendDictionaryHasKey(options, @"title");
  BOOL hasRepresentedURL = LegendDictionaryHasKey(options, @"representedURL");
  id representedURLValue = hasRepresentedURL ? options[@"representedURL"] : nil;
  NSString *title = [options[@"title"] isKindOfClass:NSString.class] ? options[@"title"] : nil;
  if (hasTitle || hasRepresentedURL) {
    LegendApplyWindowTitleAndRepresentedURL(window, title, hasRepresentedURL, representedURLValue, nil);
  }

  NSDictionary *windowStyle = [options[@"windowStyle"] isKindOfClass:NSDictionary.class] ? options[@"windowStyle"] : @{};
  NSNumber *maskNumber = [windowStyle[@"mask"] isKindOfClass:NSNumber.class] ? windowStyle[@"mask"] : nil;
  NSNumber *transparentTitlebar = [windowStyle[@"titlebarAppearsTransparent"] isKindOfClass:NSNumber.class]
    ? windowStyle[@"titlebarAppearsTransparent"]
    : nil;
  NSString *titleVisibility = [windowStyle[@"titleVisibility"] isKindOfClass:NSString.class]
    ? windowStyle[@"titleVisibility"]
    : nil;
  NSString *toolbarStyle = [windowStyle[@"toolbarStyle"] isKindOfClass:NSString.class] ? windowStyle[@"toolbarStyle"] : nil;
  NSString *contentLayoutMode = [windowStyle[@"contentLayoutMode"] isKindOfClass:NSString.class]
    ? windowStyle[@"contentLayoutMode"]
    : nil;
  NSString *titlebarSeparatorStyle = [windowStyle[@"titlebarSeparatorStyle"] isKindOfClass:NSString.class]
    ? windowStyle[@"titlebarSeparatorStyle"]
    : nil;
  NSString *backgroundColor = [windowStyle[@"backgroundColor"] isKindOfClass:NSString.class]
    ? windowStyle[@"backgroundColor"]
    : nil;
  NSString *appearance = [windowStyle[@"appearance"] isKindOfClass:NSString.class]
    ? windowStyle[@"appearance"]
    : nil;
  BOOL hasToolbarKey = LegendDictionaryHasKey(windowStyle, @"hasToolbar");
  BOOL hasToolbar = [windowStyle[@"hasToolbar"] boolValue];
  BOOL usesTitlebarBackground = transparentTitlebar.boolValue && backgroundColor.length > 0;

  if (maskNumber) {
    window.styleMask = maskNumber.unsignedIntegerValue;
  }
  LegendApplyContentLayoutModeOption(window, contentLayoutMode);
  LegendApplyContentLayoutMode(window, maskNumber, usesTitlebarBackground);
  if (transparentTitlebar != nil) {
    window.titlebarAppearsTransparent = transparentTitlebar.boolValue;
  }
  LegendApplyTitleVisibility(window, titleVisibility);
  if (hasToolbarKey) {
    if (hasToolbar && !window.toolbar) {
      NSToolbar *toolbar = [[NSToolbar alloc] initWithIdentifier:@"LegendMainWindowToolbar"];
      toolbar.displayMode = NSToolbarDisplayModeIconOnly;
      toolbar.showsBaselineSeparator = NO;
      window.toolbar = toolbar;
    } else if (!hasToolbar) {
      window.toolbar = nil;
    }
  }
  LegendApplyToolbarStyle(window, toolbarStyle);
  LegendApplyTitlebarSeparatorStyle(window, titlebarSeparatorStyle);
  LegendApplyWindowAppearance(window, appearance);
  LegendApplyWindowBackgroundColor(window, backgroundColor);

  RCTUIView *rootView = LegendManagedRootView(window);
  if (usesTitlebarBackground && rootView) {
    LegendEnsureRootViewContainer(window, rootView);
    LegendSizeRootViewToWindow(rootView, window);
  }
}

static void LegendSizeRootViewToWindow(RCTUIView *rootView, NSWindow *window)
{
  if (!rootView || !window) {
    return;
  }

  NSView *contentView = window.contentView;
  if (contentView && contentView != rootView && (window.styleMask & NSWindowStyleMaskFullSizeContentView) != 0) {
    rootView.frame = LegendUsesFullSizeContentLayout(window)
      ? contentView.bounds
      : [contentView convertRect:window.contentLayoutRect fromView:nil];
  } else {
    rootView.frame = contentView ? contentView.bounds : NSMakeRect(0, 0, window.frame.size.width, window.frame.size.height);
  }
  rootView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  [rootView setNeedsLayout:YES];
}
#endif

@interface RNWindowManager ()
#if TARGET_OS_OSX
<NSWindowDelegate, NSSearchFieldDelegate, NSToolbarDelegate>
#endif
@property (nonatomic, strong) NSMutableDictionary<NSString *, id> *windows;
@property (nonatomic, strong) NSMutableDictionary<NSString *, RCTUIView *> *rootViews;
@property (nonatomic, strong) NSMutableDictionary<NSString *, NSString *> *moduleNames;
@property (nonatomic, strong) NSMutableDictionary<NSString *, NSArray<NSTitlebarAccessoryViewController *> *> *titlebarAccessoryControllers;
@property (nonatomic, strong) NSMutableDictionary<NSString *, NSView *> *titlebarMaterialViews;
@property (nonatomic, strong) NSMutableDictionary<NSString *, NSArray<NSDictionary *> *> *toolbarItemConfigs;
@property (nonatomic, strong) NSMutableDictionary<NSString *, CIFilter *> *windowBlurFilters;
@property (nonatomic, strong) NSMutableSet<NSString *> *closeRequestIdentifiers;
@property (nonatomic, assign) BOOL hasListeners;
@property (nonatomic, assign) BOOL mainWindowObserversInstalled;
@end

@implementation RNWindowManager

RCT_EXPORT_MODULE(NativeWindowManager)

+ (BOOL)requiresMainQueueSetup
{
  return YES;
}

- (instancetype)init
{
  if (self = [super init]) {
    _windows = [NSMutableDictionary new];
    _rootViews = [NSMutableDictionary new];
    _moduleNames = [NSMutableDictionary new];
    _titlebarAccessoryControllers = [NSMutableDictionary new];
    _titlebarMaterialViews = [NSMutableDictionary new];
    _toolbarItemConfigs = [NSMutableDictionary new];
    _windowBlurFilters = [NSMutableDictionary new];
    _closeRequestIdentifiers = [NSMutableSet new];
#if TARGET_OS_OSX
    [NSNotificationCenter.defaultCenter addObserver:self
                                           selector:@selector(applicationReopenRequested:)
                                               name:LegendApplicationReopenRequestedNotification
                                             object:nil];
#endif
  }
  return self;
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[
    @"onWindowClosed",
    @"onWindowCloseRequested",
    @"onMainWindowMoved",
    @"onMainWindowResized",
    @"onWindowMoved",
    @"onWindowResized",
    @"onApplicationReopenRequested",
    @"onWindowFocused",
    @"onTitlebarControlPressed",
    @"onToolbarItemSelected",
    @"onToolbarSearch",
  ];
}

- (void)startObserving
{
  self.hasListeners = YES;
#if TARGET_OS_OSX
  [self setupMainWindowObservers];
  [NSNotificationCenter.defaultCenter addObserver:self
                                         selector:@selector(windowDidBecomeKey:)
                                             name:NSWindowDidBecomeKeyNotification
                                           object:nil];
#endif
}

- (void)stopObserving
{
  self.hasListeners = NO;
#if TARGET_OS_OSX
  [NSNotificationCenter.defaultCenter removeObserver:self];
  self.mainWindowObserversInstalled = NO;
#endif
}

- (dispatch_queue_t)methodQueue
{
  return dispatch_get_main_queue();
}

- (std::shared_ptr<facebook::react::TurboModule>)getTurboModule:
    (const facebook::react::ObjCTurboModule::InitParams &)params
{
  return std::make_shared<facebook::react::NativeWindowManagerSpecJSI>(params);
}

- (NSDictionary *)parseObjectJSON:(NSString *)json
{
  NSData *data = [json dataUsingEncoding:NSUTF8StringEncoding];
  if (!data) {
    return @{};
  }

  id value = [NSJSONSerialization JSONObjectWithData:data options:0 error:nil];
  return [value isKindOfClass:NSDictionary.class] ? value : @{};
}

- (NSString *)jsonStringFromObject:(id)object
{
  id value = object ?: [NSNull null];
  NSData *data = [NSJSONSerialization dataWithJSONObject:value options:0 error:nil];
  return data ? [[NSString alloc] initWithData:data encoding:NSUTF8StringEncoding] : @"null";
}

#if TARGET_OS_OSX
- (void)removeTitlebarMaterialForIdentifier:(NSString *)identifier
{
  NSView *materialView = self.titlebarMaterialViews[identifier];
  [materialView removeFromSuperview];
  [self.titlebarMaterialViews removeObjectForKey:identifier];
}

- (NSView *)createTitlebarMaterialView:(NSString *)material frame:(NSRect)frame
{
  if ([material isEqualToString:@"glass"]) {
    if (@available(macOS 26.0, *)) {
      return LegendCreateOverscannedGlassEffectView(frame);
    }
  }

  NSVisualEffectView *effectView = [[NSVisualEffectView alloc] initWithFrame:frame];
  effectView.material = LegendVisualEffectMaterialForTitlebarMaterial(material);
  effectView.blendingMode = NSVisualEffectBlendingModeBehindWindow;
  effectView.state = NSVisualEffectStateFollowsWindowActiveState;
  effectView.autoresizingMask = NSViewWidthSizable | NSViewHeightSizable;
  effectView.wantsLayer = YES;
  effectView.layer.backgroundColor = NSColor.clearColor.CGColor;
  return effectView;
}

- (void)applyTitlebarMaterialFromOptions:(NSDictionary *)options toWindow:(NSWindow *)window identifier:(NSString *)identifier
{
  NSDictionary *windowStyle = [options[@"windowStyle"] isKindOfClass:NSDictionary.class] ? options[@"windowStyle"] : @{};
  if (!LegendDictionaryHasKey(windowStyle, @"titlebarMaterial")) {
    return;
  }

  NSString *material = [windowStyle[@"titlebarMaterial"] isKindOfClass:NSString.class] ? windowStyle[@"titlebarMaterial"] : nil;
  [self removeTitlebarMaterialForIdentifier:identifier];

  if (material.length == 0 || [material isEqualToString:@"none"]) {
    return;
  }

  NSView *frameView = window.contentView.superview;
  if (!frameView) {
    return;
  }

  NSView *materialView = [self createTitlebarMaterialView:material frame:LegendTitlebarMaterialFrame(window, frameView)];
  if ([materialView isKindOfClass:NSVisualEffectView.class]) {
    NSVisualEffectView *effectView = (NSVisualEffectView *)materialView;
    NSString *blendingMode = [windowStyle[@"titlebarMaterialBlendingMode"] isKindOfClass:NSString.class]
      ? windowStyle[@"titlebarMaterialBlendingMode"]
      : nil;
    NSString *state = [windowStyle[@"titlebarMaterialState"] isKindOfClass:NSString.class]
      ? windowStyle[@"titlebarMaterialState"]
      : nil;
    effectView.blendingMode = LegendVisualEffectBlendingModeForName(blendingMode);
    effectView.state = LegendVisualEffectStateForName(state);
  }

  materialView.translatesAutoresizingMaskIntoConstraints = YES;
  materialView.autoresizingMask = NSViewWidthSizable | NSViewMinYMargin;
  [frameView addSubview:materialView positioned:NSWindowAbove relativeTo:window.contentView];
  self.titlebarMaterialViews[identifier] = materialView;
}

- (void)removeTitlebarControlsForIdentifier:(NSString *)identifier fromWindow:(NSWindow *)window
{
  NSArray<NSTitlebarAccessoryViewController *> *controllers = self.titlebarAccessoryControllers[identifier] ?: @[];
  for (NSTitlebarAccessoryViewController *controller in controllers) {
    NSUInteger index = [window.titlebarAccessoryViewControllers indexOfObjectIdenticalTo:controller];
    if (index != NSNotFound) {
      [window removeTitlebarAccessoryViewControllerAtIndex:index];
    }
  }
  [self.titlebarAccessoryControllers removeObjectForKey:identifier];
}

- (void)applyTitlebarControlsFromOptions:(NSDictionary *)options toWindow:(NSWindow *)window identifier:(NSString *)identifier
{
  NSDictionary *windowStyle = [options[@"windowStyle"] isKindOfClass:NSDictionary.class] ? options[@"windowStyle"] : @{};
  if (!LegendDictionaryHasKey(windowStyle, @"titlebarControls")) {
    return;
  }

  [self removeTitlebarControlsForIdentifier:identifier fromWindow:window];

  NSArray *titlebarControls = [windowStyle[@"titlebarControls"] isKindOfClass:NSArray.class]
    ? windowStyle[@"titlebarControls"]
    : @[];
  NSMutableArray<NSTitlebarAccessoryViewController *> *controllers = [NSMutableArray new];

  for (id controlCandidate in titlebarControls) {
    if (![controlCandidate isKindOfClass:NSDictionary.class]) {
      continue;
    }

    NSDictionary *control = (NSDictionary *)controlCandidate;
    NSString *type = [control[@"type"] isKindOfClass:NSString.class] ? control[@"type"] : nil;
    NSString *controlId = [control[@"id"] isKindOfClass:NSString.class] ? control[@"id"] : nil;
    if (![type isEqualToString:@"button"] || controlId.length == 0) {
      continue;
    }

    NSString *label = [control[@"label"] isKindOfClass:NSString.class] ? control[@"label"] : controlId;
    NSString *systemImageName = [control[@"systemImageName"] isKindOfClass:NSString.class] ? control[@"systemImageName"] : nil;
    NSImage *image = nil;
    if (systemImageName.length > 0) {
      if (@available(macOS 11.0, *)) {
        image = [NSImage imageWithSystemSymbolName:systemImageName accessibilityDescription:label];
      }
    }

    NSSegmentedControl *segmentedControl = [[NSSegmentedControl alloc] initWithFrame:NSZeroRect];
    segmentedControl.segmentCount = 1;
    segmentedControl.segmentStyle = NSSegmentStyleSeparated;
    segmentedControl.trackingMode = NSSegmentSwitchTrackingMomentary;
    segmentedControl.target = self;
    segmentedControl.action = @selector(titlebarControlPressed:);
    segmentedControl.controlSize = NSControlSizeRegular;
    [segmentedControl setEnabled:LegendDictionaryHasKey(control, @"enabled") ? [control[@"enabled"] boolValue] : YES forSegment:0];
    if (image) {
      [segmentedControl setImage:image forSegment:0];
      [segmentedControl setImageScaling:NSImageScaleProportionallyDown forSegment:0];
    } else {
      [segmentedControl setLabel:label forSegment:0];
    }
    if (@available(macOS 10.13, *)) {
      [segmentedControl setToolTip:[control[@"tooltip"] isKindOfClass:NSString.class] ? control[@"tooltip"] : label forSegment:0];
    }
    CGFloat segmentWidth = image ? 36 : MAX(84, [label sizeWithAttributes:@{NSFontAttributeName: segmentedControl.font ?: [NSFont systemFontOfSize:NSFont.systemFontSize]}].width + 24);
    [segmentedControl setWidth:segmentWidth forSegment:0];
    segmentedControl.frame = NSMakeRect(0, 0, segmentWidth, MAX(28, segmentedControl.fittingSize.height));
    objc_setAssociatedObject(segmentedControl, &LegendTitlebarControlMetadataKey, @{
      @"controlId": controlId,
      @"windowIdentifier": identifier ?: @"",
    }, OBJC_ASSOCIATION_RETAIN_NONATOMIC);

    NSTitlebarAccessoryViewController *controller = [NSTitlebarAccessoryViewController new];
    controller.view = segmentedControl;
    NSString *placement = [control[@"placement"] isKindOfClass:NSString.class] ? control[@"placement"] : @"left";
    controller.layoutAttribute = [placement isEqualToString:@"right"] ? NSLayoutAttributeRight : NSLayoutAttributeLeft;
    [window addTitlebarAccessoryViewController:controller];
    [controllers addObject:controller];
  }

  self.titlebarAccessoryControllers[identifier] = controllers;
}

- (void)titlebarControlPressed:(id)sender
{
  id metadata = objc_getAssociatedObject(sender, &LegendTitlebarControlMetadataKey);
  NSDictionary *representedObject = [metadata isKindOfClass:NSDictionary.class]
    ? metadata
    : @{};
  NSString *identifier = [representedObject[@"windowIdentifier"] isKindOfClass:NSString.class]
    ? representedObject[@"windowIdentifier"]
    : @"";
  NSString *controlId = [representedObject[@"controlId"] isKindOfClass:NSString.class]
    ? representedObject[@"controlId"]
    : @"";

  [self sendWindowEventWithName:@"onTitlebarControlPressed"
                           body:@{@"identifier": identifier, @"controlId": controlId}];
}

- (NSString *)toolbarItemIdentifierForConfig:(NSDictionary *)config
{
  NSString *itemId = [config[@"id"] isKindOfClass:NSString.class] ? config[@"id"] : nil;
  return itemId.length > 0 ? [@"legend.toolbar." stringByAppendingString:itemId] : nil;
}

- (NSDictionary *)toolbarItemConfigForIdentifier:(NSToolbarItemIdentifier)itemIdentifier toolbar:(NSToolbar *)toolbar
{
  if (![itemIdentifier hasPrefix:@"legend.toolbar."]) {
    return nil;
  }

  NSArray<NSDictionary *> *configs = self.toolbarItemConfigs[toolbar.identifier] ?: @[];
  for (NSDictionary *config in configs) {
    NSString *configIdentifier = [self toolbarItemIdentifierForConfig:config];
    if ([configIdentifier isEqualToString:itemIdentifier]) {
      return config;
    }
  }
  return nil;
}

- (NSArray<NSToolbarItemIdentifier> *)toolbarItemIdentifiersForToolbar:(NSToolbar *)toolbar
{
  NSMutableArray<NSToolbarItemIdentifier> *leadingIdentifiers = [NSMutableArray new];
  NSMutableArray<NSToolbarItemIdentifier> *trailingIdentifiers = [NSMutableArray new];
  NSArray<NSDictionary *> *configs = self.toolbarItemConfigs[toolbar.identifier] ?: @[];
  for (NSDictionary *config in configs) {
    NSString *itemIdentifier = [self toolbarItemIdentifierForConfig:config];
    if (itemIdentifier.length > 0) {
      NSString *placement = [config[@"placement"] isKindOfClass:NSString.class] ? config[@"placement"] : @"trailing";
      if ([placement isEqualToString:@"leading"]) {
        [leadingIdentifiers addObject:itemIdentifier];
      } else {
        [trailingIdentifiers addObject:itemIdentifier];
      }
    }
  }
  NSMutableArray<NSToolbarItemIdentifier> *identifiers = [NSMutableArray new];
  [identifiers addObjectsFromArray:leadingIdentifiers];
  [identifiers addObject:NSToolbarFlexibleSpaceItemIdentifier];
  [identifiers addObjectsFromArray:trailingIdentifiers];
  return identifiers;
}

- (NSToolbar *)ensureToolbarForWindow:(NSWindow *)window identifier:(NSString *)identifier
{
  NSToolbar *toolbar = window.toolbar;
  if (!toolbar) {
    toolbar = [[NSToolbar alloc] initWithIdentifier:identifier ?: @"LegendWindowToolbar"];
    toolbar.displayMode = NSToolbarDisplayModeIconOnly;
    toolbar.showsBaselineSeparator = NO;
    window.toolbar = toolbar;
  }
  toolbar.delegate = self;
  toolbar.allowsUserCustomization = NO;
  toolbar.autosavesConfiguration = NO;
  return toolbar;
}

- (void)applyToolbarItemsFromOptions:(NSDictionary *)options toWindow:(NSWindow *)window identifier:(NSString *)identifier
{
  NSDictionary *windowStyle = [options[@"windowStyle"] isKindOfClass:NSDictionary.class] ? options[@"windowStyle"] : @{};
  if (!LegendDictionaryHasKey(windowStyle, @"toolbarItems")) {
    return;
  }

  NSArray *toolbarItems = [windowStyle[@"toolbarItems"] isKindOfClass:NSArray.class] ? windowStyle[@"toolbarItems"] : @[];
  NSToolbar *toolbar = [self ensureToolbarForWindow:window identifier:identifier];
  NSMutableArray<NSDictionary *> *configs = [NSMutableArray new];
  for (id item in toolbarItems) {
    if ([item isKindOfClass:NSDictionary.class]) {
      [configs addObject:item];
    }
  }
  self.toolbarItemConfigs[toolbar.identifier] = configs;

  while (toolbar.items.count > 0) {
    [toolbar removeItemAtIndex:toolbar.items.count - 1];
  }
  for (NSToolbarItemIdentifier itemIdentifier in [self toolbarDefaultItemIdentifiers:toolbar]) {
    [toolbar insertItemWithItemIdentifier:itemIdentifier atIndex:toolbar.items.count];
  }
}

- (NSArray<NSToolbarItemIdentifier> *)toolbarAllowedItemIdentifiers:(NSToolbar *)toolbar
{
  NSMutableArray<NSToolbarItemIdentifier> *identifiers = [[self toolbarItemIdentifiersForToolbar:toolbar] mutableCopy];
  [identifiers addObject:NSToolbarSpaceItemIdentifier];
  return identifiers;
}

- (NSArray<NSToolbarItemIdentifier> *)toolbarDefaultItemIdentifiers:(NSToolbar *)toolbar
{
  return [self toolbarItemIdentifiersForToolbar:toolbar];
}

- (NSArray<NSToolbarItemIdentifier> *)toolbarSelectableItemIdentifiers:(NSToolbar *)toolbar
{
  return @[];
}

- (NSToolbarItem *)toolbar:(NSToolbar *)toolbar
    itemForItemIdentifier:(NSToolbarItemIdentifier)itemIdentifier
willBeInsertedIntoToolbar:(BOOL)flag
{
  NSDictionary *config = [self toolbarItemConfigForIdentifier:itemIdentifier toolbar:toolbar];
  if (!config) {
    return nil;
  }

  NSString *type = [config[@"type"] isKindOfClass:NSString.class] ? config[@"type"] : nil;
  if ([type isEqualToString:@"button"] || [type isEqualToString:@"menuButton"]) {
    NSString *itemId = [config[@"id"] isKindOfClass:NSString.class] ? config[@"id"] : @"";
    NSString *label = [config[@"label"] isKindOfClass:NSString.class] ? config[@"label"] : itemId;
    NSString *tooltip = [config[@"tooltip"] isKindOfClass:NSString.class] ? config[@"tooltip"] : label;
    NSString *systemImageName = [config[@"systemImageName"] isKindOfClass:NSString.class] ? config[@"systemImageName"] : nil;
    NSImage *image = nil;
    if (systemImageName.length > 0) {
      if (@available(macOS 11.0, *)) {
        image = [NSImage imageWithSystemSymbolName:systemImageName accessibilityDescription:label];
      }
    }
    NSArray *menuItems = [config[@"menuItems"] isKindOfClass:NSArray.class] ? config[@"menuItems"] : @[];
    BOOL isMenuButton = [type isEqualToString:@"menuButton"] || menuItems.count > 0;

    NSToolbarItem *toolbarItem = [[NSToolbarItem alloc] initWithItemIdentifier:itemIdentifier];
    toolbarItem.label = label;
    toolbarItem.paletteLabel = label;
    toolbarItem.toolTip = tooltip;
    toolbarItem.enabled = LegendDictionaryHasKey(config, @"enabled") ? [config[@"enabled"] boolValue] : YES;
    NSString *placement = [config[@"placement"] isKindOfClass:NSString.class] ? config[@"placement"] : @"trailing";
    if (@available(macOS 10.15, *)) {
      toolbarItem.bordered = LegendDictionaryHasKey(config, @"bordered") ? [config[@"bordered"] boolValue] : YES;
    }
    if (@available(macOS 11.0, *)) {
      toolbarItem.navigational = [placement isEqualToString:@"leading"];
    }
    NSDictionary *metadata = @{
      @"itemId": itemId,
      @"menuItems": menuItems,
      @"value": [config[@"value"] isKindOfClass:NSString.class] ? config[@"value"] : @"",
      @"windowIdentifier": toolbar.identifier ?: @"",
    };
    if (isMenuButton) {
      NSButton *button = [NSButton buttonWithTitle:label target:self action:@selector(toolbarButtonItemPressed:)];
      button.bezelStyle = NSBezelStyleRounded;
      button.controlSize = NSControlSizeRegular;
      button.enabled = toolbarItem.enabled;
      button.toolTip = tooltip;
      if (image) {
        button.image = image;
        button.imagePosition = NSImageLeft;
      }
      NSFont *font = button.font ?: [NSFont systemFontOfSize:NSFont.systemFontSize];
      CGFloat buttonWidth = MAX(148, [label sizeWithAttributes:@{NSFontAttributeName: font}].width + (image ? 64 : 52));
      button.frame = NSMakeRect(0, 0, buttonWidth, MAX(28, button.fittingSize.height));
      objc_setAssociatedObject(button, &LegendToolbarControlMetadataKey, metadata, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
      toolbarItem.view = button;
    } else {
      toolbarItem.image = image;
      toolbarItem.target = self;
      toolbarItem.action = @selector(toolbarButtonItemPressed:);
      objc_setAssociatedObject(toolbarItem, &LegendToolbarControlMetadataKey, metadata, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
    }
    return toolbarItem;
  }

  if ([type isEqualToString:@"search"]) {
    NSString *itemId = [config[@"id"] isKindOfClass:NSString.class] ? config[@"id"] : @"";
    NSString *label = [config[@"label"] isKindOfClass:NSString.class] ? config[@"label"] : itemId;
    NSString *placeholder = [config[@"placeholder"] isKindOfClass:NSString.class] ? config[@"placeholder"] : @"Search";
    NSString *value = [config[@"value"] isKindOfClass:NSString.class] ? config[@"value"] : @"";
    NSNumber *widthNumber = [config[@"width"] isKindOfClass:NSNumber.class] ? config[@"width"] : nil;
    CGFloat width = widthNumber ? widthNumber.doubleValue : 240;
    NSDictionary *metadata = @{
      @"itemId": itemId,
      @"windowIdentifier": toolbar.identifier ?: @"",
    };

    NSSearchField *searchField = nil;
    NSToolbarItem *toolbarItem = nil;
    if (@available(macOS 11.0, *)) {
      NSSearchToolbarItem *searchToolbarItem = [[NSSearchToolbarItem alloc] initWithItemIdentifier:itemIdentifier];
      searchField = searchToolbarItem.searchField;
      toolbarItem = searchToolbarItem;
    } else {
      searchField = [[NSSearchField alloc] initWithFrame:NSMakeRect(0, 0, width, 28)];
      toolbarItem = [[NSToolbarItem alloc] initWithItemIdentifier:itemIdentifier];
      toolbarItem.view = searchField;
    }

    searchField.placeholderString = placeholder;
    searchField.stringValue = value;
    searchField.delegate = self;
    searchField.target = self;
    searchField.action = @selector(toolbarSearchSubmitted:);
    searchField.enabled = LegendDictionaryHasKey(config, @"enabled") ? [config[@"enabled"] boolValue] : YES;
    searchField.controlSize = NSControlSizeRegular;
    objc_setAssociatedObject(searchField, &LegendToolbarControlMetadataKey, metadata, OBJC_ASSOCIATION_RETAIN_NONATOMIC);

    toolbarItem.label = label;
    toolbarItem.paletteLabel = label;
    toolbarItem.toolTip = placeholder;
    toolbarItem.enabled = searchField.enabled;
    toolbarItem.minSize = NSMakeSize(MIN(width, 120), 28);
    toolbarItem.maxSize = NSMakeSize(width, 28);
    return toolbarItem;
  }

  if (![type isEqualToString:@"segmented"]) {
    return nil;
  }

  NSArray *segments = [config[@"segments"] isKindOfClass:NSArray.class] ? config[@"segments"] : @[];
  NSMutableArray<NSString *> *labels = [NSMutableArray new];
  NSMutableArray<NSString *> *systemImageNames = [NSMutableArray new];
  NSMutableArray<NSString *> *values = [NSMutableArray new];
  NSInteger selectedSegment = -1;
  NSString *selectedValue = [config[@"selectedValue"] isKindOfClass:NSString.class] ? config[@"selectedValue"] : nil;

  for (id segment in segments) {
    if ([segment isKindOfClass:NSDictionary.class]) {
      NSDictionary *segmentConfig = (NSDictionary *)segment;
      NSString *label = [segmentConfig[@"label"] isKindOfClass:NSString.class] ? segmentConfig[@"label"] : @"";
      NSString *value = [segmentConfig[@"value"] isKindOfClass:NSString.class] ? segmentConfig[@"value"] : label;
      if (label.length > 0 && value.length > 0) {
        NSString *systemImageName = [segmentConfig[@"systemImageName"] isKindOfClass:NSString.class]
          ? segmentConfig[@"systemImageName"]
          : @"";
        if ([value isEqualToString:selectedValue]) {
          selectedSegment = values.count;
        }
        [labels addObject:label];
        [systemImageNames addObject:systemImageName];
        [values addObject:value];
      }
    }
  }

  if (labels.count == 0) {
    return nil;
  }

  NSSegmentedControl *control = [[NSSegmentedControl alloc] initWithFrame:NSZeroRect];
  control.segmentCount = labels.count;
  control.trackingMode = NSSegmentSwitchTrackingSelectOne;
  control.target = self;
  control.action = @selector(toolbarSegmentedControlChanged:);
  control.controlSize = NSControlSizeRegular;
  control.segmentStyle = NSSegmentStyleAutomatic;
  control.selectedSegment = selectedSegment >= 0 ? selectedSegment : 0;

  CGFloat totalWidth = 0;
  for (NSInteger index = 0; index < labels.count; index += 1) {
    NSString *systemImageName = systemImageNames[index];
    NSImage *image = nil;
    if (systemImageName.length > 0) {
      if (@available(macOS 11.0, *)) {
        image = [NSImage imageWithSystemSymbolName:systemImageName accessibilityDescription:labels[index]];
      }
    }
    if (image) {
      [control setImage:image forSegment:index];
      [control setToolTip:labels[index] forSegment:index];
    } else {
      [control setLabel:labels[index] forSegment:index];
    }

    NSFont *font = control.font ?: [NSFont systemFontOfSize:NSFont.systemFontSize];
    CGFloat width = image ? 38 : MAX(76, [labels[index] sizeWithAttributes:@{NSFontAttributeName: font}].width + 28);
    [control setWidth:width forSegment:index];
    totalWidth += width;
  }

  NSString *itemId = [config[@"id"] isKindOfClass:NSString.class] ? config[@"id"] : @"";
  objc_setAssociatedObject(control, &LegendToolbarControlMetadataKey, @{
    @"itemId": itemId,
    @"values": values,
    @"windowIdentifier": toolbar.identifier ?: @"",
  }, OBJC_ASSOCIATION_RETAIN_NONATOMIC);
  control.frame = NSMakeRect(0, 0, totalWidth, control.fittingSize.height);

  NSToolbarItem *toolbarItem = [[NSToolbarItem alloc] initWithItemIdentifier:itemIdentifier];
  toolbarItem.view = control;
  toolbarItem.label = [config[@"label"] isKindOfClass:NSString.class] ? config[@"label"] : itemId;
  toolbarItem.paletteLabel = toolbarItem.label;
  return toolbarItem;
}

- (void)toolbarMenuItemSelected:(NSMenuItem *)sender
{
  NSDictionary *representedObject = [sender.representedObject isKindOfClass:NSDictionary.class]
    ? sender.representedObject
    : @{};
  NSString *identifier = [representedObject[@"windowIdentifier"] isKindOfClass:NSString.class]
    ? representedObject[@"windowIdentifier"]
    : @"";
  NSString *itemId = [representedObject[@"itemId"] isKindOfClass:NSString.class]
    ? representedObject[@"itemId"]
    : @"";
  NSString *value = [representedObject[@"value"] isKindOfClass:NSString.class]
    ? representedObject[@"value"]
    : @"";

  [self sendWindowEventWithName:@"onToolbarItemSelected"
                           body:@{@"identifier": identifier, @"itemId": itemId, @"value": value}];
}

- (void)toolbarButtonItemPressed:(id)sender
{
  id metadata = objc_getAssociatedObject(sender, &LegendToolbarControlMetadataKey);
  NSDictionary *representedObject = [metadata isKindOfClass:NSDictionary.class]
    ? metadata
    : @{};
  NSString *identifier = [representedObject[@"windowIdentifier"] isKindOfClass:NSString.class]
    ? representedObject[@"windowIdentifier"]
    : @"";
  NSString *itemId = [representedObject[@"itemId"] isKindOfClass:NSString.class]
    ? representedObject[@"itemId"]
    : @"";
  NSString *value = [representedObject[@"value"] isKindOfClass:NSString.class]
    ? representedObject[@"value"]
    : @"";
  NSArray *menuItems = [representedObject[@"menuItems"] isKindOfClass:NSArray.class]
    ? representedObject[@"menuItems"]
    : @[];

  if (menuItems.count > 0) {
    NSMenu *menu = [NSMenu new];
    menu.autoenablesItems = NO;
    for (id itemCandidate in menuItems) {
      if (![itemCandidate isKindOfClass:NSDictionary.class]) {
        continue;
      }
      NSDictionary *itemConfig = (NSDictionary *)itemCandidate;
      if (LegendDictionaryHasKey(itemConfig, @"separator") && [itemConfig[@"separator"] boolValue]) {
        [menu addItem:NSMenuItem.separatorItem];
        continue;
      }
      NSString *itemLabel = [itemConfig[@"label"] isKindOfClass:NSString.class] ? itemConfig[@"label"] : @"";
      NSString *itemValue = [itemConfig[@"value"] isKindOfClass:NSString.class] ? itemConfig[@"value"] : @"";
      if (itemLabel.length == 0 || itemValue.length == 0) {
        continue;
      }
      NSMenuItem *item = [[NSMenuItem alloc] initWithTitle:itemLabel action:@selector(toolbarMenuItemSelected:) keyEquivalent:@""];
      item.target = self;
      item.enabled = LegendDictionaryHasKey(itemConfig, @"enabled") ? [itemConfig[@"enabled"] boolValue] : YES;
      item.state = LegendDictionaryHasKey(itemConfig, @"selected") && [itemConfig[@"selected"] boolValue] ? NSControlStateValueOn : NSControlStateValueOff;
      NSString *itemSystemImageName = [itemConfig[@"systemImageName"] isKindOfClass:NSString.class] ? itemConfig[@"systemImageName"] : nil;
      if (itemSystemImageName.length > 0) {
        if (@available(macOS 11.0, *)) {
          item.image = [NSImage imageWithSystemSymbolName:itemSystemImageName accessibilityDescription:itemLabel];
        }
      }
      item.representedObject = @{
        @"itemId": itemId,
        @"value": itemValue,
        @"windowIdentifier": identifier,
      };
      [menu addItem:item];
    }

    if (menu.numberOfItems > 0) {
      if ([sender isKindOfClass:NSView.class]) {
        NSView *senderView = (NSView *)sender;
        [menu popUpMenuPositioningItem:nil atLocation:NSMakePoint(0, NSHeight(senderView.bounds) + 4) inView:senderView];
      } else {
        NSEvent *event = NSApp.currentEvent;
        NSWindow *window = (NSWindow *)self.windows[identifier];
        if (event && window.contentView) {
          [NSMenu popUpContextMenu:menu withEvent:event forView:window.contentView];
        } else {
          [menu popUpMenuPositioningItem:nil atLocation:NSZeroPoint inView:nil];
        }
      }
      return;
    }
  }

  [self sendWindowEventWithName:@"onToolbarItemSelected"
                           body:@{@"identifier": identifier, @"itemId": itemId, @"value": value}];
}

- (void)toolbarSegmentedControlChanged:(NSSegmentedControl *)sender
{
  id metadata = objc_getAssociatedObject(sender, &LegendToolbarControlMetadataKey);
  NSDictionary *representedObject = [metadata isKindOfClass:NSDictionary.class]
    ? metadata
    : @{};
  NSArray *values = [representedObject[@"values"] isKindOfClass:NSArray.class] ? representedObject[@"values"] : @[];
  NSInteger selectedSegment = sender.selectedSegment;
  NSString *value = selectedSegment >= 0 && selectedSegment < values.count && [values[selectedSegment] isKindOfClass:NSString.class]
    ? values[selectedSegment]
    : @"";
  NSString *identifier = [representedObject[@"windowIdentifier"] isKindOfClass:NSString.class]
    ? representedObject[@"windowIdentifier"]
    : @"";
  NSString *itemId = [representedObject[@"itemId"] isKindOfClass:NSString.class]
    ? representedObject[@"itemId"]
    : @"";

  [self sendWindowEventWithName:@"onToolbarItemSelected"
                           body:@{@"identifier": identifier, @"itemId": itemId, @"value": value}];
}

- (void)sendToolbarSearchEventForField:(NSSearchField *)searchField submitted:(BOOL)submitted
{
  id metadata = objc_getAssociatedObject(searchField, &LegendToolbarControlMetadataKey);
  NSDictionary *representedObject = [metadata isKindOfClass:NSDictionary.class]
    ? metadata
    : @{};
  NSString *identifier = [representedObject[@"windowIdentifier"] isKindOfClass:NSString.class]
    ? representedObject[@"windowIdentifier"]
    : @"";
  NSString *itemId = [representedObject[@"itemId"] isKindOfClass:NSString.class]
    ? representedObject[@"itemId"]
    : @"";

  [self sendWindowEventWithName:@"onToolbarSearch"
                           body:@{
                             @"identifier": identifier,
                             @"itemId": itemId,
                             @"submitted": @(submitted),
                             @"value": searchField.stringValue ?: @"",
                           }];
}

- (void)controlTextDidChange:(NSNotification *)notification
{
  if ([notification.object isKindOfClass:NSSearchField.class]) {
    [self sendToolbarSearchEventForField:(NSSearchField *)notification.object submitted:NO];
  }
}

- (void)toolbarSearchSubmitted:(NSSearchField *)sender
{
  [self sendToolbarSearchEventForField:sender submitted:YES];
}
#endif

- (NSString *)successJson
{
  return [self jsonStringFromObject:@{@"success": @YES}];
}

- (NSString *)failureJson:(NSString *)message
{
  return [self jsonStringFromObject:@{@"success": @NO, @"message": message ?: @""}];
}

- (NSString *)getConstantsJson
{
#if TARGET_OS_OSX
  return [self jsonStringFromObject:@{
    @"STYLE_MASK_BORDERLESS": @(NSWindowStyleMaskBorderless),
    @"STYLE_MASK_TITLED": @(NSWindowStyleMaskTitled),
    @"STYLE_MASK_CLOSABLE": @(NSWindowStyleMaskClosable),
    @"STYLE_MASK_MINIATURIZABLE": @(NSWindowStyleMaskMiniaturizable),
    @"STYLE_MASK_RESIZABLE": @(NSWindowStyleMaskResizable),
    @"STYLE_MASK_UNIFIED_TITLE_AND_TOOLBAR": @(NSWindowStyleMaskUnifiedTitleAndToolbar),
    @"STYLE_MASK_FULL_SCREEN": @(NSWindowStyleMaskFullScreen),
    @"STYLE_MASK_FULL_SIZE_CONTENT_VIEW": @(NSWindowStyleMaskFullSizeContentView),
    @"STYLE_MASK_UTILITY_WINDOW": @(NSWindowStyleMaskUtilityWindow),
    @"STYLE_MASK_DOC_MODAL_WINDOW": @(NSWindowStyleMaskDocModalWindow),
    @"STYLE_MASK_NONACTIVATING_PANEL": @(NSWindowStyleMaskNonactivatingPanel),
    @"WINDOW_LEVEL_NORMAL": @(NSNormalWindowLevel),
    @"WINDOW_LEVEL_FLOATING": @(NSFloatingWindowLevel),
    @"WINDOW_LEVEL_MODAL_PANEL": @(NSModalPanelWindowLevel),
    @"WINDOW_LEVEL_MAIN_MENU": @(NSMainMenuWindowLevel),
    @"WINDOW_LEVEL_STATUS": @(NSStatusWindowLevel),
    @"WINDOW_LEVEL_SCREEN_SAVER": @(NSScreenSaverWindowLevel),
  }];
#else
  return @"{}";
#endif
}

#if TARGET_OS_OSX
- (RCTUIView *)createReactRootViewWithModuleName:(NSString *)moduleName initialProperties:(NSDictionary *)initialProps
{
  LegendWindowOpenTiming(@"native.createRootView.start", @{
    @"moduleName": moduleName ?: @"",
    @"initialPropKeys": initialProps ? initialProps.allKeys : @[],
  });

  id appDelegate = NSApplication.sharedApplication.delegate;
  RCTRootViewFactory *rootViewFactory = nil;

  if ([appDelegate respondsToSelector:@selector(rootViewFactory)]) {
    rootViewFactory = [(id<RNWindowManagerRootViewFactoryProvider>)appDelegate rootViewFactory];
  }

  if (rootViewFactory) {
    RCTUIView *rootView = (RCTUIView *)[rootViewFactory viewWithModuleName:moduleName initialProperties:initialProps];
    LegendWindowOpenTiming(@"native.createRootView.finish", @{
      @"factory": @"rootViewFactory",
      @"moduleName": moduleName ?: @"",
      @"rootView": [NSString stringWithFormat:@"%p", rootView],
    });
    return rootView;
  }

  RCTBridge *bridge = self.bridge;
  if (!bridge) {
    return nil;
  }

  RCTUIView *rootView = [[RCTRootView alloc] initWithBridge:bridge moduleName:moduleName initialProperties:initialProps];
  LegendWindowOpenTiming(@"native.createRootView.finish", @{
    @"factory": @"bridge",
    @"moduleName": moduleName ?: @"",
    @"rootView": [NSString stringWithFormat:@"%p", rootView],
  });
  return rootView;
}
#endif

- (void)openWindow:(NSString *)optionsJson resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
#if TARGET_OS_OSX
  RCTExecuteOnMainQueue(^{
    NSDictionary *options = [self parseObjectJSON:optionsJson];
    NSString *identifier = [options[@"identifier"] isKindOfClass:NSString.class] ? options[@"identifier"] : nil;
    NSString *moduleName = [options[@"moduleName"] isKindOfClass:NSString.class] ? options[@"moduleName"] : nil;
    NSAppearance *darkAppearance = LegendDarkAppearance();

    if (moduleName.length == 0) {
      moduleName = identifier;
    }
    if (identifier.length == 0) {
      identifier = moduleName ?: @"default";
    }

    NSString *title = [options[@"title"] isKindOfClass:NSString.class] ? options[@"title"] : nil;
    title = title ?: moduleName ?: @"New Window";
    BOOL hasRepresentedURL = LegendDictionaryHasKey(options, @"representedURL");
    id representedURLValue = hasRepresentedURL ? options[@"representedURL"] : nil;

    NSDictionary *windowStyle = [options[@"windowStyle"] isKindOfClass:NSDictionary.class] ? options[@"windowStyle"] : @{};
    NSNumber *maskNumber = [windowStyle[@"mask"] isKindOfClass:NSNumber.class] ? windowStyle[@"mask"] : nil;
    NSNumber *transparentTitlebar = [windowStyle[@"titlebarAppearsTransparent"] isKindOfClass:NSNumber.class]
      ? windowStyle[@"titlebarAppearsTransparent"]
      : nil;
    NSString *titleVisibility = [windowStyle[@"titleVisibility"] isKindOfClass:NSString.class]
      ? windowStyle[@"titleVisibility"]
      : nil;
    NSString *toolbarStyle = [windowStyle[@"toolbarStyle"] isKindOfClass:NSString.class] ? windowStyle[@"toolbarStyle"] : nil;
    NSString *contentLayoutMode = [windowStyle[@"contentLayoutMode"] isKindOfClass:NSString.class]
      ? windowStyle[@"contentLayoutMode"]
      : nil;
    NSString *titlebarSeparatorStyle = [windowStyle[@"titlebarSeparatorStyle"] isKindOfClass:NSString.class]
      ? windowStyle[@"titlebarSeparatorStyle"]
      : nil;
    NSString *backgroundColor = [windowStyle[@"backgroundColor"] isKindOfClass:NSString.class]
      ? windowStyle[@"backgroundColor"]
      : nil;
    NSString *appearance = [windowStyle[@"appearance"] isKindOfClass:NSString.class]
      ? windowStyle[@"appearance"]
      : nil;
    BOOL usesTitlebarBackground = transparentTitlebar.boolValue && backgroundColor.length > 0;
    NSNumber *levelNumber = [options[@"level"] isKindOfClass:NSNumber.class] ? options[@"level"] : nil;
    BOOL transparentBackground = [options[@"transparentBackground"] boolValue];
    BOOL interceptClose = [options[@"interceptClose"] boolValue];
    NSNumber *hasShadowNumber = [options[@"hasShadow"] isKindOfClass:NSNumber.class] ? options[@"hasShadow"] : nil;
    BOOL shouldApplyHasShadow = hasShadowNumber != nil;
    BOOL hasShadow = shouldApplyHasShadow ? hasShadowNumber.boolValue : NO;
    NSNumber *animateFrameChangeNumber = [options[@"animateFrameChange"] isKindOfClass:NSNumber.class]
      ? options[@"animateFrameChange"]
      : nil;
    BOOL animateFrameChange = animateFrameChangeNumber ? animateFrameChangeNumber.boolValue : NO;
    NSNumber *frameAnimationDurationNumber = [options[@"frameAnimationDurationMs"] isKindOfClass:NSNumber.class]
      ? options[@"frameAnimationDurationMs"]
      : nil;
    NSTimeInterval frameAnimationDuration = frameAnimationDurationNumber ? frameAnimationDurationNumber.doubleValue / 1000.0 : 0;
    NSNumber *widthNumber = [windowStyle[@"width"] isKindOfClass:NSNumber.class]
      ? windowStyle[@"width"]
      : ([options[@"width"] isKindOfClass:NSNumber.class] ? options[@"width"] : nil);
    NSNumber *heightNumber = [windowStyle[@"height"] isKindOfClass:NSNumber.class]
      ? windowStyle[@"height"]
      : ([options[@"height"] isKindOfClass:NSNumber.class] ? options[@"height"] : nil);
    CGFloat width = widthNumber ? widthNumber.doubleValue : 400;
    CGFloat height = heightNumber ? heightNumber.doubleValue : 300;
    NSNumber *minWidthNumber = [windowStyle[@"minWidth"] isKindOfClass:NSNumber.class]
      ? windowStyle[@"minWidth"]
      : ([options[@"minWidth"] isKindOfClass:NSNumber.class] ? options[@"minWidth"] : nil);
    NSNumber *minHeightNumber = [windowStyle[@"minHeight"] isKindOfClass:NSNumber.class]
      ? windowStyle[@"minHeight"]
      : ([options[@"minHeight"] isKindOfClass:NSNumber.class] ? options[@"minHeight"] : nil);
    BOOL hasMinWidth = minWidthNumber != nil;
    BOOL hasMinHeight = minHeightNumber != nil;
    CGFloat minWidth = hasMinWidth ? minWidthNumber.doubleValue : 0;
    CGFloat minHeight = hasMinHeight ? minHeightNumber.doubleValue : 0;

    if (hasMinWidth && width < minWidth) {
      width = minWidth;
    }
    if (hasMinHeight && height < minHeight) {
      height = minHeight;
    }

    NSNumber *originX = [options[@"x"] isKindOfClass:NSNumber.class] ? options[@"x"] : nil;
    NSNumber *originY = [options[@"y"] isKindOfClass:NSNumber.class] ? options[@"y"] : nil;
	    BOOL hasToolbar = [windowStyle[@"hasToolbar"] boolValue];
	    NSWindow *existingWindow = (NSWindow *)self.windows[identifier];
	    LegendWindowOpenTiming(@"native.open.start", @{
	      @"identifier": identifier ?: @"",
	      @"moduleName": moduleName ?: @"",
	      @"existingWindow": existingWindow ? @"true" : @"false",
	      @"existingWindowPointer": existingWindow ? [NSString stringWithFormat:@"%p", existingWindow] : @"",
	      @"initialPropKeys": [self initialPropsFromOptions:options] ? [self initialPropsFromOptions:options].allKeys : @[],
	    });
	
	    if (existingWindow) {
	      NSString *existingModuleName = self.moduleNames[identifier] ?: @"";
	      NSString *nextModuleName = moduleName ?: @"";
	      if (![existingModuleName isEqualToString:nextModuleName]) {
	        LegendWindowOpenTiming(@"native.open.moduleMismatch", @{
	          @"identifier": identifier ?: @"",
	          @"existingModuleName": existingModuleName,
	          @"nextModuleName": nextModuleName,
	        });
	        [existingWindow orderOut:nil];
	        [self handleWindowClosedForIdentifier:identifier];
	        existingWindow = nil;
      }
    }

    if (existingWindow) {
      RCTUIView *existingRootView = self.rootViews[identifier];
      NSRect frame = existingWindow.frame;
      CGFloat newWidth = widthNumber ? width : frame.size.width;
      CGFloat newHeight = heightNumber ? height : frame.size.height;
      if (hasMinWidth && newWidth < minWidth) {
        newWidth = minWidth;
      }
      if (hasMinHeight && newHeight < minHeight) {
        newHeight = minHeight;
      }

      NSPoint origin = frame.origin;
      if (originX) {
        origin.x = originX.doubleValue;
      }
      if (originY) {
        origin.y = originY.doubleValue;
      }

      NSRect newFrame = NSMakeRect(origin.x, origin.y, newWidth, newHeight);
      if (animateFrameChange && frameAnimationDuration > 0) {
        [NSAnimationContext runAnimationGroup:^(NSAnimationContext *context) {
          context.duration = frameAnimationDuration;
          context.timingFunction = [CAMediaTimingFunction functionWithName:kCAMediaTimingFunctionEaseInEaseOut];
          [[existingWindow animator] setFrame:newFrame display:YES];
        } completionHandler:nil];
      } else {
        [existingWindow setFrame:newFrame display:YES animate:animateFrameChange];
      }

      if (maskNumber) {
        existingWindow.styleMask = maskNumber.unsignedIntegerValue;
      }
      LegendApplyContentLayoutModeOption(existingWindow, contentLayoutMode);
      LegendApplyContentLayoutMode(existingWindow, maskNumber, usesTitlebarBackground);
      if (transparentTitlebar != nil) {
        existingWindow.titlebarAppearsTransparent = transparentTitlebar.boolValue;
      }
      LegendApplyTitleVisibility(existingWindow, titleVisibility);
      if (hasToolbar && !existingWindow.toolbar) {
        NSToolbar *toolbar = [[NSToolbar alloc] initWithIdentifier:identifier];
        toolbar.displayMode = NSToolbarDisplayModeIconOnly;
        toolbar.showsBaselineSeparator = NO;
        existingWindow.toolbar = toolbar;
      }
      LegendApplyToolbarStyle(existingWindow, toolbarStyle);
      LegendApplyTitlebarSeparatorStyle(existingWindow, titlebarSeparatorStyle);
      [self applyTitlebarControlsFromOptions:options toWindow:existingWindow identifier:identifier];
      [self applyToolbarItemsFromOptions:options toWindow:existingWindow identifier:identifier];
      [self applyTitlebarMaterialFromOptions:options toWindow:existingWindow identifier:identifier];
      LegendApplyWindowAppearance(existingWindow, appearance);
      LegendApplyWindowBackgroundColor(existingWindow, backgroundColor);

      if (levelNumber) {
        existingWindow.level = levelNumber.integerValue;
        [existingWindow orderFrontRegardless];
      }
      if (shouldApplyHasShadow) {
        existingWindow.hasShadow = hasShadow;
        if (hasShadow) {
          [existingWindow invalidateShadow];
        }
      }
      if (transparentBackground) {
        existingWindow.opaque = NO;
        if (!hasToolbar) {
          existingWindow.backgroundColor = NSColor.clearColor;
        }
        NSView *contentView = existingWindow.contentView;
        contentView.wantsLayer = YES;
        contentView.layer.backgroundColor = NSColor.clearColor.CGColor;
        contentView.layer.masksToBounds = NO;
        existingRootView.backgroundColor = NSColor.clearColor;
      }

      LegendApplyWindowTitleAndRepresentedURL(existingWindow, title, hasRepresentedURL, representedURLValue, title);
      if (!appearance && darkAppearance) {
        existingWindow.appearance = darkAppearance;
      }
      existingWindow.delegate = self;
      if (hasMinWidth || hasMinHeight) {
        NSSize currentMinSize = existingWindow.minSize;
        [existingWindow setMinSize:NSMakeSize(hasMinWidth ? minWidth : currentMinSize.width,
                                              hasMinHeight ? minHeight : currentMinSize.height)];
      }

	      NSDictionary *initialProps = [self initialPropsFromOptions:options];
	      if (existingRootView && initialProps && [existingRootView respondsToSelector:@selector(setAppProperties:)]) {
	        LegendWindowOpenTiming(@"native.open.reuse.setAppProperties", @{
	          @"identifier": identifier ?: @"",
	          @"moduleName": moduleName ?: @"",
	          @"rootView": [NSString stringWithFormat:@"%p", existingRootView],
	          @"initialPropKeys": initialProps.allKeys,
	        });
	        [existingRootView setValue:initialProps forKey:@"appProperties"];
	      }
      if (usesTitlebarBackground && existingRootView) {
        LegendEnsureRootViewContainer(existingWindow, existingRootView);
        LegendApplyWindowBackgroundColor(existingWindow, backgroundColor);
      }
      LegendSizeRootViewToWindow(existingRootView, existingWindow);
      LegendPrepareWindowForDisplay(existingWindow, backgroundColor);
      if (interceptClose) {
        [self.closeRequestIdentifiers addObject:identifier];
      } else {
        [self.closeRequestIdentifiers removeObject:identifier];
      }
	      self.moduleNames[identifier] = moduleName ?: @"";
	      [existingWindow makeKeyAndOrderFront:nil];
	      LegendWindowOpenTiming(@"native.open.reuse.finish", @{
	        @"identifier": identifier ?: @"",
	        @"moduleName": moduleName ?: @"",
	        @"rootView": existingRootView ? [NSString stringWithFormat:@"%p", existingRootView] : @"",
	        @"window": [NSString stringWithFormat:@"%p", existingWindow],
	      });
	      resolve([self successJson]);
	      return;
	    }

    NSUInteger styleMask = maskNumber
      ? maskNumber.unsignedIntegerValue
      : (NSWindowStyleMaskTitled | NSWindowStyleMaskClosable | NSWindowStyleMaskResizable | NSWindowStyleMaskMiniaturizable);
    NSWindow *window = [[NSWindow alloc] initWithContentRect:NSMakeRect(0, 0, width, height)
                                                   styleMask:styleMask
                                                     backing:NSBackingStoreBuffered
                                                       defer:NO];
    LegendApplyContentLayoutModeOption(window, contentLayoutMode);
    LegendApplyContentLayoutMode(window, maskNumber, usesTitlebarBackground);

    if (appearance) {
      LegendApplyWindowAppearance(window, appearance);
    } else if (darkAppearance) {
      window.appearance = darkAppearance;
    }
    window.releasedWhenClosed = NO;
    LegendApplyWindowTitleAndRepresentedURL(window, title, hasRepresentedURL, representedURLValue, title);
    if (transparentTitlebar != nil) {
      window.titlebarAppearsTransparent = transparentTitlebar.boolValue;
    }
    LegendApplyTitleVisibility(window, titleVisibility);
    if (hasToolbar) {
      NSToolbar *toolbar = [[NSToolbar alloc] initWithIdentifier:identifier];
      toolbar.displayMode = NSToolbarDisplayModeIconOnly;
      toolbar.showsBaselineSeparator = NO;
      window.toolbar = toolbar;
    }
    LegendApplyToolbarStyle(window, toolbarStyle);
    LegendApplyTitlebarSeparatorStyle(window, titlebarSeparatorStyle);
    [self applyTitlebarControlsFromOptions:options toWindow:window identifier:identifier];
    [self applyToolbarItemsFromOptions:options toWindow:window identifier:identifier];
    [self applyTitlebarMaterialFromOptions:options toWindow:window identifier:identifier];
    LegendApplyWindowAppearance(window, appearance);
    LegendApplyWindowBackgroundColor(window, backgroundColor);
    if (levelNumber) {
      window.level = levelNumber.integerValue;
    }
    if (shouldApplyHasShadow) {
      window.hasShadow = hasShadow;
      if (hasShadow) {
        [window invalidateShadow];
      }
    }
    if (transparentBackground) {
      window.opaque = NO;
      if (!hasToolbar) {
        window.backgroundColor = NSColor.clearColor;
      }
      window.contentView.wantsLayer = YES;
      window.contentView.layer.masksToBounds = NO;
    }

    if (originX || originY) {
      NSPoint origin = window.frame.origin;
      if (originX) {
        origin.x = originX.doubleValue;
      }
      if (originY) {
        origin.y = originY.doubleValue;
      }
      [window setFrameOrigin:origin];
    } else {
      [window center];
    }

    if (hasMinWidth || hasMinHeight) {
      NSSize currentMinSize = window.minSize;
      [window setMinSize:NSMakeSize(hasMinWidth ? minWidth : currentMinSize.width,
                                    hasMinHeight ? minHeight : currentMinSize.height)];
    }

	    NSDictionary *initialProps = [self initialPropsFromOptions:options];
	    LegendWindowOpenTiming(@"native.open.createWindow.start", @{
	      @"identifier": identifier ?: @"",
	      @"moduleName": moduleName ?: @"",
	      @"initialPropKeys": initialProps ? initialProps.allKeys : @[],
	      @"window": [NSString stringWithFormat:@"%p", window],
	    });
	    RCTUIView *rootView = [self createReactRootViewWithModuleName:moduleName initialProperties:initialProps];
	    if (!rootView) {
	      reject(@"no_root_view", @"React root view could not be created", nil);
      return;
    }

    window.contentView = rootView;
    LegendApplyWindowBackgroundColor(window, backgroundColor);
    if (usesTitlebarBackground) {
      LegendEnsureRootViewContainer(window, rootView);
      LegendApplyWindowBackgroundColor(window, backgroundColor);
    }
    LegendSizeRootViewToWindow(rootView, window);
    if (transparentBackground) {
      rootView.backgroundColor = NSColor.clearColor;
      window.contentView.wantsLayer = YES;
      window.contentView.layer.backgroundColor = NSColor.clearColor.CGColor;
      window.contentView.layer.masksToBounds = NO;
    }
    rootView.wantsLayer = YES;
    rootView.layerUsesCoreImageFilters = YES;
    if (!rootView.layer) {
      rootView.layer = [CALayer layer];
    }
    rootView.layer.masksToBounds = NO;
    LegendPrepareWindowForDisplay(window, backgroundColor);
    window.delegate = self;

    self.windows[identifier] = window;
    self.rootViews[identifier] = rootView;
    self.moduleNames[identifier] = moduleName ?: @"";
    if (interceptClose) {
      [self.closeRequestIdentifiers addObject:identifier];
    } else {
      [self.closeRequestIdentifiers removeObject:identifier];
    }

	    [window makeKeyAndOrderFront:nil];
	    if (levelNumber) {
	      [window orderFrontRegardless];
	    }
	    LegendWindowOpenTiming(@"native.open.createWindow.finish", @{
	      @"identifier": identifier ?: @"",
	      @"moduleName": moduleName ?: @"",
	      @"rootView": [NSString stringWithFormat:@"%p", rootView],
	      @"window": [NSString stringWithFormat:@"%p", window],
	    });
	    resolve([self successJson]);
	  });
#else
  resolve([self failureJson:@"WindowManager is only available on macOS"]);
#endif
}

- (void)setWindowTitle:(NSString *)identifier
                 title:(NSString *)title
               resolve:(RCTPromiseResolveBlock)resolve
                reject:(RCTPromiseRejectBlock)reject
{
#if TARGET_OS_OSX
  RCTExecuteOnMainQueue(^{
    NSString *targetIdentifier = [self normalizeIdentifier:identifier];
    NSWindow *window = (NSWindow *)self.windows[targetIdentifier];
    if (!window) {
      reject(@"window_not_found", @"Window not found", nil);
      return;
    }
    window.title = title ?: @"";
    resolve([self successJson]);
  });
#else
  resolve([self failureJson:@"WindowManager is only available on macOS"]);
#endif
}

- (void)focusToolbarSearchItem:(NSString *)identifier
                        itemId:(NSString *)itemId
                         value:(NSString *)value
                       resolve:(RCTPromiseResolveBlock)resolve
                        reject:(RCTPromiseRejectBlock)reject
{
#if TARGET_OS_OSX
  RCTExecuteOnMainQueue(^{
    NSString *targetIdentifier = [self normalizeIdentifier:identifier];
    NSWindow *window = (NSWindow *)self.windows[targetIdentifier];
    if (!window) {
      reject(@"window_not_found", @"Window not found", nil);
      return;
    }

    NSString *toolbarIdentifier = [NSString stringWithFormat:@"legend.toolbar.%@", itemId ?: @""];
    NSToolbarItem *toolbarItem = nil;
    for (NSToolbarItem *candidate in window.toolbar.items) {
      if ([candidate.itemIdentifier isEqualToString:toolbarIdentifier]) {
        toolbarItem = candidate;
        break;
      }
    }
    if (!toolbarItem) {
      resolve([self failureJson:@"Toolbar search item not found"]);
      return;
    }

    NSSearchField *searchField = nil;
    if (@available(macOS 11.0, *)) {
      if ([toolbarItem isKindOfClass:NSSearchToolbarItem.class]) {
        searchField = ((NSSearchToolbarItem *)toolbarItem).searchField;
      }
    }
    if (!searchField && [toolbarItem.view isKindOfClass:NSSearchField.class]) {
      searchField = (NSSearchField *)toolbarItem.view;
    }
    if (!searchField) {
      resolve([self failureJson:@"Toolbar search field not found"]);
      return;
    }

    searchField.stringValue = value ?: @"";
    [self sendToolbarSearchEventForField:searchField submitted:NO];
    [window makeKeyAndOrderFront:nil];
    [window makeFirstResponder:searchField];
    resolve([self successJson]);
  });
#else
  resolve([self failureJson:@"WindowManager is only available on macOS"]);
#endif
}

- (void)closeWindow:(NSString *)identifier resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
#if TARGET_OS_OSX
  RCTExecuteOnMainQueue(^{
    NSString *targetIdentifier = [self normalizeIdentifier:identifier];
    NSWindow *window = (NSWindow *)self.windows[targetIdentifier];
    if (!window) {
      resolve([self failureJson:@"No window to close"]);
      return;
    }
    [window orderOut:nil];
    [self handleWindowClosedForIdentifier:targetIdentifier];
    resolve([self successJson]);
  });
#else
  resolve([self failureJson:@"WindowManager is only available on macOS"]);
#endif
}

- (void)closeFrontmostWindow:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
#if TARGET_OS_OSX
  RCTExecuteOnMainQueue(^{
    NSWindow *window = NSApp.keyWindow ?: NSApp.mainWindow;
    if (!window) {
      resolve([self failureJson:@"No window to close"]);
      return;
    }
    [window performClose:nil];
    resolve([self successJson]);
  });
#else
  resolve([self failureJson:@"WindowManager is only available on macOS"]);
#endif
}

- (void)showMainWindow:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
#if TARGET_OS_OSX
  RCTExecuteOnMainQueue(^{
    NSWindow *mainWindow = [RNWindowManager getMainWindow];
    if (!mainWindow) {
      resolve([self failureJson:@"Main window not found"]);
      return;
    }
    [NSApp activateIgnoringOtherApps:YES];
    [mainWindow makeKeyAndOrderFront:nil];
    resolve([self successJson]);
  });
#else
  resolve([self failureJson:@"WindowManager is only available on macOS"]);
#endif
}

- (void)setMainWindowOptions:(NSString *)optionsJson resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
#if TARGET_OS_OSX
  RCTExecuteOnMainQueue(^{
    NSWindow *mainWindow = [RNWindowManager getMainWindow];
    if (!mainWindow) {
      reject(@"window_not_found", @"Main window not found", nil);
      return;
    }

    NSDictionary *options = [self parseObjectJSON:optionsJson];
    LegendApplyWindowOptions(mainWindow, options);
    [self applyTitlebarControlsFromOptions:options toWindow:mainWindow identifier:@"main"];
    [self applyToolbarItemsFromOptions:options toWindow:mainWindow identifier:@"main"];
    [self applyTitlebarMaterialFromOptions:options toWindow:mainWindow identifier:@"main"];
    resolve([self successJson]);
  });
#else
  resolve([self failureJson:@"WindowManager is only available on macOS"]);
#endif
}

- (void)setWindowOptions:(NSString *)identifier
             optionsJson:(NSString *)optionsJson
                 resolve:(RCTPromiseResolveBlock)resolve
                  reject:(RCTPromiseRejectBlock)reject
{
#if TARGET_OS_OSX
  RCTExecuteOnMainQueue(^{
    NSString *targetIdentifier = [self normalizeIdentifier:identifier];
    NSWindow *window = (NSWindow *)self.windows[targetIdentifier];
    if (!window) {
      reject(@"window_not_found", @"Window not found", nil);
      return;
    }

    NSDictionary *options = [self parseObjectJSON:optionsJson];
    LegendApplyWindowOptions(window, options);
    [self applyTitlebarControlsFromOptions:options toWindow:window identifier:targetIdentifier];
    [self applyToolbarItemsFromOptions:options toWindow:window identifier:targetIdentifier];
    [self applyTitlebarMaterialFromOptions:options toWindow:window identifier:targetIdentifier];
    RCTUIView *rootView = self.rootViews[targetIdentifier];
    LegendSizeRootViewToWindow(rootView, window);
    resolve([self successJson]);
  });
#else
  resolve([self failureJson:@"WindowManager is only available on macOS"]);
#endif
}

- (void)getMainWindowFrame:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
#if TARGET_OS_OSX
  RCTExecuteOnMainQueue(^{
    NSWindow *mainWindow = [RNWindowManager getMainWindow];
    if (!mainWindow) {
      reject(@"no_main_window", @"Main window not found", nil);
      return;
    }
    resolve([self jsonStringFromObject:[self frameDictionary:mainWindow.frame]]);
  });
#else
  resolve([self jsonStringFromObject:@{@"x": @0, @"y": @0, @"width": @0, @"height": @0}]);
#endif
}

- (void)setMainWindowFrame:(NSString *)frameJson resolve:(RCTPromiseResolveBlock)resolve reject:(RCTPromiseRejectBlock)reject
{
#if TARGET_OS_OSX
  RCTExecuteOnMainQueue(^{
    NSWindow *mainWindow = [RNWindowManager getMainWindow];
    if (!mainWindow) {
      reject(@"no_main_window", @"Main window not found", nil);
      return;
    }
    NSDictionary *frameDict = [self parseObjectJSON:frameJson];
    NSRect newFrame = NSMakeRect([frameDict[@"x"] doubleValue],
                                 [frameDict[@"y"] doubleValue],
                                 [frameDict[@"width"] doubleValue],
                                 [frameDict[@"height"] doubleValue]);
    [mainWindow setFrame:newFrame display:YES animate:NO];
    resolve([self successJson]);
  });
#else
  resolve([self failureJson:@"WindowManager is only available on macOS"]);
#endif
}

- (void)setWindowBlur:(NSString *)identifier
               radius:(double)radius
           durationMs:(double)durationMs
              resolve:(RCTPromiseResolveBlock)resolve
               reject:(RCTPromiseRejectBlock)reject
{
#if TARGET_OS_OSX
  RCTExecuteOnMainQueue(^{
    NSString *targetIdentifier = [self normalizeIdentifier:identifier];
    NSWindow *window = (NSWindow *)self.windows[targetIdentifier];
    if (!window) {
      reject(@"window_not_found", @"Target window not found for blur animation", nil);
      return;
    }

    RCTUIView *rootView = self.rootViews[targetIdentifier];
    NSView *contentView = window.contentView ?: rootView;
    if (!contentView) {
      reject(@"no_content_view", @"Window does not have a content view to blur", nil);
      return;
    }

    contentView.wantsLayer = YES;
    contentView.layerUsesCoreImageFilters = YES;
    if (!contentView.layer) {
      contentView.layer = [CALayer layer];
    }
    contentView.layer.masksToBounds = NO;

    CIFilter *blurFilter = self.windowBlurFilters[targetIdentifier];
    if (!blurFilter) {
      blurFilter = [CIFilter filterWithName:@"CIGaussianBlur"];
      if (!blurFilter) {
        reject(@"filter_unavailable", @"CIGaussianBlur filter could not be created", nil);
        return;
      }
      blurFilter.name = @"legendOverlayBlur";
      [blurFilter setDefaults];
      [blurFilter setValue:@0 forKey:kCIInputRadiusKey];
      self.windowBlurFilters[targetIdentifier] = blurFilter;
    }

    BOOL filterAttached = NO;
    for (id existingFilter in contentView.layer.filters ?: @[]) {
      if ([existingFilter isKindOfClass:CIFilter.class] && [[existingFilter name] isEqualToString:@"legendOverlayBlur"]) {
        filterAttached = YES;
        break;
      }
    }
    if (!filterAttached) {
      NSMutableArray *filters = [NSMutableArray arrayWithArray:contentView.layer.filters ?: @[]];
      [filters addObject:blurFilter];
      contentView.layer.filters = filters;
    }

    CGFloat targetRadius = radius;
    CGFloat currentRadius = [[blurFilter valueForKey:kCIInputRadiusKey] doubleValue];
    NSTimeInterval durationSeconds = durationMs / 1000.0;
    if (durationSeconds <= 0) {
      [CATransaction begin];
      [CATransaction setDisableActions:YES];
      [blurFilter setValue:@(targetRadius) forKey:kCIInputRadiusKey];
      [CATransaction commit];
      [contentView.layer removeAnimationForKey:@"legendOverlayBlurAnimation"];
      resolve([self successJson]);
      return;
    }

    [contentView.layer removeAnimationForKey:@"legendOverlayBlurAnimation"];
    CABasicAnimation *animation = [CABasicAnimation animationWithKeyPath:@"filters.legendOverlayBlur.inputRadius"];
    animation.fromValue = @(currentRadius);
    animation.toValue = @(targetRadius);
    animation.duration = durationSeconds;
    animation.timingFunction = [CAMediaTimingFunction functionWithName:kCAMediaTimingFunctionEaseInEaseOut];
    animation.fillMode = kCAFillModeForwards;
    animation.removedOnCompletion = NO;

    [CATransaction begin];
    [CATransaction setCompletionBlock:^{
      [CATransaction begin];
      [CATransaction setDisableActions:YES];
      [blurFilter setValue:@(targetRadius) forKey:kCIInputRadiusKey];
      [CATransaction commit];
      resolve([self successJson]);
    }];
    [contentView.layer addAnimation:animation forKey:@"legendOverlayBlurAnimation"];
    [CATransaction commit];
  });
#else
  resolve([self failureJson:@"WindowManager is only available on macOS"]);
#endif
}

#if TARGET_OS_OSX
+ (NSWindow *)getMainWindow
{
  for (NSWindow *window in NSApplication.sharedApplication.windows) {
    if ([window isKindOfClass:NSWindow.class] && !window.sheet && ![window isKindOfClass:NSPanel.class]) {
      return window;
    }
  }
  return NSApplication.sharedApplication.keyWindow;
}

- (void)setupMainWindowObservers
{
  if (self.mainWindowObserversInstalled) {
    return;
  }
  NSWindow *mainWindow = [RNWindowManager getMainWindow];
  if (!mainWindow) {
    return;
  }
  self.mainWindowObserversInstalled = YES;
  NSNotificationCenter *center = NSNotificationCenter.defaultCenter;
  [center addObserver:self selector:@selector(mainWindowDidMove:) name:NSWindowDidMoveNotification object:mainWindow];
  [center addObserver:self selector:@selector(mainWindowDidResize:) name:NSWindowDidResizeNotification object:mainWindow];
  [center addObserver:self selector:@selector(mainWindowDidBecomeKey:) name:NSWindowDidBecomeKeyNotification object:mainWindow];
}

- (void)mainWindowDidMove:(NSNotification *)notification
{
  NSWindow *window = notification.object;
  [self sendWindowEventWithName:@"onMainWindowMoved" body:[self frameDictionary:window.frame]];
}

- (void)mainWindowDidResize:(NSNotification *)notification
{
  NSWindow *window = notification.object;
  RCTUIView *rootView = LegendManagedRootView(window);
  if (rootView) {
    LegendSizeRootViewToWindow(rootView, window);
  }
  [self sendWindowEventWithName:@"onMainWindowResized" body:[self frameDictionary:window.frame]];
}

- (void)mainWindowDidBecomeKey:(NSNotification *)notification
{
  [self sendWindowEventWithName:@"onWindowFocused" body:@{@"identifier": @"main", @"moduleName": @"main"}];
}

- (void)windowDidBecomeKey:(NSNotification *)notification
{
  NSString *identifier = [self identifierForWindow:notification.object];
  if (!identifier) {
    return;
  }
  [self sendWindowEventWithName:@"onWindowFocused"
                           body:@{@"identifier": identifier, @"moduleName": self.moduleNames[identifier] ?: @""}];
}

- (void)windowDidMove:(NSNotification *)notification
{
  NSWindow *window = notification.object;
  NSString *identifier = [self identifierForWindow:window];
  if (!identifier) {
    return;
  }
  [self sendWindowEventWithName:@"onWindowMoved"
                           body:@{
                             @"identifier": identifier,
                             @"moduleName": self.moduleNames[identifier] ?: @"",
                             @"frame": [self frameDictionary:window.frame],
                           }];
}

- (void)windowDidResize:(NSNotification *)notification
{
  NSWindow *window = notification.object;
  NSString *identifier = [self identifierForWindow:window];
  if (!identifier) {
    return;
  }
  RCTUIView *rootView = LegendManagedRootView(window);
  if (rootView) {
    LegendSizeRootViewToWindow(rootView, window);
  }
  [self sendWindowEventWithName:@"onWindowResized"
                           body:@{
                             @"identifier": identifier,
                             @"moduleName": self.moduleNames[identifier] ?: @"",
                             @"frame": [self frameDictionary:window.frame],
                           }];
}

- (void)windowWillClose:(NSNotification *)notification
{
  NSString *identifier = [self identifierForWindow:notification.object];
  if (identifier) {
    [self handleWindowClosedForIdentifier:identifier];
  }
}

- (void)sendWindowEventWithName:(NSString *)eventName body:(id)body
{
  if (!self.hasListeners) {
    return;
  }
  [self sendEventWithName:eventName body:body];
}

- (void)applicationReopenRequested:(NSNotification *)notification
{
  NSNumber *hasVisibleWindows = notification.userInfo[@"hasVisibleWindows"];
  [self sendWindowEventWithName:@"onApplicationReopenRequested"
                           body:@{@"hasVisibleWindows": hasVisibleWindows ?: @NO}];
}

- (BOOL)windowShouldClose:(NSWindow *)window
{
  NSString *identifier = [self identifierForWindow:window];
  if (!identifier) {
    return NO;
  }

  if ([self.closeRequestIdentifiers containsObject:identifier]) {
    [self sendWindowEventWithName:@"onWindowCloseRequested"
                             body:@{@"identifier": identifier, @"moduleName": self.moduleNames[identifier] ?: @""}];
    return NO;
  }

  return YES;
}

- (NSDictionary *)frameDictionary:(NSRect)frame
{
  return @{
    @"x": @(frame.origin.x),
    @"y": @(frame.origin.y),
    @"width": @(frame.size.width),
    @"height": @(frame.size.height),
  };
}

- (NSString *)identifierForWindow:(NSWindow *)window
{
  if (!window) {
    return nil;
  }
  for (NSString *identifier in self.windows.allKeys) {
    if ((NSWindow *)self.windows[identifier] == window) {
      return identifier;
    }
  }
  return nil;
}

- (void)handleWindowClosedForIdentifier:(NSString *)identifier
{
  NSString *moduleName = self.moduleNames[identifier] ?: @"";
  NSWindow *window = (NSWindow *)self.windows[identifier];
  CIFilter *blurFilter = self.windowBlurFilters[identifier];
  if (blurFilter) {
    RCTUIView *rootView = self.rootViews[identifier];
    NSView *contentView = window.contentView ?: rootView;
    if (contentView.layer) {
      [contentView.layer removeAnimationForKey:@"legendOverlayBlurAnimation"];
      NSMutableArray *remainingFilters = [NSMutableArray array];
      for (id filter in contentView.layer.filters ?: @[]) {
        if ([filter isKindOfClass:CIFilter.class] && [[filter name] isEqualToString:@"legendOverlayBlur"]) {
          continue;
        }
        [remainingFilters addObject:filter];
      }
      contentView.layer.filters = remainingFilters;
    }
  }
  [self.windowBlurFilters removeObjectForKey:identifier];
  if (window) {
    [self removeTitlebarMaterialForIdentifier:identifier];
    [self removeTitlebarControlsForIdentifier:identifier fromWindow:window];
  } else {
    [self.titlebarMaterialViews removeObjectForKey:identifier];
    [self.titlebarAccessoryControllers removeObjectForKey:identifier];
  }
  [self.closeRequestIdentifiers removeObject:identifier];
  [self.windows removeObjectForKey:identifier];
  [self.rootViews removeObjectForKey:identifier];
  [self.moduleNames removeObjectForKey:identifier];
  [self sendWindowEventWithName:@"onWindowClosed" body:@{@"identifier": identifier ?: @"", @"moduleName": moduleName ?: @""}];
}

- (NSDictionary *)initialPropsFromOptions:(NSDictionary *)options
{
  id initialPropsCandidate = options[@"initialProperties"];
  return [initialPropsCandidate isKindOfClass:NSDictionary.class] ? initialPropsCandidate : nil;
}

- (NSString *)normalizeIdentifier:(NSString *)identifier
{
  return [identifier isKindOfClass:NSString.class] && identifier.length > 0 ? identifier : @"default";
}
#endif

- (void)dealloc
{
#if TARGET_OS_OSX
  [NSNotificationCenter.defaultCenter removeObserver:self];
#endif
}

@end
