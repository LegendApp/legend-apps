import { Appearance, type ColorSchemeName, useColorScheme } from "react-native";

import { generatedDisplayThemeFiles, generatedMarkdownLayoutThemeFiles } from "./generatedThemes";
import type {
  LegendDisplayTheme,
  LegendDisplayThemeAppearance,
  LegendDisplayThemeFonts,
  LegendDisplayThemeFile,
  LegendDisplayThemeName,
  MarkdownLayoutTheme,
  MarkdownLayoutThemeFile,
  MarkdownLayoutThemeName,
} from "./types";

export {
  createAppTheme,
  type AppThemeContextValue,
  type CreateAppThemeOptions,
} from "./appTheme";

export type {
  LegendDisplayTheme,
  LegendDisplayThemeAppearance,
  LegendDisplayThemeBackground,
  LegendDisplayThemeBackgroundSource,
  LegendDisplayThemeBackgroundTint,
  LegendDisplayThemeColors,
  LegendDisplayThemeFonts,
  LegendDisplayThemeFile,
  LegendDisplayThemeName,
  LegendTheme,
  LegendThemeAppearance,
  LegendThemeBackground,
  LegendThemeBackgroundSource,
  LegendThemeBackgroundTint,
  LegendThemeColors,
  LegendThemeFile,
  LegendThemeName,
  MarkdownLayoutTheme,
  MarkdownLayoutThemeBlocks,
  MarkdownLayoutThemeFile,
  MarkdownLayoutThemeName,
  MarkdownLayoutThemeTypography,
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

const generatedDisplayThemeFileMap = new Map<LegendDisplayThemeName, LegendDisplayThemeFile>(
  generatedDisplayThemeFiles.map((themeFile) => [themeFile.name, themeFile]),
);
const generatedMarkdownLayoutThemeFileMap = new Map<MarkdownLayoutThemeName, MarkdownLayoutThemeFile>(
  generatedMarkdownLayoutThemeFiles.map((themeFile) => [themeFile.name, themeFile]),
);
const userDisplayThemeNameSet = new Set<LegendDisplayThemeName>();
const userMarkdownLayoutThemeNameSet = new Set<MarkdownLayoutThemeName>();

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

function isThemeFonts(value: unknown): value is LegendDisplayThemeFonts {
  return isRecord(value) &&
    (value.bodyFontFamily === undefined || typeof value.bodyFontFamily === "string") &&
    (value.codeFontFamily === undefined || typeof value.codeFontFamily === "string");
}

export function isLegendDisplayThemeFile(value: unknown): value is LegendDisplayThemeFile {
  if (!isRecord(value) || typeof value.name !== "string" || value.name.length === 0 || !isRecord(value.colors)) {
    return false;
  }

  const { colors } = value;
  return requiredColorNames.every((colorName) =>
    isThemeColorValue(colors[colorName], colorName === "selection"),
  ) &&
    (value.appearance === undefined || value.appearance === "light" || value.appearance === "dark") &&
    (value.background === undefined || isThemeBackground(value.background)) &&
    (value.fonts === undefined || isThemeFonts(value.fonts));
}

function isNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isBlockSpacing(value: unknown) {
  if (!isRecord(value)) {
    return false;
  }

  const isSpacing = (spacing: unknown) =>
    isRecord(spacing) &&
    (spacing.marginTop === undefined || isNumber(spacing.marginTop)) &&
    (spacing.marginBottom === undefined || isNumber(spacing.marginBottom));

  const heading = value.heading;
  if (
    !isSpacing(value.blockquote) ||
    !isSpacing(value.codeBlock) ||
    !isSpacing(value.fallback) ||
    !isSpacing(value.list) ||
    !isSpacing(value.paragraph) ||
    !isSpacing(value.table) ||
    !isSpacing(value.thematicBreak) ||
    !isRecord(heading)
  ) {
    return false;
  }

  return ([1, 2, 3, 4, 5, 6] as const).every((level) => isSpacing(heading[level]));
}

export function isMarkdownLayoutThemeFile(value: unknown): value is MarkdownLayoutThemeFile {
  if (!isRecord(value) || typeof value.name !== "string" || value.name.length === 0) {
    return false;
  }

  const { blocks, content, spacing, typography } = value;
  if (
    !isRecord(content) ||
    !isNumber(content.horizontalPadding) ||
    !isNumber(content.maxWidth) ||
    !isNumber(content.verticalPadding) ||
    !isBlockSpacing(spacing) ||
    !isRecord(typography) ||
    !isNumber(typography.blockquoteFontSizeOffset) ||
    !isNumber(typography.bodyFontSize) ||
    !isNumber(typography.codeFontSizeOffset) ||
    !isNumber(typography.headingLineHeightScale) ||
    !isNumber(typography.lineHeightScale) ||
    !isNumber(typography.tableFontSizeOffset) ||
    typeof typography.headingWeight !== "string" ||
    !isRecord(typography.headingScale) ||
    !isRecord(blocks)
  ) {
    return false;
  }

  const headingScale = typography.headingScale;
  if (!isRecord(headingScale)) {
    return false;
  }

  const hasHeadingScale = ([1, 2, 3, 4, 5, 6] as const).every((level) => isNumber(headingScale[level]));
  return hasHeadingScale &&
    isNumber(blocks.blockquoteBorderWidth) &&
    isNumber(blocks.codeBlockBorderRadius) &&
    isNumber(blocks.codeBlockBorderWidth) &&
    isNumber(blocks.codeBlockPadding) &&
    isNumber(blocks.listGapWidth) &&
    isNumber(blocks.tableBorderRadius) &&
    isNumber(blocks.tableBorderWidth) &&
    isNumber(blocks.tableCellPaddingHorizontal) &&
    isNumber(blocks.tableCellPaddingVertical);
}

export const isLegendThemeFile = isLegendDisplayThemeFile;

function createLegendDisplayTheme(theme: LegendDisplayThemeFile): LegendDisplayTheme {
  const { colors } = theme;
  const bodyFontFamily = theme.fonts?.bodyFontFamily;
  const codeFontFamily = theme.fonts?.codeFontFamily ?? "Menlo";

  return {
    ...theme,
    markdownDocument: {
      backgroundColor: colors.background,
      errorColor: colors.danger,
      foregroundColor: colors.foreground,
      mutedForegroundColor: colors.muted,
      selectionColor: colors.selection,
    },
    markdownStyle: {
      blockquote: {
        backgroundColor: colors.blockquoteBackground,
        borderColor: colors.blockquoteBorder,
        borderWidth: 3,
        color: colors.foreground,
        fontFamily: bodyFontFamily,
        fontSize: 15,
        lineHeight: 23,
      },
      code: {
        backgroundColor: colors.inlineCodeBackground ?? colors.surfaceMuted,
        color: colors.inlineCodeForeground ?? colors.foreground,
        fontFamily: codeFontFamily,
        fontSize: 14,
      },
      codeBlock: {
        backgroundColor: colors.code,
        borderColor: colors.border,
        borderRadius: 6,
        borderWidth: 1,
        color: colors.codeForeground,
        fontFamily: codeFontFamily,
        fontSize: 13,
        lineHeight: 21.45,
        padding: 20,
      },
      h1: {
        color: colors.foreground,
        fontFamily: bodyFontFamily,
        fontSize: 30,
        fontWeight: "700",
        lineHeight: 38,
        marginBottom: 8,
      },
      h2: {
        color: colors.foreground,
        fontFamily: bodyFontFamily,
        fontSize: 24,
        fontWeight: "700",
        lineHeight: 32,
        marginBottom: 6,
      },
      h3: {
        color: colors.foreground,
        fontFamily: bodyFontFamily,
        fontSize: 20,
        fontWeight: "700",
        lineHeight: 28,
        marginBottom: 4,
      },
      h4: {
        color: colors.foreground,
        fontFamily: bodyFontFamily,
        fontSize: 18,
        fontWeight: "700",
        lineHeight: 26,
        marginBottom: 4,
      },
      h5: {
        color: colors.foreground,
        fontFamily: bodyFontFamily,
        fontSize: 16,
        fontWeight: "700",
        lineHeight: 24,
        marginBottom: 4,
      },
      h6: {
        color: colors.muted,
        fontFamily: bodyFontFamily,
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
        fontFamily: bodyFontFamily,
        fontSize: 16,
        gapWidth: 8,
        lineHeight: 25,
        markerColor: colors.muted,
      },
      paragraph: {
        color: colors.foreground,
        fontFamily: bodyFontFamily,
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
        fontFamily: bodyFontFamily,
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

function createMarkdownLayoutTheme(theme: MarkdownLayoutThemeFile): MarkdownLayoutTheme {
  return {
    ...theme,
    markdownLayout: {
      blockSpacing: theme.spacing,
      content: theme.content,
    },
  };
}

export const legendDisplayThemeFiles = [
  ...generatedDisplayThemeFiles,
];

export const markdownLayoutThemeFiles = [
  ...generatedMarkdownLayoutThemeFiles,
];

const legendDisplayThemeFileMap = new Map<LegendDisplayThemeName, LegendDisplayThemeFile>(
  legendDisplayThemeFiles.map((themeFile) => [themeFile.name, themeFile]),
);
const legendDisplayThemeMap = new Map<LegendDisplayThemeName, LegendDisplayTheme>(
  legendDisplayThemeFiles.map((themeFile) => [themeFile.name, createLegendDisplayTheme(themeFile)]),
);
const markdownLayoutThemeFileMap = new Map<MarkdownLayoutThemeName, MarkdownLayoutThemeFile>(
  markdownLayoutThemeFiles.map((themeFile) => [themeFile.name, themeFile]),
);
const markdownLayoutThemeMap = new Map<MarkdownLayoutThemeName, MarkdownLayoutTheme>(
  markdownLayoutThemeFiles.map((themeFile) => [themeFile.name, createMarkdownLayoutTheme(themeFile)]),
);

export const legendDisplayThemes = Object.fromEntries(legendDisplayThemeMap) as Record<LegendDisplayThemeName, LegendDisplayTheme>;
export const markdownLayoutThemes = Object.fromEntries(markdownLayoutThemeMap) as Record<MarkdownLayoutThemeName, MarkdownLayoutTheme>;
export const legendThemeFiles = legendDisplayThemeFiles;
export const legendThemes = legendDisplayThemes;

export function registerLegendDisplayThemeFiles(themeFiles: readonly LegendDisplayThemeFile[]) {
  for (const themeFile of themeFiles) {
    if (isLegendDisplayThemeFile(themeFile)) {
      legendDisplayThemeFileMap.set(themeFile.name, themeFile);
      legendDisplayThemeMap.set(themeFile.name, createLegendDisplayTheme(themeFile));
      legendDisplayThemes[themeFile.name] = legendDisplayThemeMap.get(themeFile.name) as LegendDisplayTheme;
    }
  }
}

export function registerMarkdownLayoutThemeFiles(themeFiles: readonly MarkdownLayoutThemeFile[]) {
  for (const themeFile of themeFiles) {
    if (isMarkdownLayoutThemeFile(themeFile)) {
      markdownLayoutThemeFileMap.set(themeFile.name, themeFile);
      markdownLayoutThemeMap.set(themeFile.name, createMarkdownLayoutTheme(themeFile));
      markdownLayoutThemes[themeFile.name] = markdownLayoutThemeMap.get(themeFile.name) as MarkdownLayoutTheme;
    }
  }
}

export const registerLegendThemeFiles = registerLegendDisplayThemeFiles;

export function replaceUserLegendDisplayThemeFiles(themeFiles: readonly LegendDisplayThemeFile[]) {
  for (const themeName of userDisplayThemeNameSet) {
    const generatedThemeFile = generatedDisplayThemeFileMap.get(themeName);
    if (generatedThemeFile) {
      legendDisplayThemeFileMap.set(themeName, generatedThemeFile);
      legendDisplayThemeMap.set(themeName, createLegendDisplayTheme(generatedThemeFile));
      legendDisplayThemes[themeName] = legendDisplayThemeMap.get(themeName) as LegendDisplayTheme;
    } else {
      legendDisplayThemeFileMap.delete(themeName);
      legendDisplayThemeMap.delete(themeName);
      delete legendDisplayThemes[themeName];
    }
  }

  userDisplayThemeNameSet.clear();

  for (const themeFile of themeFiles) {
    if (isLegendDisplayThemeFile(themeFile)) {
      userDisplayThemeNameSet.add(themeFile.name);
    }
  }

  registerLegendDisplayThemeFiles(themeFiles);
}

export function replaceUserMarkdownLayoutThemeFiles(themeFiles: readonly MarkdownLayoutThemeFile[]) {
  for (const themeName of userMarkdownLayoutThemeNameSet) {
    const generatedThemeFile = generatedMarkdownLayoutThemeFileMap.get(themeName);
    if (generatedThemeFile) {
      markdownLayoutThemeFileMap.set(themeName, generatedThemeFile);
      markdownLayoutThemeMap.set(themeName, createMarkdownLayoutTheme(generatedThemeFile));
      markdownLayoutThemes[themeName] = markdownLayoutThemeMap.get(themeName) as MarkdownLayoutTheme;
    } else {
      markdownLayoutThemeFileMap.delete(themeName);
      markdownLayoutThemeMap.delete(themeName);
      delete markdownLayoutThemes[themeName];
    }
  }

  userMarkdownLayoutThemeNameSet.clear();

  for (const themeFile of themeFiles) {
    if (isMarkdownLayoutThemeFile(themeFile)) {
      userMarkdownLayoutThemeNameSet.add(themeFile.name);
    }
  }

  registerMarkdownLayoutThemeFiles(themeFiles);
}

export const replaceUserLegendThemeFiles = replaceUserLegendDisplayThemeFiles;

export function getLegendDisplayThemeFiles(): LegendDisplayThemeFile[] {
  return Array.from(legendDisplayThemeFileMap.values());
}

export function getMarkdownLayoutThemeFiles(): MarkdownLayoutThemeFile[] {
  return Array.from(markdownLayoutThemeFileMap.values());
}

export const getLegendThemeFiles = getLegendDisplayThemeFiles;

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
  themes: LegendDisplayThemeFile[];
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
  return loadUserDisplayThemeFilesSync({ directory: directoryPath, replaceRegisteredUserThemes, storage });
}

export type UserDisplayThemeLoadResult = UserThemeLoadResult;

export function loadUserDisplayThemeFilesSync({
  directory: directoryPath = "themes/display",
  replaceRegisteredUserThemes = true,
  storage,
}: LoadUserThemeFilesOptions): UserDisplayThemeLoadResult {
  const directory = storage.ensureDirectory(directoryPath);
  const issues: UserThemeLoadIssue[] = [];
  const themes: LegendDisplayThemeFile[] = [];

  try {
    for (const entry of storage.list(directoryPath, { extension: ".json" })) {
      try {
        const parsed = storage.read(`${directoryPath}/${entry.name}`, { format: "json" });
        if (isLegendDisplayThemeFile(parsed)) {
          themes.push(parsed);
        } else {
          issues.push({ filename: entry.name, message: "Display theme file is missing required fields or valid colors." });
        }
      } catch (error) {
        issues.push({ filename: entry.name, message: error instanceof Error ? error.message : String(error) });
      }
    }
  } catch (error) {
    issues.push({ filename: directory.name, message: error instanceof Error ? error.message : String(error) });
  }

  if (replaceRegisteredUserThemes) {
    replaceUserLegendDisplayThemeFiles(themes);
  }

  return { directoryUri: directory.uri, issues, themes };
}

export type UserMarkdownLayoutThemeLoadResult = {
  directoryUri: string;
  issues: UserThemeLoadIssue[];
  themes: MarkdownLayoutThemeFile[];
};

export function loadUserMarkdownLayoutThemeFilesSync({
  directory: directoryPath = "themes/layout",
  replaceRegisteredUserThemes = true,
  storage,
}: LoadUserThemeFilesOptions): UserMarkdownLayoutThemeLoadResult {
  const directory = storage.ensureDirectory(directoryPath);
  const issues: UserThemeLoadIssue[] = [];
  const themes: MarkdownLayoutThemeFile[] = [];

  try {
    for (const entry of storage.list(directoryPath, { extension: ".json" })) {
      try {
        const parsed = storage.read(`${directoryPath}/${entry.name}`, { format: "json" });
        if (isMarkdownLayoutThemeFile(parsed)) {
          themes.push(parsed);
        } else {
          issues.push({ filename: entry.name, message: "Layout theme file is missing required metrics." });
        }
      } catch (error) {
        issues.push({ filename: entry.name, message: error instanceof Error ? error.message : String(error) });
      }
    }
  } catch (error) {
    issues.push({ filename: directory.name, message: error instanceof Error ? error.message : String(error) });
  }

  if (replaceRegisteredUserThemes) {
    replaceUserMarkdownLayoutThemeFiles(themes);
  }

  return { directoryUri: directory.uri, issues, themes };
}

export function getLegendDisplayTheme(themeName: string | null | undefined): LegendDisplayTheme {
  return legendDisplayThemeMap.get((themeName ?? "") as LegendDisplayThemeName) ?? legendDisplayThemeMap.get("light") as LegendDisplayTheme;
}

export function getLegendDisplayThemeForColorScheme(colorScheme: ColorSchemeName): LegendDisplayTheme {
  return getLegendDisplayTheme(colorScheme === "dark" ? "dark" : "light");
}

export function getSystemLegendDisplayTheme(): LegendDisplayTheme {
  return getLegendDisplayThemeForColorScheme(Appearance.getColorScheme());
}

export function useSystemLegendDisplayTheme(): LegendDisplayTheme {
  return getLegendDisplayThemeForColorScheme(useColorScheme());
}

export function getMarkdownLayoutTheme(themeName: string | null | undefined): MarkdownLayoutTheme {
  return markdownLayoutThemeMap.get((themeName ?? "") as MarkdownLayoutThemeName) ?? markdownLayoutThemeMap.get("default") as MarkdownLayoutTheme;
}

export const getLegendTheme = getLegendDisplayTheme;

function getRelativeLuminance(hexColor: string) {
  const hex = hexColor.slice(1, 7);
  const channels = [0, 2, 4].map((start) => {
    const channel = Number.parseInt(hex.slice(start, start + 2), 16) / 255;
    return channel <= 0.03928 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
  });

  return 0.2126 * (channels[0] ?? 0) + 0.7152 * (channels[1] ?? 0) + 0.0722 * (channels[2] ?? 0);
}

export function getLegendDisplayThemeAppearance(themeName: string | null | undefined): LegendDisplayThemeAppearance {
  const theme = getLegendDisplayTheme(themeName);
  return theme.appearance ?? (getRelativeLuminance(theme.colors.background) < 0.5 ? "dark" : "light");
}

export const getLegendThemeAppearance = getLegendDisplayThemeAppearance;

function resolveSelectionColor(color: string) {
  return color === "auto" ? "Highlight" : color;
}

export function getLegendDisplayThemeUniwindVariables(themeName: string | null | undefined): Record<string, string> {
  const { colors } = getLegendDisplayTheme(themeName);

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

export const getLegendThemeUniwindVariables = getLegendDisplayThemeUniwindVariables;

export function applyLegendDisplayThemeToUniwind(themeName: string | null | undefined) {
  const { Uniwind } = require("uniwind") as typeof import("uniwind");
  const appearance = getLegendDisplayThemeAppearance(themeName);
  Uniwind.updateCSSVariables(appearance, getLegendDisplayThemeUniwindVariables(themeName));
  Uniwind.setTheme(appearance);
}

export const applyLegendThemeToUniwind = applyLegendDisplayThemeToUniwind;
