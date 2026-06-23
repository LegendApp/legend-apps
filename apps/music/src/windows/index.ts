import { createSettingsWindowOptions } from "@legend-desktop/settings-window";
import {
    createBorderlessOverlayWindowStyle,
    createUnifiedToolbarWindowStyle,
    createWindowsNavigator,
    type WindowsConfig,
} from "@legend-desktop/windows";
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
            windowStyle: createUnifiedToolbarWindowStyle({
                frame: {
                    width: 800,
                    height: 600,
                    minWidth: 400,
                    minHeight: 400,
                },
                includeFrame: true,
            }),
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
            windowStyle: createBorderlessOverlayWindowStyle({
                width: OVERLAY_WINDOW_WIDTH_COMPACT,
                height: OVERLAY_WINDOW_HEIGHT_COMPACT,
                minWidth: OVERLAY_WINDOW_WIDTH_COMPACT,
                minHeight: OVERLAY_WINDOW_HEIGHT_COMPACT,
            }),
        },
    },
} satisfies WindowsConfig;

export const WindowsNavigator = createWindowsNavigator(windowsConfig);

export type RegisteredWindow = keyof typeof windowsConfig;

export * from "@legend-desktop/windows";
