import { createSettingsWindowOptions } from "@legend-desktop/settings-window";
import { createWindowsNavigator, WindowStyleMask, type WindowsConfig } from "@legend-desktop/windows";
import { OVERLAY_WINDOW_HEIGHT_COMPACT, OVERLAY_WINDOW_WIDTH_COMPACT } from "@/overlay/OverlayConstants";

const windowsConfig = {
    SettingsWindow: {
        loadComponent: () => import("@/settings/SettingsContainer"),
        identifier: "settings",
        options: createSettingsWindowOptions(),
    },
    MediaLibraryWindow: {
        loadComponent: () => import("@/media-library/MediaLibraryWindow"),
        identifier: "media-library",
        options: {
            title: "",
            transparentBackground: true,
            windowStyle: {
                width: 800,
                height: 600,
                minWidth: 400,
                minHeight: 400,
                mask: [
                    WindowStyleMask.Titled,
                    WindowStyleMask.Closable,
                    WindowStyleMask.Resizable,
                    WindowStyleMask.FullSizeContentView,
                    WindowStyleMask.UnifiedTitleAndToolbar,
                ],
                titlebarAppearsTransparent: true,
                toolbarStyle: "unified",
                hasToolbar: true,
            },
        },
    },
    CurrentSongOverlayWindow: {
        loadComponent: () => import("@/overlay/CurrentSongOverlayWindow"),
        identifier: "current-song-overlay",
        options: {
            title: "",
            level: "status",
            transparentBackground: true,
            hasShadow: false,
            windowStyle: {
                width: OVERLAY_WINDOW_WIDTH_COMPACT,
                height: OVERLAY_WINDOW_HEIGHT_COMPACT,
                minWidth: OVERLAY_WINDOW_WIDTH_COMPACT,
                minHeight: OVERLAY_WINDOW_HEIGHT_COMPACT,
                mask: [
                    WindowStyleMask.Borderless,
                    WindowStyleMask.NonactivatingPanel,
                    WindowStyleMask.FullSizeContentView,
                ],
                titlebarAppearsTransparent: true,
            },
        },
    },
} satisfies WindowsConfig;

export const WindowsNavigator = createWindowsNavigator(windowsConfig);

export type RegisteredWindow = keyof typeof windowsConfig;

export * from "@legend-desktop/windows";
