import {
    getLegendThemeAppearance,
    isLegendThemeFile,
    loadUserThemeFilesSync,
    type ThemeStorage,
} from "@legend-desktop/theme";
import {
    defaultMusicBackground,
    normalizeMusicAppearanceSettings,
} from "@/systems/Settings";

const validColors = {
    background: "#101014",
    blockquoteBackground: "#15151a",
    blockquoteBorder: "#444455",
    border: "#ffffff22",
    code: "#08080a",
    codeForeground: "#f5f5f5",
    danger: "#ff5555",
    foreground: "#f5f5f5",
    muted: "#999999",
    primary: "#7ab7ff",
    selection: "auto",
    surface: "#181820cc",
    surfaceMuted: "#242436aa",
    tableHeader: "#22222a",
    tableRowAlt: "#15151a",
    windowBackground: "#090b10",
};

describe("music appearance themes", () => {
    it("uses explicit theme appearance for native surfaces", () => {
        expect(getLegendThemeAppearance("grey")).toBe("dark");
    });

    it("accepts theme files with transparent music backgrounds", () => {
        expect(
            isLegendThemeFile({
                appearance: "dark",
                background: {
                    glassEnabled: true,
                    opacity: 0.8,
                    source: {
                        color: "#090b10cc",
                        type: "color",
                    },
                    tint: {
                        color: "#00000044",
                        enabled: true,
                    },
                },
                colors: validColors,
                name: "Midnight Album",
            }),
        ).toBe(true);
    });

    it("rejects invalid theme appearance values", () => {
        expect(
            isLegendThemeFile({
                appearance: "dim",
                colors: validColors,
                name: "Invalid Appearance",
            }),
        ).toBe(false);
    });

    it("rejects invalid theme background colors", () => {
        expect(
            isLegendThemeFile({
                background: {
                    glassEnabled: true,
                    opacity: 0.8,
                    source: {
                        color: "black",
                        type: "color",
                    },
                    tint: {
                        color: "#00000044",
                        enabled: true,
                    },
                },
                colors: validColors,
                name: "Invalid",
            }),
        ).toBe(false);
    });

    it("normalizes missing or out-of-range music appearance settings", () => {
        expect(
            normalizeMusicAppearanceSettings({
                background: {
                    glassEnabled: true,
                    opacity: 2,
                    source: {
                        type: "none",
                    },
                    tint: {
                        color: "transparent",
                        enabled: true,
                    },
                },
                theme: "",
            }),
        ).toEqual({
            background: {
                ...defaultMusicBackground,
                glassEnabled: true,
                opacity: 1,
                tint: {
                    color: defaultMusicBackground.tint.color,
                    enabled: true,
                },
            },
            theme: "dark",
        });
    });

    it("loads valid user themes and reports invalid files", () => {
        const storage: ThemeStorage = {
            ensureDirectory: jest.fn(() => ({ name: "themes", uri: "file:///themes" })),
            list: jest.fn(() => [{ name: "valid.json" }, { name: "invalid.json" }]),
            read<T = unknown>(path: string): T | undefined {
                if (path.endsWith("/valid.json")) {
                    return {
                        colors: validColors,
                        name: "Valid",
                    } as T;
                }
                return { name: "Invalid" } as T;
            },
        };

        const result = loadUserThemeFilesSync({
            replaceRegisteredUserThemes: false,
            storage,
        });

        expect(result.themes.map((theme) => theme.name)).toEqual(["Valid"]);
        expect(result.issues).toEqual([
            { filename: "invalid.json", message: "Theme file is missing required fields or valid colors." },
        ]);
    });
});
