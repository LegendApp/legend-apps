import { NativeEventEmitter, Platform } from "react-native";
import NativeWindowManager from "./NativeWindowManager";

const fallbackConstants = {
  STYLE_MASK_BORDERLESS: 0,
  STYLE_MASK_TITLED: 0,
  STYLE_MASK_CLOSABLE: 0,
  STYLE_MASK_MINIATURIZABLE: 0,
  STYLE_MASK_RESIZABLE: 0,
  STYLE_MASK_UNIFIED_TITLE_AND_TOOLBAR: 0,
  STYLE_MASK_FULL_SCREEN: 0,
  STYLE_MASK_FULL_SIZE_CONTENT_VIEW: 0,
  STYLE_MASK_UTILITY_WINDOW: 0,
  STYLE_MASK_DOC_MODAL_WINDOW: 0,
  STYLE_MASK_NONACTIVATING_PANEL: 0,
  WINDOW_LEVEL_NORMAL: 0,
  WINDOW_LEVEL_FLOATING: 0,
  WINDOW_LEVEL_MODAL_PANEL: 0,
  WINDOW_LEVEL_MAIN_MENU: 0,
  WINDOW_LEVEL_STATUS: 0,
  WINDOW_LEVEL_SCREEN_SAVER: 0,
};

function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

const constants = Platform.OS === "macos"
  ? parseJson(NativeWindowManager.getConstantsJson(), fallbackConstants)
  : fallbackConstants;

export enum WindowStyleMask {
  Borderless = "Borderless",
  Titled = "Titled",
  Closable = "Closable",
  Miniaturizable = "Miniaturizable",
  Resizable = "Resizable",
  UnifiedTitleAndToolbar = "UnifiedTitleAndToolbar",
  FullScreen = "FullScreen",
  FullSizeContentView = "FullSizeContentView",
  UtilityWindow = "UtilityWindow",
  DocModalWindow = "DocModalWindow",
  NonactivatingPanel = "NonactivatingPanel",
}

const windowStyleMaskMap: Record<WindowStyleMask, number> = {
  [WindowStyleMask.Borderless]: constants.STYLE_MASK_BORDERLESS,
  [WindowStyleMask.Titled]: constants.STYLE_MASK_TITLED,
  [WindowStyleMask.Closable]: constants.STYLE_MASK_CLOSABLE,
  [WindowStyleMask.Miniaturizable]: constants.STYLE_MASK_MINIATURIZABLE,
  [WindowStyleMask.Resizable]: constants.STYLE_MASK_RESIZABLE,
  [WindowStyleMask.UnifiedTitleAndToolbar]: constants.STYLE_MASK_UNIFIED_TITLE_AND_TOOLBAR,
  [WindowStyleMask.FullScreen]: constants.STYLE_MASK_FULL_SCREEN,
  [WindowStyleMask.FullSizeContentView]: constants.STYLE_MASK_FULL_SIZE_CONTENT_VIEW,
  [WindowStyleMask.UtilityWindow]: constants.STYLE_MASK_UTILITY_WINDOW,
  [WindowStyleMask.DocModalWindow]: constants.STYLE_MASK_DOC_MODAL_WINDOW,
  [WindowStyleMask.NonactivatingPanel]: constants.STYLE_MASK_NONACTIVATING_PANEL,
};

export type WindowLevel = "normal" | "floating" | "modalPanel" | "mainMenu" | "status" | "screenSaver";

const windowLevelMap: Partial<Record<WindowLevel, number>> = {
  normal: constants.WINDOW_LEVEL_NORMAL,
  floating: constants.WINDOW_LEVEL_FLOATING,
  modalPanel: constants.WINDOW_LEVEL_MODAL_PANEL,
  mainMenu: constants.WINDOW_LEVEL_MAIN_MENU,
  status: constants.WINDOW_LEVEL_STATUS,
  screenSaver: constants.WINDOW_LEVEL_SCREEN_SAVER,
};

