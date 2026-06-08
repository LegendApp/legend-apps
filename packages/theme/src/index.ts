import { defaultMarkdownLayout } from "@legend-desktop/markdown-document";
import { generatedThemeFiles } from "./generatedThemes";
import type { LegendTheme, LegendThemeFile, LegendThemeName } from "./types";

export {
  createAppTheme,
  type AppThemeContextValue,
  type CreateAppThemeOptions,
} from "./appTheme";

export type {
  LegendTheme,
  LegendThemeColors,
  LegendThemeFile,
  LegendThemeName,
} from "./types";

const requiredColorNames = [
  "background",
  "foreground",
  "muted",
  "surface",
  "surfaceMuted",
  "border",
  "primary",
  "danger",
  "selection",
  "code",
  "codeForeground",
  "blockquoteBackground",
  "blockquoteBorder",
  "tableHeader",
  "tableRowAlt",
  "windowBackground",
] as const;

const generatedThemeNameSet = new Set<string>(generatedThemeFiles.map((themeFile) => themeFile.name));
const generatedThemeFileMap = new Map<LegendThemeName, LegendThemeFile>(
  generatedThemeFiles.map((themeFile) => [themeFile.name, themeFile]),
);
const userThemeNameSet = new Set<LegendThemeName>();

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object");
}

function isThemeColorValue(value: unknown, allowAuto = false): value is string {
  if (allowAuto && value === "auto") {
    return true;
  }

  return typeof value === "string" && /^#[0-9a-f]{6}([0-9a-f]{2})?$/i.test(value);
}

export function isLegendThemeFile(value: unknown): value is LegendThemeFile {
  if (!isRecord(value) || typeof value.name !== "string" || value.name.length === 0 || !isRecord(value.colors)) {
    return false;
  }

  const { colors } = value;
  return requiredColorNames.every((colorName) =>
    isThemeColorValue(colors[colorName], colorName === "selection"),
  );
}

function createLegendTheme(theme: LegendThemeFile): LegendTheme {
  const { colors } = theme;

  return {
    ...theme,
    markdownDocument: {
      backgroundColor: colors.background,
      errorColor: colors.danger,
      foregroundColor: colors.foreground,
      mutedForegroundColor: colors.muted,
      selectionColor: colors.selection,
    },
    markdownLayout: defaultMarkdownLayout,
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
        lineHeight: 21.45,
        padding: 20,
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

const legendThemeFileMap = new Map<LegendThemeName, LegendThemeFile>(
  legendThemeFiles.map((themeFile) => [themeFile.name, themeFile]),
);
const legendThemeMap = new Map<LegendThemeName, LegendTheme>(
  legendThemeFiles.map((themeFile) => [themeFile.name, createLegendTheme(themeFile)]),
);

export const legendThemes = Object.fromEntries(legendThemeMap) as Record<LegendThemeName, LegendTheme>;

export function registerLegendThemeFiles(themeFiles: readonly LegendThemeFile[]) {
  for (const themeFile of themeFiles) {
    if (isLegendThemeFile(themeFile)) {
      legendThemeFileMap.set(themeFile.name, themeFile);
      legendThemeMap.set(themeFile.name, createLegendTheme(themeFile));
      legendThemes[themeFile.name] = legendThemeMap.get(themeFile.name) as LegendTheme;
    }
  }
}

export function replaceUserLegendThemeFiles(themeFiles: readonly LegendThemeFile[]) {
  for (const themeName of userThemeNameSet) {
    const generatedThemeFile = generatedThemeFileMap.get(themeName);
    if (generatedThemeFile) {
      legendThemeFileMap.set(themeName, generatedThemeFile);
      legendThemeMap.set(themeName, createLegendTheme(generatedThemeFile));
      legendThemes[themeName] = legendThemeMap.get(themeName) as LegendTheme;
    } else {
      legendThemeFileMap.delete(themeName);
      legendThemeMap.delete(themeName);
      delete legendThemes[themeName];
    }
  }

  userThemeNameSet.clear();

  for (const themeFile of themeFiles) {
    if (isLegendThemeFile(themeFile)) {
      userThemeNameSet.add(themeFile.name);
    }
  }

  registerLegendThemeFiles(themeFiles);
}

export function getLegendThemeFiles(): LegendThemeFile[] {
  return Array.from(legendThemeFileMap.values());
}

export function getLegendTheme(themeName: string | null | undefined): LegendTheme {
  return legendThemeMap.get((themeName ?? "") as LegendThemeName) ?? legendThemeMap.get("light") as LegendTheme;
}

function getRelativeLuminance(hexColor: string) {
  const hex = hexColor.slice(1, 7);
  const channels = [0, 2, 4].map((start) => {
    const channel = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
}

export function getLegendUniwindThemeName(themeName: string | null | undefined): LegendThemeName {
  if (themeName && generatedThemeNameSet.has(themeName)) {
    return themeName as LegendThemeName;
  }

  const theme = getLegendTheme(themeName);
  return getRelativeLuminance(theme.colors.background) < 0.5 ? "dark" : "light";
}
