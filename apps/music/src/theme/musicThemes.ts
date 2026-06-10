export type MusicThemeName = "dark" | "light";
export type MusicThemeAppearance = "dark" | "light";

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
    name: MusicThemeName;
    windowBackground: string;
}

export const musicThemes: Record<MusicThemeName, MusicTheme> = {
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

export const musicThemeOptions = Object.values(musicThemes).map((theme) => ({
    label: theme.label,
    value: theme.name,
}));

export function isMusicThemeName(value: unknown): value is MusicThemeName {
    return value === "dark" || value === "light";
}

export function getMusicTheme(themeName: unknown): MusicTheme {
    return isMusicThemeName(themeName) ? musicThemes[themeName] : musicThemes.dark;
}

export function getMusicThemeAppearance(themeName: unknown): MusicThemeAppearance {
    return getMusicTheme(themeName).appearance;
}
