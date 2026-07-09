import { createObservableFile } from "@legend-apps/storage";
import { createAppTheme } from "@legend-apps/theme";
import { useValue } from "@legendapp/state/react";
import { useEffect, type ReactNode } from "react";
import { normalizeMusicAppearanceSettings, settings$ } from "../systems/Settings";
import { colors } from "./colors";
import { getMusicTheme } from "./musicThemes";

type ThemeType = "dark";

const appTheme = createAppTheme<ThemeType, typeof colors>({
    colors,
    createObservableFile,
    defaultTheme: "dark",
    subfolder: "data",
});

const BaseThemeProvider = appTheme.ThemeProvider;

function clone<T>(value: T): T {
    return JSON.parse(JSON.stringify(value));
}

export const themeState$ = appTheme.themeState$;
export function ThemeProvider({ children }: { children: ReactNode }) {
    const appearance = normalizeMusicAppearanceSettings(useValue(settings$.appearance));

    useEffect(() => {
        themeState$.customColors.dark.set(clone(getMusicTheme(appearance.theme).colors));
    }, [appearance.theme]);

    return <BaseThemeProvider>{children}</BaseThemeProvider>;
}
export const useTheme = appTheme.useTheme;
