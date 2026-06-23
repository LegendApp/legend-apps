import { createObservableSettings } from "@legend-desktop/storage";
import {
  defaultSyntaxThemeName,
  getSyntaxTheme,
  isBundledSyntaxThemeName,
  type BundledSyntaxThemeName,
  type SyntaxTheme,
} from "@legend-desktop/syntax-parser";

export type DiffSettingsFile = {
  fontFamily?: DiffFontFamilySetting;
  fontSize?: number;
  syntaxTheme: BundledSyntaxThemeName;
};

export type DiffFontFamilySetting = typeof diffFontFamilyOptions[number]["value"];

export const diffFontFamilyOptions = [
  { label: "Menlo", value: "Menlo" },
  { label: "SF Mono", value: "SF Mono" },
  { label: "Monaco", value: "Monaco" },
  { label: "Courier New", value: "Courier New" },
  { label: "Courier", value: "Courier" },
] as const;
export const defaultDiffFontSize = 12;
export const defaultDiffFontFamily: DiffFontFamilySetting = "Menlo";
export const diffFontSizeOptions = [8, 9, 10, 11, 12, 13, 14, 15, 16] as const;

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
  },
  filename: "settings",
});
const fontFamilySetting = diffSettings.field("fontFamily");
const fontSizeSetting = diffSettings.field("fontSize");
const syntaxThemeSetting = diffSettings.field("syntaxTheme");

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

export function useDiffFontFamilySetting(): DiffFontFamilySetting {
  return fontFamilySetting.use();
}

export function useDiffFontSizeSetting(): number {
  return fontSizeSetting.use();
}

export function useDiffSyntaxThemeSetting(): BundledSyntaxThemeName {
  return syntaxThemeSetting.use();
}

export function useDiffSyntaxTheme(): SyntaxTheme {
  return getSyntaxTheme(useDiffSyntaxThemeSetting());
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