export type WindowStyleOptions = {
  appearance?: "system" | "light" | "dark";
  contentLayoutMode?: "contentLayoutGuide" | "fullSize";
  mask?: WindowStyleMask[];
  width?: number;
  height?: number;
  minWidth?: number;
  minHeight?: number;
  titlebarAppearsTransparent?: boolean;
  titleVisibility?: "visible" | "hidden";
  toolbarStyle?: "automatic" | "expanded" | "preference" | "unified" | "unifiedCompact";
  titlebarSeparatorStyle?: "automatic" | "none" | "line" | "shadow";
  titlebarMaterial?: "none" | "glass" | "titlebar" | "headerView" | "hudWindow" | "sidebar" | "windowBackground";
  titlebarMaterialBlendingMode?: "behindWindow" | "withinWindow";
  titlebarMaterialState?: "active" | "inactive" | "followsWindowActiveState";
  backgroundColor?: string;
  hasToolbar?: boolean;
  titlebarControls?: WindowTitlebarControl[];
  toolbarItems?: WindowToolbarItem[];
};

export type WindowTitlebarControlPlacement = "left" | "right";

export type WindowTitlebarControl = {
  enabled?: boolean;
  id: string;
  label?: string;
  placement?: WindowTitlebarControlPlacement;
  selected?: boolean;
  systemImageName?: string;
  tooltip?: string;
  type: "button";
};

export type WindowToolbarSegment = {
  label: string;
  systemImageName?: string;
  value: string;
};

export type WindowToolbarItemPlacement = "leading" | "trailing";

export type WindowToolbarSegmentedItem = {
  id: string;
  label?: string;
  placement?: WindowToolbarItemPlacement;
  selectedValue?: string;
  segments: WindowToolbarSegment[];
  type: "segmented";
};

export type WindowToolbarButtonItem = {
  bordered?: boolean;
  enabled?: boolean;
  id: string;
  label?: string;
  placement?: WindowToolbarItemPlacement;
  systemImageName?: string;
  tooltip?: string;
  type: "button";
  value?: string;
};

export type WindowToolbarItem = WindowToolbarButtonItem | WindowToolbarSegmentedItem;

export type WindowOptions = {
  identifier?: string;
  moduleName?: string;
  title?: string;
  representedURL?: string | null;
  x?: number;
  y?: number;
  hasShadow?: boolean;
  windowStyle?: WindowStyleOptions;
  initialProperties?: Record<string, unknown>;
  level?: WindowLevel;
  transparentBackground?: boolean;
  interceptClose?: boolean;
  animateFrameChange?: boolean;
  frameAnimationDurationMs?: number;
};

type NativeWindowStyleOptions = Omit<WindowStyleOptions, "mask"> & {
  mask?: number;
};

type NativeWindowOptions = Omit<WindowOptions, "windowStyle" | "level"> & {
  windowStyle?: NativeWindowStyleOptions;
  width?: number;
  height?: number;
  minWidth?: number;
  minHeight?: number;
  level?: number;
};

export type WindowFrame = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type WindowResult = {
  success: boolean;
  message?: string;
};

export type MainWindowOptions = Pick<WindowOptions, "title" | "representedURL" | "windowStyle">;
export type TargetWindowOptions = Pick<WindowOptions, "title" | "representedURL" | "windowStyle">;

export type WindowClosedEvent = {
  identifier: string;
  moduleName?: string;
};

export type WindowCloseRequestedEvent = {
  identifier: string;
  moduleName?: string;
};

export type ApplicationReopenRequestedEvent = {
  hasVisibleWindows: boolean;
};

export type WindowFocusedEvent = {
  identifier: string;
  moduleName?: string;
};

export type WindowToolbarItemSelectedEvent = {
  identifier: string;
  itemId: string;
  value: string;
};

export type WindowTitlebarControlPressedEvent = {
  controlId: string;
  identifier: string;
};

const emptySubscription = { remove() {} };

function convertMaskArrayToBitwise(mask?: WindowStyleMask[]) {
  if (!mask || mask.length === 0) {
    return undefined;
  }

  return mask.reduce((result, maskValue) => result | windowStyleMaskMap[maskValue], 0);
}

function convertWindowStyleToNative(windowStyle?: WindowStyleOptions): NativeWindowStyleOptions | undefined {
  if (!windowStyle) {
    return undefined;
  }

  const { mask, ...rest } = windowStyle;
  return {
    ...rest,
    mask: convertMaskArrayToBitwise(mask),
  };
}

