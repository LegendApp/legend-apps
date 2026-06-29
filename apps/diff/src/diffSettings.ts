import { createObservableSettings } from "@legend-desktop/storage";
import {
  defaultSyntaxThemeName,
  getSyntaxTheme,
  normalizeSyntaxThemeName,
  type SyntaxTheme,
} from "@legend-desktop/syntax-parser";
import { useValue } from "@legendapp/state/react";

export type DiffSettingsFile = {
  adaptiveLightModeEnabled?: boolean;
  fontFamily?: DiffFontFamilySetting;
  fontSize?: number;
  syntaxHighlightingEnabled?: boolean;
  syntaxPrewarmEnabled?: boolean;
  syntaxPrewarmLanguages?: string[];
  syntaxPrewarmKnownLanguages?: string[];
  syntaxTheme: string;
  rowRenderer?: DiffRowRendererSetting;
  showOnlyHunks?: boolean;
  viewMode?: DiffViewMode;
};

export type DiffFontFamilySetting = typeof diffFontFamilyOptions[number]["value"];
export type DiffRowRendererSetting = typeof diffRowRendererOptions[number]["value"];
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
export const defaultDiffRowRenderer: DiffRowRendererSetting = "react-native";
export const defaultDiffShowOnlyHunks = true;
export const defaultDiffAdaptiveLightModeEnabled = true;
export const defaultDiffSyntaxHighlightingEnabled = true;
export const defaultDiffSyntaxPrewarmEnabled = true;
export const diffFontSizeOptions = [8, 9, 10, 11, 12, 13, 14, 15, 16] as const;
export const diffRowRendererOptions = [
  { label: "React Native", value: "react-native" },
  { label: "Native (experimental)", value: "native" },
] as const;
export const diffViewModeOptions = [
  { label: "Unified", value: "unified" },
  { label: "Blocks", value: "blocks" },
  { label: "Merge", value: "merge" },
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

function normalizeDiffRowRenderer(rowRenderer: unknown): DiffRowRendererSetting {
  return typeof rowRenderer === "string" && diffRowRendererOptions.some((option) => option.value === rowRenderer)
    ? rowRenderer as DiffRowRendererSetting
    : defaultDiffRowRenderer;
}

function normalizeBoolean(value: unknown, defaultValue: boolean): boolean {
  return typeof value === "boolean" ? value : defaultValue;
}

function normalizeSyntaxLanguageList(value: unknown): string[] {
  const values = Array.isArray(value) ? value : [];
  const languages = new Set<string>();
  for (const entry of values) {
    if (typeof entry === "string") {
      const language = entry.trim();
      if (language) {
        languages.add(language);
      }
    }
  }
  return [...languages].sort();
}

export function isDiffViewMode(viewMode: unknown): viewMode is DiffViewMode {
  return typeof viewMode === "string" && diffViewModeOptions.some((option) => option.value === viewMode);
}

const diffSettings = createObservableSettings({
  fields: {
    adaptiveLightModeEnabled: {
      defaultValue: defaultDiffAdaptiveLightModeEnabled,
      normalize: (value) => normalizeBoolean(value, defaultDiffAdaptiveLightModeEnabled),
    },
    fontFamily: {
      defaultValue: defaultDiffFontFamily,
      normalize: normalizeDiffFontFamily,
    },
    fontSize: {
      defaultValue: defaultDiffFontSize,
      normalize: normalizeDiffFontSize,
    },
    syntaxHighlightingEnabled: {
      defaultValue: defaultDiffSyntaxHighlightingEnabled,
      normalize: (value) => normalizeBoolean(value, defaultDiffSyntaxHighlightingEnabled),
    },
    syntaxPrewarmEnabled: {
      defaultValue: defaultDiffSyntaxPrewarmEnabled,
      normalize: (value) => normalizeBoolean(value, defaultDiffSyntaxPrewarmEnabled),
    },
    syntaxPrewarmLanguages: {
      defaultValue: [] as string[],
      normalize: normalizeSyntaxLanguageList,
    },
    syntaxPrewarmKnownLanguages: {
      defaultValue: [] as string[],
      normalize: normalizeSyntaxLanguageList,
    },
    syntaxTheme: {
      defaultValue: defaultSyntaxThemeName,
      normalize: normalizeSyntaxThemeName,
    },
    rowRenderer: {
      defaultValue: defaultDiffRowRenderer,
      normalize: normalizeDiffRowRenderer,
    },
    showOnlyHunks: {
      defaultValue: defaultDiffShowOnlyHunks,
      normalize: (value) => normalizeBoolean(value, defaultDiffShowOnlyHunks),
    },
    viewMode: {
      defaultValue: defaultDiffViewMode,
      normalize: normalizeDiffViewMode,
    },
  },
  filename: "settings",
});
const adaptiveLightModeEnabledSetting = diffSettings.field("adaptiveLightModeEnabled");
const fontFamilySetting = diffSettings.field("fontFamily");
const fontSizeSetting = diffSettings.field("fontSize");
const syntaxHighlightingEnabledSetting = diffSettings.field("syntaxHighlightingEnabled");
const syntaxPrewarmEnabledSetting = diffSettings.field("syntaxPrewarmEnabled");
const syntaxPrewarmLanguagesSetting = diffSettings.field("syntaxPrewarmLanguages");
const syntaxPrewarmKnownLanguagesSetting = diffSettings.field("syntaxPrewarmKnownLanguages");
const syntaxThemeSetting = diffSettings.field("syntaxTheme");
const rowRendererSetting = diffSettings.field("rowRenderer");
const showOnlyHunksSetting = diffSettings.field("showOnlyHunks");
const viewModeSetting = diffSettings.field("viewMode");
export const diffSettings$ = diffSettings.settings$;

export function getDiffAdaptiveLightModeEnabledSetting(): boolean {
  return adaptiveLightModeEnabledSetting.get();
}

export function getDiffSyntaxThemeSetting(): string {
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

export function getDiffRowRendererSetting(): DiffRowRendererSetting {
  return rowRendererSetting.get();
}

export function getDiffShowOnlyHunksSetting(): boolean {
  return showOnlyHunksSetting.get();
}

export function getDiffSyntaxHighlightingEnabledSetting(): boolean {
  return syntaxHighlightingEnabledSetting.get();
}

export function getDiffSyntaxPrewarmEnabledSetting(): boolean {
  return syntaxPrewarmEnabledSetting.get();
}

export function getDiffSyntaxPrewarmLanguagesSetting(): string[] {
  return syntaxPrewarmLanguagesSetting.get();
}

export function getDiffSyntaxPrewarmKnownLanguagesSetting(): string[] {
  return syntaxPrewarmKnownLanguagesSetting.get();
}

export function useDiffFontFamilySetting(): DiffFontFamilySetting {
  return normalizeDiffFontFamily(useValue(diffSettings$.fontFamily));
}

export function useDiffAdaptiveLightModeEnabledSetting(): boolean {
  return normalizeBoolean(useValue(diffSettings$.adaptiveLightModeEnabled), defaultDiffAdaptiveLightModeEnabled);
}

export function useDiffFontSizeSetting(): number {
  return normalizeDiffFontSize(useValue(diffSettings$.fontSize));
}

export function useDiffSyntaxThemeSetting(): string {
  const syntaxTheme = useValue(diffSettings$.syntaxTheme);
  return normalizeSyntaxThemeName(syntaxTheme);
}

export function useDiffSyntaxTheme(): SyntaxTheme {
  return getSyntaxTheme(useDiffSyntaxThemeSetting());
}

export function useDiffViewModeSetting(): DiffViewMode {
  return normalizeDiffViewMode(useValue(diffSettings$.viewMode));
}

export function useDiffRowRendererSetting(): DiffRowRendererSetting {
  return normalizeDiffRowRenderer(useValue(diffSettings$.rowRenderer));
}

export function useDiffShowOnlyHunksSetting(): boolean {
  return normalizeBoolean(useValue(diffSettings$.showOnlyHunks), defaultDiffShowOnlyHunks);
}

export function useDiffSyntaxHighlightingEnabledSetting(): boolean {
  return normalizeBoolean(useValue(diffSettings$.syntaxHighlightingEnabled), defaultDiffSyntaxHighlightingEnabled);
}

export function useDiffSyntaxPrewarmEnabledSetting(): boolean {
  return normalizeBoolean(useValue(diffSettings$.syntaxPrewarmEnabled), defaultDiffSyntaxPrewarmEnabled);
}

export function useDiffSyntaxPrewarmLanguagesSetting(): string[] {
  return normalizeSyntaxLanguageList(useValue(diffSettings$.syntaxPrewarmLanguages));
}

export function useDiffSyntaxPrewarmKnownLanguagesSetting(): string[] {
  return normalizeSyntaxLanguageList(useValue(diffSettings$.syntaxPrewarmKnownLanguages));
}

export function setDiffSyntaxThemeSetting(syntaxTheme: string) {
  syntaxThemeSetting.set(syntaxTheme);
}

export function setDiffAdaptiveLightModeEnabledSetting(enabled: boolean) {
  adaptiveLightModeEnabledSetting.set(enabled);
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

export function setDiffRowRendererSetting(rowRenderer: DiffRowRendererSetting) {
  rowRendererSetting.set(rowRenderer);
}

export function setDiffShowOnlyHunksSetting(enabled: boolean) {
  showOnlyHunksSetting.set(enabled);
}

export function setDiffSyntaxHighlightingEnabledSetting(enabled: boolean) {
  syntaxHighlightingEnabledSetting.set(enabled);
}

export function setDiffSyntaxPrewarmEnabledSetting(enabled: boolean) {
  syntaxPrewarmEnabledSetting.set(enabled);
}

export function setDiffSyntaxPrewarmLanguagesSetting(languages: readonly string[]) {
  syntaxPrewarmLanguagesSetting.set(normalizeSyntaxLanguageList(languages));
}

export function setDiffSyntaxPrewarmKnownLanguagesSetting(languages: readonly string[]) {
  syntaxPrewarmKnownLanguagesSetting.set(normalizeSyntaxLanguageList(languages));
}
