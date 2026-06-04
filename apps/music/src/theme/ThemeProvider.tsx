import { createAppTheme } from "@legend-desktop/theme";
import { createJSONManager } from "@/utils/JSONManager";
import { colors } from "./colors";

type ThemeType = "dark";

const appTheme = createAppTheme<ThemeType, typeof colors>({
    colors,
    createJSONManager,
    defaultTheme: "dark",
});

export const themeState$ = appTheme.themeState$;
export const ThemeProvider = appTheme.ThemeProvider;
export const useTheme = appTheme.useTheme;
