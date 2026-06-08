import { createObservableFile } from "@legend-desktop/storage";
import { createAppTheme } from "@legend-desktop/theme";
import { colors } from "./colors";

type ThemeType = "dark";

const appTheme = createAppTheme<ThemeType, typeof colors>({
    colors,
    createObservableFile,
    defaultTheme: "dark",
    subfolder: "data",
});

export const themeState$ = appTheme.themeState$;
export const ThemeProvider = appTheme.ThemeProvider;
export const useTheme = appTheme.useTheme;