function convertWindowLevelToNative(level?: WindowLevel) {
  return level ? windowLevelMap[level] : undefined;
}

function convertOptionsToNative(options: WindowOptions = {}): NativeWindowOptions {
  const { level, windowStyle, animateFrameChange, frameAnimationDurationMs, ...rest } = options;
  const nativeWindowStyle = convertWindowStyleToNative(windowStyle);
  const nativeOptions: NativeWindowOptions = {
    ...rest,
    windowStyle: nativeWindowStyle,
  };

  if (nativeWindowStyle?.width !== undefined) {
    nativeOptions.width = nativeWindowStyle.width;
  }
  if (nativeWindowStyle?.height !== undefined) {
    nativeOptions.height = nativeWindowStyle.height;
  }
  if (nativeWindowStyle?.minWidth !== undefined) {
    nativeOptions.minWidth = nativeWindowStyle.minWidth;
  }
  if (nativeWindowStyle?.minHeight !== undefined) {
    nativeOptions.minHeight = nativeWindowStyle.minHeight;
  }

  const nativeLevel = convertWindowLevelToNative(level);
  if (nativeLevel !== undefined) {
    nativeOptions.level = nativeLevel;
  }
  if (animateFrameChange !== undefined) {
    nativeOptions.animateFrameChange = animateFrameChange;
  }
  if (frameAnimationDurationMs !== undefined) {
    nativeOptions.frameAnimationDurationMs = frameAnimationDurationMs;
  }

  return nativeOptions;
}

function fallbackResult(message = "WindowManager is only available on macOS"): Promise<WindowResult> {
  return Promise.resolve({ success: false, message });
}

export function openWindow(options: WindowOptions = {}): Promise<WindowResult> {
  if (Platform.OS !== "macos") {
    return fallbackResult();
  }
  return NativeWindowManager.openWindow(JSON.stringify(convertOptionsToNative(options))).then((value) =>
    parseJson(value, { success: false, message: "Invalid native response" }),
  );
}

export function closeWindow(identifier = ""): Promise<WindowResult> {
  if (Platform.OS !== "macos") {
    return fallbackResult();
  }
  return NativeWindowManager.closeWindow(identifier).then((value) =>
    parseJson(value, { success: false, message: "Invalid native response" }),
  );
}

export function closeFrontmostWindow(): Promise<WindowResult> {
  if (Platform.OS !== "macos") {
    return fallbackResult();
  }
  return NativeWindowManager.closeFrontmostWindow().then((value) =>
    parseJson(value, { success: false, message: "Invalid native response" }),
  );
}

export function showMainWindow(): Promise<WindowResult> {
  if (Platform.OS !== "macos") {
    return fallbackResult();
  }
  return NativeWindowManager.showMainWindow().then((value) =>
    parseJson(value, { success: false, message: "Invalid native response" }),
  );
}

export function setMainWindowOptions(options: MainWindowOptions = {}): Promise<WindowResult> {
  if (Platform.OS !== "macos") {
    return fallbackResult();
  }
  return NativeWindowManager.setMainWindowOptions(JSON.stringify(convertOptionsToNative(options))).then((value) =>
    parseJson(value, { success: false, message: "Invalid native response" }),
  );
}

export function setWindowOptions(identifier: string, options: TargetWindowOptions = {}): Promise<WindowResult> {
  if (Platform.OS !== "macos") {
    return fallbackResult();
  }
  return NativeWindowManager.setWindowOptions(identifier, JSON.stringify(convertOptionsToNative(options))).then((value) =>
    parseJson(value, { success: false, message: "Invalid native response" }),
  );
}

export function getMainWindowFrame(): Promise<WindowFrame> {
  if (Platform.OS !== "macos") {
    return Promise.resolve({ x: 0, y: 0, width: 0, height: 0 });
  }
  return NativeWindowManager.getMainWindowFrame().then((value) =>
    parseJson(value, { x: 0, y: 0, width: 0, height: 0 }),
  );
}

