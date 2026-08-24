import { createObservableFile } from "@legend-apps/storage";
import type { KeyboardEventCodeHotkey } from "./keyboard/Keyboard";
import { KeyCodes } from "./keyboard/KeyboardManager";
import { isMusicThemeName, type MusicThemeName } from "../theme/musicThemes";

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

export type MusicProviderId = "local" | "spotify" | "appleMusic";
export type AITrackSource = "any" | MusicProviderId;

export interface SpotifySettingsConfig {
    enabled: boolean;
    clientId: string;
    accessToken: string;
    refreshToken: string;
    expiresAt: number;
    displayName: string;
    product: string;
    codeVerifier: string;
    codeState: string;
}

export interface AppleMusicSettingsConfig {
    enabled: boolean;
    developerToken: string;
    userToken: string;
    storefront: string;
    userName: string;
    subscription: string;
}

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

export type MusicThemeSetting = MusicThemeName;

export interface MusicBackgroundSettings {
    color: string;
    glassEnabled: boolean;
}

export interface MusicAppearanceSettings {
    background: MusicBackgroundSettings;
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
    providers: {
        spotify: SpotifySettingsConfig;
        appleMusic: AppleMusicSettingsConfig;
    };
    ai: {
        source: AITrackSource;
    };
    ui: UISettingsConfig;
    uniqueId: string;
    isAuthed: boolean;
}

export const defaultMusicBackground: MusicBackgroundSettings = {
    color: "#00000044",
    glassEnabled: true,
};

export const defaultMusicAppearance: MusicAppearanceSettings = {
    background: defaultMusicBackground,
    theme: "dark",
};

function isColor(value: unknown): value is string {
    if (typeof value !== "string") {
        return false;
    }

    if (/^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value)) {
        return true;
    }

    return /^rgba?\(\s*(25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(25[0-5]|2[0-4]\d|1?\d?\d)\s*,\s*(25[0-5]|2[0-4]\d|1?\d?\d)(\s*,\s*(0|1|0?\.\d+))?\s*\)$/i.test(value);
}

function normalizeMusicBackgroundColor(background: Record<string, unknown>): string {
    if (isColor(background.color)) {
        return background.color;
    }

    const source = background.source;
    if (source && typeof source === "object" && !Array.isArray(source)) {
        const sourceRecord = source as Record<string, unknown>;
        if (sourceRecord.type === "color" && isColor(sourceRecord.color)) {
            return sourceRecord.color;
        }
    }

    const tint = background.tint;
    if (tint && typeof tint === "object" && !Array.isArray(tint)) {
        const tintRecord = tint as Record<string, unknown>;
        if (tintRecord.enabled === true && isColor(tintRecord.color)) {
            return tintRecord.color;
        }
    }

    return defaultMusicBackground.color;
}

export function normalizeMusicAppearanceSettings(value: unknown): MusicAppearanceSettings {
    const settings = value && typeof value === "object" ? value as Partial<MusicAppearanceSettings> : {};
    const background = settings.background && typeof settings.background === "object" && !Array.isArray(settings.background)
        ? settings.background as unknown as Record<string, unknown>
        : {};

    return {
        background: {
            color: normalizeMusicBackgroundColor(background),
            glassEnabled: typeof background.glassEnabled === "boolean"
                ? background.glassEnabled
                : defaultMusicBackground.glassEnabled,
        },
        theme: isMusicThemeName(settings.theme)
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
        providers: {
            spotify: {
                enabled: false,
                clientId: "",
                accessToken: "",
                refreshToken: "",
                expiresAt: 0,
                displayName: "",
                product: "",
                codeVerifier: "",
                codeState: "",
            },
            appleMusic: {
                enabled: false,
                developerToken: "",
                userToken: "",
                storefront: "",
                userName: "",
                subscription: "",
            },
        },
        ai: {
            source: "any",
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

export function ensureMusicProviderSettings() {
    if (!settings$.providers.peek()) {
        settings$.providers.set({
            spotify: {
                enabled: false,
                clientId: "",
                accessToken: "",
                refreshToken: "",
                expiresAt: 0,
                displayName: "",
                product: "",
                codeVerifier: "",
                codeState: "",
            },
            appleMusic: {
                enabled: false,
                developerToken: "",
                userToken: "",
                storefront: "",
                userName: "",
                subscription: "",
            },
        });
    }
    if (!settings$.ai.peek()) {
        settings$.ai.set({ source: "any" });
    }
}
