import { generatedThemeFiles } from "./generatedThemes";
import type { LegendTheme, LegendThemeFile, LegendThemeName } from "./types";

export type {
  LegendTheme,
  LegendThemeColors,
  LegendThemeFile,
  LegendThemeName,
} from "./types";

function createLegendTheme(theme: LegendThemeFile): LegendTheme {
  const { colors } = theme;

  return {
    ...theme,
    markdownDocument: {
      backgroundColor: colors.background,
      errorColor: colors.danger,
      foregroundColor: colors.foreground,
      mutedForegroundColor: colors.muted,
    },
    markdownStyle: {
      blockquote: {
        backgroundColor: colors.blockquoteBackground,
        borderColor: colors.blockquoteBorder,
        borderWidth: 3,
        color: colors.foreground,
        fontSize: 15,
        lineHeight: 23,
      },
      code: {
        backgroundColor: colors.inlineCodeBackground ?? colors.surfaceMuted,
        color: colors.inlineCodeForeground ?? colors.foreground,
        fontFamily: "Menlo",
        fontSize: 14,
      },
      codeBlock: {
        backgroundColor: colors.code,
        borderColor: colors.border,
        borderRadius: 6,
        borderWidth: 1,
        color: colors.codeForeground,
        fontFamily: "Menlo",
        fontSize: 13,
        lineHeight: 20,
        padding: 12,
      },
      h1: {
        color: colors.foreground,
        fontSize: 30,
        fontWeight: "700",
        lineHeight: 38,
        marginBottom: 8,
      },
      h2: {
        color: colors.foreground,
        fontSize: 24,
        fontWeight: "700",
        lineHeight: 32,
        marginBottom: 6,
      },
      h3: {
        color: colors.foreground,
        fontSize: 20,
        fontWeight: "700",
        lineHeight: 28,
        marginBottom: 4,
      },
      h4: {
        color: colors.foreground,
        fontSize: 18,
        fontWeight: "700",
        lineHeight: 26,
        marginBottom: 4,
      },
      h5: {
        color: colors.foreground,
        fontSize: 16,
        fontWeight: "700",
        lineHeight: 24,
        marginBottom: 4,
      },
      h6: {
        color: colors.muted,
        fontSize: 14,
        fontWeight: "700",
        lineHeight: 22,
        marginBottom: 4,
      },
      link: {
        color: colors.link ?? colors.primary,
        underline: true,
      },
      list: {
        color: colors.foreground,
        fontSize: 16,
        gapWidth: 8,
        lineHeight: 25,
        markerColor: colors.muted,
      },
      paragraph: {
        color: colors.foreground,
        fontSize: 16,
        lineHeight: 25,
      },
      table: {
        borderColor: colors.border,
        borderRadius: 6,
        borderWidth: 1,
        cellPaddingHorizontal: 8,
        cellPaddingVertical: 6,
        color: colors.foreground,
        fontSize: 14,
        headerBackgroundColor: colors.tableHeader,
        headerTextColor: colors.foreground,
        rowEvenBackgroundColor: colors.surface,
        rowOddBackgroundColor: colors.tableRowAlt,
      },
      taskList: {
        borderColor: colors.muted,
        checkedColor: colors.primary,
        checkedTextColor: colors.muted,
      },
    },
  };
}

export const legendThemeFiles = [
  ...generatedThemeFiles,
];

export const legendThemes = Object.fromEntries(
  legendThemeFiles.map((themeFile) => [themeFile.name, createLegendTheme(themeFile)]),
) as Record<LegendThemeName, LegendTheme>;

export function getLegendTheme(themeName: string | null | undefined): LegendTheme {
  return legendThemes[themeName ?? ""] ?? legendThemes.light;
}
