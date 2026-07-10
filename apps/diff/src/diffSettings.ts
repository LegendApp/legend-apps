import { createObservableSettings } from "@legend-apps/storage";
import {
  normalizeBooleanSetting,
  normalizeSourceFontFamily,
  normalizeSourceFontSize,
  sourceFontFamilyOptions,
  sourceFontSizeOptions,
  type SourceFontFamilySetting,
} from "@legend-apps/syntax-settings";
import {
  defaultSyntaxThemeName,
  getSyntaxTheme,
  normalizeSyntaxThemeName,
  type SyntaxTheme,
} from "@legend-apps/syntax-parser";
import { useValue } from "@legendapp/state/react";

export type DiffSettingsFile = {
  adaptiveLightModeEnabled?: boolean;
  fontFamily?: DiffFontFamilySetting;
  fontSize?: number;
  highlightChangedCharacters?: boolean;
  ignoreWhitespaceChanges?: boolean;
  showWhitespaceCharacters?: boolean;
  syntaxHighlightingEnabled?: boolean;
  syntaxTheme: string;
  restoreWindowsOnStartup?: boolean;
  showOnlyHunks?: boolean;
  showStatisticsPanel?: boolean;
  sidebarWidth?: number;
  viewMode?: DiffViewMode;
};

export type DiffFontFamilySetting = SourceFontFamilySetting;
export type DiffViewMode = typeof diffViewModeOptions[number]["value"];

export const diffFontFamilyOptions = sourceFontFamilyOptions;
export const defaultDiffFontSize = 12;
export const defaultDiffFontFamily: DiffFontFamilySetting = "Menlo";
export const defaultDiffViewMode: DiffViewMode = "unified";
export const defaultDiffRestoreWindowsOnStartup = true;
export const defaultDiffSidebarWidth = 180;
export const defaultDiffShowOnlyHunks = true;
export const defaultDiffShowStatisticsPanel = false;
export const defaultDiffAdaptiveLightModeEnabled = true;
export const defaultDiffHighlightChangedCharacters = true;
export const defaultDiffIgnoreWhitespaceChanges = false;
export const defaultDiffShowWhitespaceCharacters = false;
export const defaultDiffSyntaxHighlightingEnabled = true;
export const diffFontSizeOptions = sourceFontSizeOptions;
export const diffViewModeOptions = [
  { label: "Unified", value: "unified" },
  { label: "Side-by-Side", value: "blocks" },
] as const;

function normalizeDiffFontSize(fontSize: unknown): number {
  return normalizeSourceFontSize(fontSize, defaultDiffFontSize);
}

function normalizeDiffFontFamily(fontFamily: unknown): DiffFontFamilySetting {
  return normalizeSourceFontFamily(fontFamily, defaultDiffFontFamily);
}

