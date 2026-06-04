import { Settings } from "react-native";
import { Uniwind, type ThemeName } from "uniwind";

const themeSettingsKey = "legend-markdown.settings.theme";
const startupBehaviorSettingsKey = "legend-markdown.settings.startupBehavior";
const formattingToolbarModeSettingsKey = "legend-markdown.settings.formattingToolbarMode";
const lastDocumentPathSettingsKey = "legend-markdown.settings.lastDocumentPath";
const fontFamilySettingsKey = "legend-markdown.settings.fontFamily";
const fontSizeSettingsKey = "legend-markdown.settings.fontSize";
const lineHeightSettingsKey = "legend-markdown.settings.lineHeight";
const contentWidthSettingsKey = "legend-markdown.settings.contentWidth";
const documentDensitySettingsKey = "legend-markdown.settings.documentDensity";

export type MarkdownThemeSetting = "light" | "dark" | "grey";
export type MarkdownStartupBehaviorSetting = "newDocument" | "lastDocument";
export type MarkdownFormattingToolbarModeSetting = "selection" | "top";
export type MarkdownFontFamilySetting = "system" | "serif" | "mono";
export type MarkdownFontSizeSetting = "small" | "default" | "large" | "xlarge";
export type MarkdownLineHeightSetting = "compact" | "normal" | "relaxed";
export type MarkdownContentWidthSetting = "narrow" | "standard" | "wide" | "full";
export type MarkdownDocumentDensitySetting = "compact" | "comfortable" | "spacious";

export type MarkdownAppearanceSettings = {
  contentWidth: MarkdownContentWidthSetting;
  density: MarkdownDocumentDensitySetting;
  fontFamily: MarkdownFontFamilySetting;
  fontSize: MarkdownFontSizeSetting;
  lineHeight: MarkdownLineHeightSetting;
};

const subscribers = new Set<() => void>();

function isMarkdownThemeSetting(value: unknown): value is MarkdownThemeSetting {
  return value === "light" || value === "dark" || value === "grey";
}

function isMarkdownStartupBehaviorSetting(value: unknown): value is MarkdownStartupBehaviorSetting {
  return value === "newDocument" || value === "lastDocument";
}

function isMarkdownFormattingToolbarModeSetting(value: unknown): value is MarkdownFormattingToolbarModeSetting {
  return value === "selection" || value === "top";
}

function isMarkdownFontFamilySetting(value: unknown): value is MarkdownFontFamilySetting {
  return value === "system" || value === "serif" || value === "mono";
}

function isMarkdownFontSizeSetting(value: unknown): value is MarkdownFontSizeSetting {
  return value === "small" || value === "default" || value === "large" || value === "xlarge";
}

function isMarkdownLineHeightSetting(value: unknown): value is MarkdownLineHeightSetting {
  return value === "compact" || value === "normal" || value === "relaxed";
}

function isMarkdownContentWidthSetting(value: unknown): value is MarkdownContentWidthSetting {
  return value === "narrow" || value === "standard" || value === "wide" || value === "full";
}

function isMarkdownDocumentDensitySetting(value: unknown): value is MarkdownDocumentDensitySetting {
  return value === "compact" || value === "comfortable" || value === "spacious";
}

export function getMarkdownThemeSetting(): MarkdownThemeSetting {
  const value = Settings.get(themeSettingsKey);
  return isMarkdownThemeSetting(value) ? value : "light";
}

export function getMarkdownStartupBehaviorSetting(): MarkdownStartupBehaviorSetting {
  const value = Settings.get(startupBehaviorSettingsKey);
  return isMarkdownStartupBehaviorSetting(value) ? value : "newDocument";
}

export function getMarkdownFormattingToolbarModeSetting(): MarkdownFormattingToolbarModeSetting {
  const value = Settings.get(formattingToolbarModeSettingsKey);
  return isMarkdownFormattingToolbarModeSetting(value) ? value : "selection";
}

export function getMarkdownFontFamilySetting(): MarkdownFontFamilySetting {
  const value = Settings.get(fontFamilySettingsKey);
  return isMarkdownFontFamilySetting(value) ? value : "system";
}

export function getMarkdownFontSizeSetting(): MarkdownFontSizeSetting {
  const value = Settings.get(fontSizeSettingsKey);
  return isMarkdownFontSizeSetting(value) ? value : "default";
}

export function getMarkdownLineHeightSetting(): MarkdownLineHeightSetting {
  const value = Settings.get(lineHeightSettingsKey);
  return isMarkdownLineHeightSetting(value) ? value : "normal";
}

export function getMarkdownContentWidthSetting(): MarkdownContentWidthSetting {
  const value = Settings.get(contentWidthSettingsKey);
  return isMarkdownContentWidthSetting(value) ? value : "standard";
}

export function getMarkdownDocumentDensitySetting(): MarkdownDocumentDensitySetting {
  const value = Settings.get(documentDensitySettingsKey);
  return isMarkdownDocumentDensitySetting(value) ? value : "comfortable";
}

export function getMarkdownAppearanceSettings(): MarkdownAppearanceSettings {
  return {
    contentWidth: getMarkdownContentWidthSetting(),
    density: getMarkdownDocumentDensitySetting(),
    fontFamily: getMarkdownFontFamilySetting(),
    fontSize: getMarkdownFontSizeSetting(),
    lineHeight: getMarkdownLineHeightSetting(),
  };
}

export function getLastMarkdownDocumentPath() {
  const value = Settings.get(lastDocumentPathSettingsKey);
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function subscribeToMarkdownSettings(listener: () => void) {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

export function setMarkdownThemeSetting(theme: MarkdownThemeSetting) {
  Settings.set({ [themeSettingsKey]: theme });
  Uniwind.setTheme(theme as ThemeName);
  subscribers.forEach((listener) => listener());
}

export function setMarkdownStartupBehaviorSetting(startupBehavior: MarkdownStartupBehaviorSetting) {
  Settings.set({ [startupBehaviorSettingsKey]: startupBehavior });
  subscribers.forEach((listener) => listener());
}

export function setMarkdownFormattingToolbarModeSetting(formattingToolbarMode: MarkdownFormattingToolbarModeSetting) {
  Settings.set({ [formattingToolbarModeSettingsKey]: formattingToolbarMode });
  subscribers.forEach((listener) => listener());
}

export function setMarkdownFontFamilySetting(fontFamily: MarkdownFontFamilySetting) {
  Settings.set({ [fontFamilySettingsKey]: fontFamily });
  subscribers.forEach((listener) => listener());
}

export function setMarkdownFontSizeSetting(fontSize: MarkdownFontSizeSetting) {
  Settings.set({ [fontSizeSettingsKey]: fontSize });
  subscribers.forEach((listener) => listener());
}

export function setMarkdownLineHeightSetting(lineHeight: MarkdownLineHeightSetting) {
  Settings.set({ [lineHeightSettingsKey]: lineHeight });
  subscribers.forEach((listener) => listener());
}

export function setMarkdownContentWidthSetting(contentWidth: MarkdownContentWidthSetting) {
  Settings.set({ [contentWidthSettingsKey]: contentWidth });
  subscribers.forEach((listener) => listener());
}

export function setMarkdownDocumentDensitySetting(density: MarkdownDocumentDensitySetting) {
  Settings.set({ [documentDensitySettingsKey]: density });
  subscribers.forEach((listener) => listener());
}

export function setLastMarkdownDocumentPath(path: string) {
  Settings.set({ [lastDocumentPathSettingsKey]: path });
}

export function applyMarkdownThemeSetting() {
  Uniwind.setTheme(getMarkdownThemeSetting() as ThemeName);
}