export function setMainWindowFrame(frame: WindowFrame): Promise<WindowResult> {
  if (Platform.OS !== "macos") {
    return fallbackResult();
  }
  return NativeWindowManager.setMainWindowFrame(JSON.stringify(frame)).then((value) =>
    parseJson(value, { success: false, message: "Invalid native response" }),
  );
}

export function setWindowBlur(identifier: string, radius: number, durationMs = 0): Promise<WindowResult> {
  if (Platform.OS !== "macos") {
    return fallbackResult();
  }
  return NativeWindowManager.setWindowBlur(identifier, radius, durationMs).then((value) =>
    parseJson(value, { success: false, message: "Invalid native response" }),
  );
}

export function setWindowTitle(identifier: string, title: string): Promise<WindowResult> {
  if (Platform.OS !== "macos") {
    return fallbackResult();
  }
  return NativeWindowManager.setWindowTitle(identifier, title).then((value) =>
    parseJson(value, { success: false, message: "Invalid native response" }),
  );
}

export function addWindowClosedListener(listener: (event: WindowClosedEvent) => void) {
  if (Platform.OS !== "macos") {
    return emptySubscription;
  }
  return new NativeEventEmitter(NativeWindowManager as never).addListener("onWindowClosed", listener);
}

export function addWindowCloseRequestedListener(listener: (event: WindowCloseRequestedEvent) => void) {
  if (Platform.OS !== "macos") {
    return emptySubscription;
  }
  return new NativeEventEmitter(NativeWindowManager as never).addListener("onWindowCloseRequested", listener);
}

export function addWindowFocusedListener(listener: (event: WindowFocusedEvent) => void) {
  if (Platform.OS !== "macos") {
    return emptySubscription;
  }
  return new NativeEventEmitter(NativeWindowManager as never).addListener("onWindowFocused", listener);
}

export function addApplicationReopenRequestedListener(listener: (event: ApplicationReopenRequestedEvent) => void) {
  if (Platform.OS !== "macos") {
    return emptySubscription;
  }
  return new NativeEventEmitter(NativeWindowManager as never).addListener("onApplicationReopenRequested", listener);
}

export function addWindowToolbarItemSelectedListener(listener: (event: WindowToolbarItemSelectedEvent) => void) {
  if (Platform.OS !== "macos") {
    return emptySubscription;
  }
  return new NativeEventEmitter(NativeWindowManager as never).addListener("onToolbarItemSelected", listener);
}

export function addWindowTitlebarControlPressedListener(listener: (event: WindowTitlebarControlPressedEvent) => void) {
  if (Platform.OS !== "macos") {
    return emptySubscription;
  }
  return new NativeEventEmitter(NativeWindowManager as never).addListener("onTitlebarControlPressed", listener);
}

export function addMainWindowMovedListener(listener: (frame: WindowFrame) => void) {
  if (Platform.OS !== "macos") {
    return emptySubscription;
  }
  return new NativeEventEmitter(NativeWindowManager as never).addListener("onMainWindowMoved", listener);
}

export function addMainWindowResizedListener(listener: (frame: WindowFrame) => void) {
  if (Platform.OS !== "macos") {
    return emptySubscription;
  }
  return new NativeEventEmitter(NativeWindowManager as never).addListener("onMainWindowResized", listener);
}

export function useWindowManager() {
  return {
    openWindow,
    closeWindow,
    closeFrontmostWindow,
    showMainWindow,
    setMainWindowOptions,
    setWindowOptions,
    getMainWindowFrame,
    setMainWindowFrame,
    setWindowBlur,
    setWindowTitle,
    onWindowClosed: addWindowClosedListener,
    onWindowCloseRequested: addWindowCloseRequestedListener,
    onWindowFocused: addWindowFocusedListener,
    onApplicationReopenRequested: addApplicationReopenRequestedListener,
    onWindowTitlebarControlPressed: addWindowTitlebarControlPressedListener,
    onWindowToolbarItemSelected: addWindowToolbarItemSelectedListener,
    onMainWindowMoved: addMainWindowMovedListener,
    onMainWindowResized: addMainWindowResizedListener,
  };
}

export { default as NativeWindowManager } from "./NativeWindowManager";
