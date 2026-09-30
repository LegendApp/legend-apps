import { createSettingsWindowOptions } from "@legendapp/spark/settings/window";
import { createWindowsNavigator, type WindowsConfig, } from "@legendapp/spark/windows";
import { OVERLAY_WINDOW_HEIGHT_COMPACT, OVERLAY_WINDOW_WIDTH_COMPACT } from "../overlay/OverlayConstants";
const windowsConfig = {
    SettingsWindow: {
        loadComponent: () => import("../settings/SettingsContainer"),
        id: "settings",
        options: createSettingsWindowOptions(),
    },
    MediaLibraryWindow: {
        loadComponent: () => import("../media-library/MediaLibraryWindow"),
        id: "media-library",
        options: { title: "", transparent: true, size: { width: 800, height: 600 }, minSize: { width: 400, height: 400 }, macos: { restoreOnLaunch: true, titleBar: { contentLayout: "fullSize", transparent: true, titleVisibility: "hidden" } } },
    },
    CurrentSongOverlayWindow: {
        loadComponent: () => import("../overlay/CurrentSongOverlayWindow"),
        id: "current-song-overlay",
        options: {
            title: "",
            transparent: true,
            hasShadow: false,
            ...{
                size: {
                    width: OVERLAY_WINDOW_WIDTH_COMPACT,
                    height: OVERLAY_WINDOW_HEIGHT_COMPACT
                },
                minSize: {
                    width: OVERLAY_WINDOW_WIDTH_COMPACT,
                    height: OVERLAY_WINDOW_HEIGHT_COMPACT
                },
                kind: "overlay",
                titleBarStyle: "borderless"
            },
            macos: {
                level: "status"
            }
        },
    },
} satisfies WindowsConfig;
export const WindowsNavigator = createWindowsNavigator(windowsConfig);
export type RegisteredWindow = keyof typeof windowsConfig;
export * from "@legendapp/spark/windows";
