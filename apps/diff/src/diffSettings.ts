import { createObservableFile } from "@legend-desktop/storage";
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

const initialDiffSettings: DiffSettingsFile = {
  fontFamily: defaultDiffFontFamily,
  fontSize: defaultDiffFontSize,
  syntaxTheme: defaultSyntaxThemeName,
};

const diffSettings$ = createObservableFile<DiffSettingsFile>({
  filename: "settings",
  initialValue: initialDiffSettings,
});

export function getDiffSyntaxThemeSetting(): BundledSyntaxThemeName {
  const syntaxTheme = diffSettings$.syntaxTheme.get();
  return isBundledSyntaxThemeName(syntaxTheme) ? syntaxTheme : initialDiffSettings.syntaxTheme;
}

export function getDiffSyntaxTheme(): SyntaxTheme {
  return getSyntaxTheme(getDiffSyntaxThemeSetting());
}

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

export function getDiffFontFamilySetting(): DiffFontFamilySetting {
  return normalizeDiffFontFamily(diffSettings$.fontFamily.get());
}

export function getDiffFontSizeSetting(): number {
  return normalizeDiffFontSize(diffSettings$.fontSize.get());
}

export function useDiffFontFamilySetting(): DiffFontFamilySetting {
  return normalizeDiffFontFamily(useValue(diffSettings$.fontFamily));
}

export function useDiffFontSizeSetting(): number {
  return normalizeDiffFontSize(useValue(diffSettings$.fontSize));
}

export function useDiffSyntaxThemeSetting(): BundledSyntaxThemeName {
  const syntaxTheme = useValue(diffSettings$.syntaxTheme);
  return isBundledSyntaxThemeName(syntaxTheme) ? syntaxTheme : initialDiffSettings.syntaxTheme;
}

export function useDiffSyntaxTheme(): SyntaxTheme {
  return getSyntaxTheme(useDiffSyntaxThemeSetting());
}

export function setDiffSyntaxThemeSetting(syntaxTheme: BundledSyntaxThemeName) {
  diffSettings$.syntaxTheme.set(syntaxTheme);
}

export function setDiffFontFamilySetting(fontFamily: DiffFontFamilySetting) {
  diffSettings$.fontFamily.set(normalizeDiffFontFamily(fontFamily));
}

export function setDiffFontSizeSetting(fontSize: number) {
  diffSettings$.fontSize.set(normalizeDiffFontSize(fontSize));
}
