import {
    defaultMusicBackground,
    normalizeMusicAppearanceSettings,
} from "@/systems/Settings";
import {
    getMusicTheme,
    getMusicThemeAppearance,
    isMusicThemeName,
    musicThemeOptions,
} from "@/theme/musicThemes";

describe("music appearance themes", () => {
    it("uses local light and dark theme options", () => {
        expect(musicThemeOptions).toEqual([
            { label: "Dark", value: "dark" },
            { label: "Light", value: "light" },
        ]);
        expect(getMusicThemeAppearance("dark")).toBe("dark");
        expect(getMusicThemeAppearance("light")).toBe("light");
    });

    it("falls back to the dark theme for invalid theme names", () => {
        expect(isMusicThemeName("grey")).toBe(false);
        expect(getMusicTheme("grey").name).toBe("dark");
    });

    it("normalizes missing music appearance settings", () => {
        expect(normalizeMusicAppearanceSettings({ theme: "" })).toEqual({
            background: defaultMusicBackground,
            theme: "dark",
        });
    });

    it("accepts alpha in hex or rgba background colors", () => {
        expect(
            normalizeMusicAppearanceSettings({
                background: {
                    color: "rgba(0, 0, 0, 0.27)",
                    glassEnabled: false,
                },
                theme: "light",
            }),
        ).toEqual({
            background: {
                color: "rgba(0, 0, 0, 0.27)",
                glassEnabled: false,
            },
            theme: "light",
        });

        expect(
            normalizeMusicAppearanceSettings({
                background: {
                    color: "#00000044",
                    glassEnabled: true,
                },
                theme: "dark",
            }),
        ).toEqual({
            background: {
                color: "#00000044",
                glassEnabled: true,
            },
            theme: "dark",
        });
    });

    it("migrates old color-source or tint settings into one background color", () => {
        expect(
            normalizeMusicAppearanceSettings({
                background: {
                    glassEnabled: true,
                    opacity: 0.8,
                    source: {
                        color: "#101014cc",
                        type: "color",
                    },
                    tint: {
                        color: "#00000044",
                        enabled: true,
                    },
                },
                theme: "dark",
            }),
        ).toEqual({
            background: {
                color: "#101014cc",
                glassEnabled: true,
            },
            theme: "dark",
        });
    });

    it("falls back to the default background color for invalid colors", () => {
        expect(
            normalizeMusicAppearanceSettings({
                background: {
                    color: "transparent",
                    glassEnabled: true,
                },
                theme: "dark",
            }).background.color,
        ).toBe(defaultMusicBackground.color);
    });
});
