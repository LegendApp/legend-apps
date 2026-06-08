import { createObservableFile } from "@legend-desktop/storage";
import type { LegendThemeBackground, LegendThemeBackgroundSource } from "@legend-desktop/theme";
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
    | "toggleLibrary"
    | "spacer";

export interface UIControlLayout<T extends string> {
    shown: T[];
}

export interface UISettingsConfig {
    playbackControlsEnabled: boolean;
    playback: UIControlLayout<PlaybackControlId>;
}

export type MusicThemeSetting = string;

export interface MusicAppearanceSettings {
    background: LegendThemeBackground;
    theme: MusicThemeSetting;
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
    appearance: MusicAppearanceSettings;
    playback: PlaybackSettingsConfig;
    ui: UISettingsConfig;
    uniqueId: string;
    isAuthed: boolean;
}

export const defaultMusicBackground: LegendThemeBackground = {
    glassEnabled: false,
    opacity: 1,
    source: {
        type: "none",
    },
    tint: {
        color: "#00000044",
        enabled: false,
    },
};

export const defaultMusicAppearance: MusicAppearanceSettings = {
    background: defaultMusicBackground,
    theme: "dark",
};

function isColor(value: unknown): value is string {
    return typeof value === "string" && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value);
}

function normalizeBackgroundSource(value: unknown): LegendThemeBackgroundSource {
    if (!value || typeof value !== "object") {
        return defaultMusicBackground.source;
    }

    const source = value as Partial<LegendThemeBackgroundSource>;
    if (source.type === "color" && isColor(source.color)) {
        return {
            color: source.color,
            type: "color",
        };
    }

    if (source.type === "image" && typeof source.imagePath === "string") {
        return {
            imagePath: source.imagePath,
            type: "image",
        };
    }

    return {
        type: "none",
    };
}

export function normalizeMusicAppearanceSettings(value: unknown): MusicAppearanceSettings {
    const settings = value && typeof value === "object" ? value as Partial<MusicAppearanceSettings> : {};
    const background = settings.background && typeof settings.background === "object"
        ? settings.background as Partial<LegendThemeBackground>
        : {};
    const tint = background.tint && typeof background.tint === "object"
        ? background.tint as Partial<LegendThemeBackground["tint"]>
        : {};
    const opacity = typeof background.opacity === "number" ? Math.max(0, Math.min(1, background.opacity)) : 1;

    return {
        background: {
            glassEnabled: typeof background.glassEnabled === "boolean"
                ? background.glassEnabled
                : defaultMusicBackground.glassEnabled,
            opacity,
            source: normalizeBackgroundSource(background.source),
            tint: {
                color: isColor(tint.color) ? tint.color : defaultMusicBackground.tint.color,
                enabled: typeof tint.enabled === "boolean" ? tint.enabled : defaultMusicBackground.tint.enabled,
            },
        },
        theme: typeof settings.theme === "string" && settings.theme.length > 0
            ? settings.theme
            : defaultMusicAppearance.theme,
    };
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
        appearance: defaultMusicAppearance,
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
                    "toggleLibrary",
                ],
            },
        },
        uniqueId: "",
        isAuthed: false,
    },
    subfolder: "data",
});

export function ensureMusicAppearanceSettings() {
    const current = settings$.appearance.get();
    const normalized = normalizeMusicAppearanceSettings(current);
    if (JSON.stringify(current) !== JSON.stringify(normalized)) {
        settings$.appearance.set(normalized);
    }
    return normalized;
}
