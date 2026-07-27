import {
  WindowStyleMask,
  type WindowOptions,
} from "@legend-apps/window-manager";

const SETTINGS_WINDOW_DEFAULT_HEIGHT = 640;
const SETTINGS_WINDOW_DEFAULT_WIDTH = 820;
const SETTINGS_WINDOW_MIN_HEIGHT = 500;
const SETTINGS_WINDOW_MIN_WIDTH = 720;

export type CreateSettingsWindowOptionsInput = Omit<
  WindowOptions,
  "deferOrderFront" | "windowStyle" | "transparentBackground"
> & {
  initialPage?: string;
  windowStyle?: WindowOptions["windowStyle"];
  transparentBackground?: boolean;
};

export function createSettingsWindowOptions({
  initialPage,
  title = "Settings",
  transparentBackground = true,
  windowStyle,
  ...options
}: CreateSettingsWindowOptionsInput = {}): WindowOptions {
  const initialProperties = initialPage || options.initialProperties
    ? {
        ...(options.initialProperties ?? {}),
        ...(initialPage ? { initialPage } : {}),
      }
    : undefined;

  return {
    ...options,
    deferOrderFront: true,
    initialProperties,
    title,
    transparentBackground,
    windowStyle: {
      hasToolbar: true,
      height: SETTINGS_WINDOW_DEFAULT_HEIGHT,
      mask: [
        WindowStyleMask.Titled,
        WindowStyleMask.Closable,
        WindowStyleMask.Resizable,
        WindowStyleMask.FullSizeContentView,
        WindowStyleMask.UnifiedTitleAndToolbar,
      ],
      minHeight: SETTINGS_WINDOW_MIN_HEIGHT,
      minWidth: SETTINGS_WINDOW_MIN_WIDTH,
      titlebarAppearsTransparent: true,
      titlebarSeparatorStyle: "none",
      titleVisibility: "visible",
      toolbarStyle: "unified",
      width: SETTINGS_WINDOW_DEFAULT_WIDTH,
      ...(windowStyle ?? {}),
    },
  };
}
