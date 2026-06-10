import { defaultMarkdownLayout } from "@legend-desktop/markdown-document";
import { generatedThemeFiles } from "./generatedThemes";
import type { LegendTheme, LegendThemeAppearance, LegendThemeFile, LegendThemeName } from "./types";

export {
  createAppTheme,
  type AppThemeContextValue,
  type CreateAppThemeOptions,
} from "./appTheme";

export type {
  LegendTheme,
  LegendThemeAppearance,
  LegendThemeBackground,
  LegendThemeBackgroundSource,
  LegendThemeBackgroundTint,
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

function isThemeBackgroundSource(value: unknown): boolean {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  if (value.type === "none") {
    return true;
  }

  if (value.type === "color") {
    return isThemeColorValue(value.color);
  }

  if (value.type === "image") {
    return typeof value.imagePath === "string";
  }

  return false;
}

function isThemeBackground(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  const { glassEnabled, opacity, source, tint } = value;
  const isOpacityValid = typeof opacity === "number" && opacity >= 0 && opacity <= 1;
  const isTintValid = isRecord(tint) && typeof tint.enabled === "boolean" && isThemeColorValue(tint.color);

  return typeof glassEnabled === "boolean" && isOpacityValid && isThemeBackgroundSource(source) && isTintValid;
}

export function isLegendThemeFile(value: unknown): value is LegendThemeFile {
  if (!isRecord(value) || typeof value.name !== "string" || value.name.length === 0 || !isRecord(value.colors)) {
    return false;
  }

  const { colors } = value;
  return requiredColorNames.every((colorName) =>
    isThemeColorValue(colors[colorName], colorName === "selection"),
  ) &&
    (value.appearance === undefined || value.appearance === "light" || value.appearance === "dark") &&
    (value.background === undefined || isThemeBackground(value.background));
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

export type ThemeStorageEntry = {
  name: string;
};

export type ThemeStorage = {
  ensureDirectory(relativePath?: string): { name: string; uri: string };
  list(relativePath?: string, options?: { extension?: string }): ThemeStorageEntry[];
  read<T = unknown>(relativePath: string, options: { format: "json" }): T | undefined;
};

export type UserThemeLoadIssue = {
  filename: string;
  message: string;
};

export type UserThemeLoadResult = {
  directoryUri: string;
  issues: UserThemeLoadIssue[];
  themes: LegendThemeFile[];
};

export type LoadUserThemeFilesOptions = {
  directory?: string;
  replaceRegisteredUserThemes?: boolean;
  storage: ThemeStorage;
};

export function loadUserThemeFilesSync({
  directory: directoryPath = "themes",
  replaceRegisteredUserThemes = true,
  storage,
}: LoadUserThemeFilesOptions): UserThemeLoadResult {
  const directory = storage.ensureDirectory(directoryPath);
  const issues: UserThemeLoadIssue[] = [];
  const themes: LegendThemeFile[] = [];

  try {
    for (const entry of storage.list(directoryPath, { extension: ".json" })) {
      try {
        const parsed = storage.read(`${directoryPath}/${entry.name}`, { format: "json" });
        if (isLegendThemeFile(parsed)) {
          themes.push(parsed);
        } else {
          issues.push({ filename: entry.name, message: "Theme file is missing required fields or valid colors." });
        }
      } catch (error) {
        issues.push({ filename: entry.name, message: error instanceof Error ? error.message : String(error) });
      }
    }
  } catch (error) {
    issues.push({ filename: directory.name, message: error instanceof Error ? error.message : String(error) });
  }

  if (replaceRegisteredUserThemes) {
    replaceUserLegendThemeFiles(themes);
  }

  return { directoryUri: directory.uri, issues, themes };
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

export function getLegendThemeAppearance(themeName: string | null | undefined): LegendThemeAppearance {
  const theme = getLegendTheme(themeName);
  return theme.appearance ?? (getRelativeLuminance(theme.colors.background) < 0.5 ? "dark" : "light");
}

function resolveSelectionColor(color: string) {
  return color === "auto" ? "Highlight" : color;
}

export function getLegendThemeUniwindVariables(themeName: string | null | undefined): Record<string, string> {
  const { colors } = getLegendTheme(themeName);

  return {
    "--color-accent-primary": colors.primary,
    "--color-accent-secondary": colors.link ?? colors.primary,
    "--color-background": colors.background,
    "--color-background-destructive": "#8b0000",
    "--color-background-inverse": colors.foreground,
    "--color-background-primary": colors.background,
    "--color-background-secondary": colors.surface,
    "--color-background-tertiary": colors.surfaceMuted,
    "--color-blockquote-background": colors.blockquoteBackground,
    "--color-blockquote-border": colors.blockquoteBorder,
    "--color-border": colors.border,
    "--color-border-popup": colors.border,
    "--color-border-primary": colors.border,
    "--color-code": colors.code,
    "--color-code-foreground": colors.codeForeground,
    "--color-danger": colors.danger,
    "--color-foreground": colors.foreground,
    "--color-muted": colors.muted,
    "--color-primary": colors.primary,
    "--color-selection": resolveSelectionColor(colors.selection),
    "--color-surface": colors.surface,
    "--color-surface-muted": colors.surfaceMuted,
    "--color-table-header": colors.tableHeader,
    "--color-table-row-alt": colors.tableRowAlt,
    "--color-text-primary": colors.foreground,
    "--color-text-secondary": colors.muted,
    "--color-text-tertiary": colors.muted,
    "--color-window-background": colors.windowBackground,
  };
}

export function applyLegendThemeToUniwind(themeName: string | null | undefined) {
  const { Uniwind } = require("uniwind") as typeof import("uniwind");
  const appearance = getLegendThemeAppearance(themeName);
  Uniwind.updateCSSVariables(appearance, getLegendThemeUniwindVariables(themeName));
  Uniwind.setTheme(appearance);
}
