import { createObservableFile } from "@legend-desktop/storage";
import type { KeyboardEventCodeHotkey } from "@/systems/keyboard/Keyboard";
import { KeyCodes } from "@/systems/keyboard/KeyboardManager";

export type PlaylistStyle = "compact";

export type OverlayVerticalPosition = "top" | "middle" | "bottom";
export type OverlayHorizontalPosition = "left" | "center" | "right";

export const OVERLAY_MIN_DISPLAY_DURATION_SECONDS = 1;
export const OVERLAY_MAX_DISPLAY_DURATION_SECONDS = 30;

export interface OverlaySettingsConfig {
    enabled: boolean;
    displayDurationSeconds: number;
    position: {
        vertical: OverlayVerticalPosition;
        horizontal: OverlayHorizontalPosition;
    };
}

export type RepeatMode = "off" | "all" | "one";

export interface PlaybackSettingsConfig {
    shuffle: boolean;
    repeatMode: RepeatMode;
}

export type PlaybackControlId =
    | "previous"
    | "playPause"
    | "next"
    | "shuffle"
    | "repeat"
    | "search"
    | "savePlaylist"
    | "toggleVisualizer"
    | "toggleLibrary"
    | "spacer";

export interface UIControlLayout<T extends string> {
    shown: T[];
}

export interface UISettingsConfig {
    playbackControlsEnabled: boolean;
    playback: UIControlLayout<PlaybackControlId>;
}

export interface AppSettings {
    state: {
        sidebarWidth: number;
        isSidebarOpen: boolean;
        panels: Record<string, number>;
    };
    library: {
        paths: string[];
        autoScanOnStart: boolean;
        lastScanTime: number;
    };
    general: {
        playlistStyle: PlaylistStyle;
        showHints: boolean;
        showTitleBarOnHover: boolean;
        globalHotkeyEnabled: boolean;
        globalHotkey: KeyboardEventCodeHotkey | null;
    };
    registration: {
        isRegistered: boolean;
        registrationType?: "legendkit" | "standalone";
    };
    overlay: OverlaySettingsConfig;
    playback: PlaybackSettingsConfig;
    ui: UISettingsConfig;
    uniqueId: string;
    isAuthed: boolean;
}

export const settings$ = createObservableFile<AppSettings>({
    filename: "settings",
    initialValue: {
        // State
        state: {
            sidebarWidth: 140,
            isSidebarOpen: true,
            panels: {},
        },
        library: {
            paths: [],
            autoScanOnStart: true,
            lastScanTime: 0,
        },
        // General settings
        general: {
            playlistStyle: "compact",
            showHints: true,
            showTitleBarOnHover: true,
            globalHotkeyEnabled: false,
            globalHotkey: `${KeyCodes.MODIFIER_COMMAND}+${KeyCodes.MODIFIER_SHIFT}+${KeyCodes.KEY_L}` as KeyboardEventCodeHotkey,
        },
        // Registration settings
        registration: {
            isRegistered: false,
        },
        overlay: {
            enabled: true,
            displayDurationSeconds: 2.5,
            position: {
                vertical: "bottom",
                horizontal: "center",
            },
        },
        playback: {
            shuffle: false,
            repeatMode: "off",
        },
        ui: {
            playbackControlsEnabled: true,
            playback: {
                shown: [
                    "previous",
                    "playPause",
                    "next",
                    "spacer",
                    "search",
                    "savePlaylist",
                    "toggleVisualizer",
                    "toggleLibrary",
                ],
            },
        },
        uniqueId: "",
        isAuthed: false,
    },
    subfolder: "data",
});
