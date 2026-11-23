import { Appearance, type ColorSchemeName } from "react-native";

type MusicThemeAppearance = "dark" | "light";
export type MusicThemeName = MusicThemeAppearance | "auto";

export interface MusicThemeColors {
    background: {
        primary: string;
        secondary: string;
        tertiary: string;
        destructive: string;
        inverse: string;
    };
    text: {
        primary: string;
        secondary: string;
        tertiary: string;
    };
    accent: {
        primary: string;
        secondary: string;
    };
    border: {
        primary: string;
        popup: string;
    };
}

export interface MusicTheme {
    appearance: MusicThemeAppearance;
    colors: MusicThemeColors;
    label: string;
    name: MusicThemeAppearance;
    windowBackground: string;
}

export const musicThemes: Record<MusicThemeAppearance, MusicTheme> = {
    dark: {
        appearance: "dark",
        colors: {
            background: {
                primary: "#111111",
                secondary: "#17181A",
                tertiary: "#212224",
                destructive: "#8b0000",
                inverse: "#ffffff",
            },
            text: {
                primary: "#ffffff",
                secondary: "#aaaaaa",
                tertiary: "#777777",
            },
            accent: {
                primary: "#0088ff",
                secondary: "#00aaff",
            },
            border: {
                primary: "#252730",
                popup: "#4f4e4f",
            },
        },
        label: "Dark",
        name: "dark",
        windowBackground: "#191A1B",
    },
    light: {
        appearance: "light",
        colors: {
            background: {
                primary: "#f5f6f8",
                secondary: "#ffffff",
                tertiary: "#eef0f4",
                destructive: "#b42318",
                inverse: "#111827",
            },
            text: {
                primary: "#111827",
                secondary: "#4b5563",
                tertiary: "#6b7280",
            },
            accent: {
                primary: "#2563eb",
                secondary: "#0ea5e9",
            },
            border: {
                primary: "#d1d5db",
                popup: "#9ca3af",
            },
        },
        label: "Light",
        name: "light",
        windowBackground: "#f5f6f8",
    },
};

export const musicThemeOptions = [
    { label: musicThemes.light.label, value: "light" },
    { label: musicThemes.dark.label, value: "dark" },
    { label: "Auto", value: "auto" },
] as const;

export function isMusicThemeName(value: unknown): value is MusicThemeName {
    return value === "dark" || value === "light" || value === "auto";
}

export function getMusicTheme(themeName: unknown, systemScheme?: ColorSchemeName): MusicTheme {
    if (themeName === "auto") {
        const scheme = systemScheme === undefined ? Appearance.getColorScheme() : systemScheme;
        return scheme === "light" ? musicThemes.light : musicThemes.dark;
    }
    return themeName === "light" ? musicThemes.light : musicThemes.dark;
}

export function getMusicWindowAppearance(themeName: MusicThemeName) {
    return themeName === "auto" ? "system" : themeName;
}