function normalizeDiffSidebarWidth(sidebarWidth: unknown): number {
  return typeof sidebarWidth === "number" && Number.isFinite(sidebarWidth)
    ? Math.max(defaultDiffSidebarWidth, Math.min(640, Math.round(sidebarWidth)))
    : defaultDiffSidebarWidth;
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
    adaptiveLightModeEnabled: {
      defaultValue: defaultDiffAdaptiveLightModeEnabled,
      normalize: (value) => normalizeBooleanSetting(value, defaultDiffAdaptiveLightModeEnabled),
    },
    fontFamily: {
      defaultValue: defaultDiffFontFamily,
      normalize: normalizeDiffFontFamily,
    },
    fontSize: {
      defaultValue: defaultDiffFontSize,
      normalize: normalizeDiffFontSize,
    },
    highlightChangedCharacters: {
      defaultValue: defaultDiffHighlightChangedCharacters,
      normalize: (value) => normalizeBooleanSetting(value, defaultDiffHighlightChangedCharacters),
    },
    ignoreWhitespaceChanges: {
      defaultValue: defaultDiffIgnoreWhitespaceChanges,
      normalize: (value) => normalizeBooleanSetting(value, defaultDiffIgnoreWhitespaceChanges),
    },
    showWhitespaceCharacters: {
      defaultValue: defaultDiffShowWhitespaceCharacters,
      normalize: (value) => normalizeBooleanSetting(value, defaultDiffShowWhitespaceCharacters),
    },
    syntaxHighlightingEnabled: {
      defaultValue: defaultDiffSyntaxHighlightingEnabled,
      normalize: (value) => normalizeBooleanSetting(value, defaultDiffSyntaxHighlightingEnabled),
    },
    syntaxTheme: {
      defaultValue: defaultSyntaxThemeName,
      normalize: normalizeSyntaxThemeName,
    },
    restoreWindowsOnStartup: {
      defaultValue: defaultDiffRestoreWindowsOnStartup,
      normalize: (value) => normalizeBooleanSetting(value, defaultDiffRestoreWindowsOnStartup),
    },
    showOnlyHunks: {
      defaultValue: defaultDiffShowOnlyHunks,
      normalize: (value) => normalizeBooleanSetting(value, defaultDiffShowOnlyHunks),
    },
    showStatisticsPanel: {
      defaultValue: defaultDiffShowStatisticsPanel,
      normalize: (value) => normalizeBooleanSetting(value, defaultDiffShowStatisticsPanel),
    },
    sidebarWidth: {
      defaultValue: defaultDiffSidebarWidth,
      normalize: normalizeDiffSidebarWidth,
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
const highlightChangedCharactersSetting = diffSettings.field("highlightChangedCharacters");
const ignoreWhitespaceChangesSetting = diffSettings.field("ignoreWhitespaceChanges");
const showWhitespaceCharactersSetting = diffSettings.field("showWhitespaceCharacters");
const syntaxHighlightingEnabledSetting = diffSettings.field("syntaxHighlightingEnabled");
const syntaxThemeSetting = diffSettings.field("syntaxTheme");
const restoreWindowsOnStartupSetting = diffSettings.field("restoreWindowsOnStartup");
const showOnlyHunksSetting = diffSettings.field("showOnlyHunks");
const showStatisticsPanelSetting = diffSettings.field("showStatisticsPanel");
const sidebarWidthSetting = diffSettings.field("sidebarWidth");
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

export function getDiffHighlightChangedCharactersSetting(): boolean {
  return highlightChangedCharactersSetting.get();
}

export function getDiffIgnoreWhitespaceChangesSetting(): boolean {
  return ignoreWhitespaceChangesSetting.get();
}

export function getDiffShowWhitespaceCharactersSetting(): boolean {
  return showWhitespaceCharactersSetting.get();
}

export function getDiffViewModeSetting(): DiffViewMode {
  return viewModeSetting.get();
}

export function getDiffRestoreWindowsOnStartupSetting(): boolean {
  return restoreWindowsOnStartupSetting.get();
}

export function getDiffShowOnlyHunksSetting(): boolean {
  return showOnlyHunksSetting.get();
}

export function getDiffShowStatisticsPanelSetting(): boolean {
  return showStatisticsPanelSetting.get();
}

export function getDiffSidebarWidthSetting(): number {
  return sidebarWidthSetting.get();
}

export function getDiffSyntaxHighlightingEnabledSetting(): boolean {
  return syntaxHighlightingEnabledSetting.get();
}

export function useDiffFontFamilySetting(): DiffFontFamilySetting {
  return normalizeDiffFontFamily(useValue(diffSettings$.fontFamily));
}

export function useDiffAdaptiveLightModeEnabledSetting(): boolean {
  return normalizeBooleanSetting(useValue(diffSettings$.adaptiveLightModeEnabled), defaultDiffAdaptiveLightModeEnabled);
}

export function useDiffFontSizeSetting(): number {
  return normalizeDiffFontSize(useValue(diffSettings$.fontSize));
}

export function useDiffHighlightChangedCharactersSetting(): boolean {
  return normalizeBooleanSetting(
    useValue(diffSettings$.highlightChangedCharacters),
    defaultDiffHighlightChangedCharacters,
  );
}

export function useDiffIgnoreWhitespaceChangesSetting(): boolean {
  return normalizeBooleanSetting(
    useValue(diffSettings$.ignoreWhitespaceChanges),
    defaultDiffIgnoreWhitespaceChanges,
  );
}

export function useDiffShowWhitespaceCharactersSetting(): boolean {
  return normalizeBooleanSetting(
    useValue(diffSettings$.showWhitespaceCharacters),
    defaultDiffShowWhitespaceCharacters,
  );
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

export function useDiffRestoreWindowsOnStartupSetting(): boolean {
  return normalizeBooleanSetting(useValue(diffSettings$.restoreWindowsOnStartup), defaultDiffRestoreWindowsOnStartup);
}

export function useDiffShowOnlyHunksSetting(): boolean {
  return normalizeBooleanSetting(useValue(diffSettings$.showOnlyHunks), defaultDiffShowOnlyHunks);
}

export function useDiffShowStatisticsPanelSetting(): boolean {
  return normalizeBooleanSetting(useValue(diffSettings$.showStatisticsPanel), defaultDiffShowStatisticsPanel);
}

export function useDiffSidebarWidthSetting(): number {
  return normalizeDiffSidebarWidth(useValue(diffSettings$.sidebarWidth));
}

export function useDiffSyntaxHighlightingEnabledSetting(): boolean {
  return normalizeBooleanSetting(useValue(diffSettings$.syntaxHighlightingEnabled), defaultDiffSyntaxHighlightingEnabled);
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

export function setDiffHighlightChangedCharactersSetting(enabled: boolean) {
  highlightChangedCharactersSetting.set(enabled);
}

export function setDiffIgnoreWhitespaceChangesSetting(enabled: boolean) {
  ignoreWhitespaceChangesSetting.set(enabled);
}

export function setDiffShowWhitespaceCharactersSetting(enabled: boolean) {
  showWhitespaceCharactersSetting.set(enabled);
}

export function setDiffViewModeSetting(viewMode: DiffViewMode) {
  viewModeSetting.set(viewMode);
}

export function setDiffRestoreWindowsOnStartupSetting(enabled: boolean) {
  restoreWindowsOnStartupSetting.set(enabled);
}

export function setDiffShowOnlyHunksSetting(enabled: boolean) {
  showOnlyHunksSetting.set(enabled);
}

export function setDiffShowStatisticsPanelSetting(enabled: boolean) {
  showStatisticsPanelSetting.set(enabled);
}

export function setDiffSidebarWidthSetting(sidebarWidth: number) {
  sidebarWidthSetting.set(sidebarWidth);
}

export function setDiffSyntaxHighlightingEnabledSetting(enabled: boolean) {
  syntaxHighlightingEnabledSetting.set(enabled);
}
