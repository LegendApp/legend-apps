import { createObservableSettings } from "@legend-desktop/storage";
import {
  defaultSyntaxThemeName,
  getSyntaxTheme,
  isBundledSyntaxThemeName,
  type BundledSyntaxThemeName,
  type SyntaxTheme,
} from "@legend-desktop/syntax-parser";
import { useValue } from "@legendapp/state/react";

export type DiffSettingsFile = {
  fontFamily?: DiffFontFamilySetting;
  fontSize?: number;
  syntaxTheme: BundledSyntaxThemeName;
  viewMode?: DiffViewMode;
};

export type DiffFontFamilySetting = typeof diffFontFamilyOptions[number]["value"];
export type DiffViewMode = typeof diffViewModeOptions[number]["value"];

export const diffFontFamilyOptions = [
  { label: "Menlo", value: "Menlo" },
  { label: "SF Mono", value: "SF Mono" },
  { label: "Monaco", value: "Monaco" },
  { label: "Courier New", value: "Courier New" },
  { label: "Courier", value: "Courier" },
] as const;
export const defaultDiffFontSize = 12;
export const defaultDiffFontFamily: DiffFontFamilySetting = "Menlo";
export const defaultDiffViewMode: DiffViewMode = "unified";
export const diffFontSizeOptions = [8, 9, 10, 11, 12, 13, 14, 15, 16] as const;
export const diffViewModeOptions = [
  { label: "Unified", value: "unified" },
  { label: "Blocks", value: "blocks" },
] as const;

function normalizeDiffFontSize(fontSize: unknown): number {
  return typeof fontSize === "number" && diffFontSizeOptions.includes(fontSize as typeof diffFontSizeOptions[number])
    ? fontSize
    : defaultDiffFontSize;
}

function normalizeDiffFontFamily(fontFamily: unknown): DiffFontFamilySetting {
  return typeof fontFamily === "string" && diffFontFamilyOptions.some((option) => option.value === fontFamily)
    ? fontFamily as DiffFontFamilySetting
    : defaultDiffFontFamily;
}

function normalizeDiffViewMode(viewMode: unknown): DiffViewMode {
  return isDiffViewMode(viewMode)
    ? viewMode as DiffViewMode
    : defaultDiffViewMode;
}

export function isDiffViewMode(viewMode: unknown): viewMode is DiffViewMode {
  return typeof viewMode === "string" && diffViewModeOptions.some((option) => option.value === viewMode);
}

const diffSettings = createObservableSettings({
  fields: {
    fontFamily: {
      defaultValue: defaultDiffFontFamily,
      normalize: normalizeDiffFontFamily,
    },
    fontSize: {
      defaultValue: defaultDiffFontSize,
      normalize: normalizeDiffFontSize,
    },
    syntaxTheme: {
      defaultValue: defaultSyntaxThemeName,
      normalize: (syntaxTheme): BundledSyntaxThemeName =>
        isBundledSyntaxThemeName(syntaxTheme) ? syntaxTheme : defaultSyntaxThemeName,
    },
    viewMode: {
      defaultValue: defaultDiffViewMode,
      normalize: normalizeDiffViewMode,
    },
  },
  filename: "settings",
});
const fontFamilySetting = diffSettings.field("fontFamily");
const fontSizeSetting = diffSettings.field("fontSize");
const syntaxThemeSetting = diffSettings.field("syntaxTheme");
const viewModeSetting = diffSettings.field("viewMode");
export const diffSettings$ = diffSettings.settings$;

export function getDiffSyntaxThemeSetting(): BundledSyntaxThemeName {
  return syntaxThemeSetting.get();
}

export function getDiffSyntaxTheme(): SyntaxTheme {
  return getSyntaxTheme(getDiffSyntaxThemeSetting());
}

export function getDiffFontFamilySetting(): DiffFontFamilySetting {
  return fontFamilySetting.get();
}

export function getDiffFontSizeSetting(): number {
  return fontSizeSetting.get();
}

export function getDiffViewModeSetting(): DiffViewMode {
  return viewModeSetting.get();
}

export function useDiffFontFamilySetting(): DiffFontFamilySetting {
  return normalizeDiffFontFamily(useValue(diffSettings$.fontFamily));
}

export function useDiffFontSizeSetting(): number {
  return normalizeDiffFontSize(useValue(diffSettings$.fontSize));
}

export function useDiffSyntaxThemeSetting(): BundledSyntaxThemeName {
  const syntaxTheme = useValue(diffSettings$.syntaxTheme);
  return isBundledSyntaxThemeName(syntaxTheme) ? syntaxTheme : defaultSyntaxThemeName;
}

export function useDiffSyntaxTheme(): SyntaxTheme {
  return getSyntaxTheme(useDiffSyntaxThemeSetting());
}

export function useDiffViewModeSetting(): DiffViewMode {
  return normalizeDiffViewMode(useValue(diffSettings$.viewMode));
}

export function setDiffSyntaxThemeSetting(syntaxTheme: BundledSyntaxThemeName) {
  syntaxThemeSetting.set(syntaxTheme);
}

export function setDiffFontFamilySetting(fontFamily: DiffFontFamilySetting) {
  fontFamilySetting.set(fontFamily);
}

export function setDiffFontSizeSetting(fontSize: number) {
  fontSizeSetting.set(fontSize);
}

export function setDiffViewModeSetting(viewMode: DiffViewMode) {
  viewModeSetting.set(viewMode);
}
