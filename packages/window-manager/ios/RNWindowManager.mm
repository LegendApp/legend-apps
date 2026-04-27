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
#import <QuartzCore/QuartzCore.h>
#endif

@protocol RNWindowManagerRootViewFactoryProvider <NSObject>
- (RCTRootViewFactory *)rootViewFactory;
@end

#if TARGET_OS_OSX
static inline NSAppearance *LegendDarkAppearance()
{
  if (@available(macOS 10.14, *)) {
    return [NSAppearance appearanceNamed:NSAppearanceNameDarkAqua];
  } else if (@available(macOS 10.10, *)) {
    return [NSAppearance appearanceNamed:NSAppearanceNameVibrantDark];
  }
  return nil;
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
#endif

@interface RNWindowManager ()
#if TARGET_OS_OSX
<NSWindowDelegate>
#endif
@property (nonatomic, strong) NSMutableDictionary<NSString *, id> *windows;
@property (nonatomic, strong) NSMutableDictionary<NSString *, RCTUIView *> *rootViews;
@property (nonatomic, strong) NSMutableDictionary<NSString *, NSString *> *moduleNames;
@property (nonatomic, strong) NSMutableDictionary<NSString *, CIFilter *> *windowBlurFilters;
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
    _windowBlurFilters = [NSMutableDictionary new];
  }
  return self;
}

- (NSArray<NSString *> *)supportedEvents
{
  return @[@"onWindowClosed", @"onMainWindowMoved", @"onMainWindowResized", @"onWindowFocused"];
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
  id appDelegate = NSApplication.sharedApplication.delegate;
  RCTRootViewFactory *rootViewFactory = nil;

  if ([appDelegate respondsToSelector:@selector(rootViewFactory)]) {
    rootViewFactory = [(id<RNWindowManagerRootViewFactoryProvider>)appDelegate rootViewFactory];
  }

  if (rootViewFactory) {
    return (RCTUIView *)[rootViewFactory viewWithModuleName:moduleName initialProperties:initialProps];
  }

  RCTBridge *bridge = self.bridge;
  if (!bridge) {
    return nil;
  }

  return [[RCTRootView alloc] initWithBridge:bridge moduleName:moduleName initialProperties:initialProps];
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

    NSDictionary *windowStyle = [options[@"windowStyle"] isKindOfClass:NSDictionary.class] ? options[@"windowStyle"] : @{};
    NSNumber *maskNumber = [windowStyle[@"mask"] isKindOfClass:NSNumber.class] ? windowStyle[@"mask"] : nil;
    NSNumber *transparentTitlebar = [windowStyle[@"titlebarAppearsTransparent"] isKindOfClass:NSNumber.class]
      ? windowStyle[@"titlebarAppearsTransparent"]
      : nil;
    NSString *titleVisibility = [windowStyle[@"titleVisibility"] isKindOfClass:NSString.class]
      ? windowStyle[@"titleVisibility"]
      : nil;
    NSString *toolbarStyle = [windowStyle[@"toolbarStyle"] isKindOfClass:NSString.class] ? windowStyle[@"toolbarStyle"] : nil;
    NSString *titlebarSeparatorStyle = [windowStyle[@"titlebarSeparatorStyle"] isKindOfClass:NSString.class]
      ? windowStyle[@"titlebarSeparatorStyle"]
      : nil;
    NSNumber *levelNumber = [options[@"level"] isKindOfClass:NSNumber.class] ? options[@"level"] : nil;
    BOOL transparentBackground = [options[@"transparentBackground"] boolValue];
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

    if (existingWindow) {
      NSString *existingModuleName = self.moduleNames[identifier] ?: @"";
      NSString *nextModuleName = moduleName ?: @"";
      if (![existingModuleName isEqualToString:nextModuleName]) {
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

      existingWindow.title = title;
      if (darkAppearance) {
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
        [existingRootView setValue:initialProps forKey:@"appProperties"];
      }
      self.moduleNames[identifier] = moduleName ?: @"";
      [existingWindow makeKeyAndOrderFront:nil];
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

    if (darkAppearance) {
      window.appearance = darkAppearance;
    }
    window.releasedWhenClosed = NO;
    window.title = title;
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
    RCTUIView *rootView = [self createReactRootViewWithModuleName:moduleName initialProperties:initialProps];
    if (!rootView) {
      reject(@"no_root_view", @"React root view could not be created", nil);
      return;
    }

    window.contentView = rootView;
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
    window.delegate = self;

    self.windows[identifier] = window;
    self.rootViews[identifier] = rootView;
    self.moduleNames[identifier] = moduleName ?: @"";

    [window makeKeyAndOrderFront:nil];
    if (levelNumber) {
      [window orderFrontRegardless];
    }
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

- (BOOL)windowShouldClose:(NSWindow *)window
{
  return [self identifierForWindow:window] != nil ? YES : NO;
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
  CIFilter *blurFilter = self.windowBlurFilters[identifier];
  if (blurFilter) {
    NSWindow *window = (NSWindow *)self.windows[identifier];
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
