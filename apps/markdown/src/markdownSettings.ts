import { parseHotkey, type HotkeyState, type HotkeyValue } from "@legend-desktop/hotkeys";
import { createNativeSettingsValue, createSettingsSubscription } from "@legend-desktop/app-settings";
import { Settings } from "react-native";
import { Uniwind, type ThemeName } from "uniwind";
import {
  defaultMarkdownHotkeySettings,
  markdownHotkeyDefinitions,
  type MarkdownHotkeyId,
} from "./markdownHotkeys";

const themeSettingsKey = "legend-markdown.settings.theme";
const startupBehaviorSettingsKey = "legend-markdown.settings.startupBehavior";
const autosaveSettingsKey = "legend-markdown.settings.autosave";
const formattingToolbarModeSettingsKey = "legend-markdown.settings.formattingToolbarMode";
const lastDocumentPathSettingsKey = "legend-markdown.settings.lastDocumentPath";
const fontFamilySettingsKey = "legend-markdown.settings.fontFamily";
const fontSizeSettingsKey = "legend-markdown.settings.fontSize";
const lineHeightSettingsKey = "legend-markdown.settings.lineHeight";
const contentWidthSettingsKey = "legend-markdown.settings.contentWidth";
const documentDensitySettingsKey = "legend-markdown.settings.documentDensity";
const hotkeysSettingsKey = "legend-markdown.settings.hotkeys";

export type MarkdownThemeSetting = "light" | "dark" | "grey";
export type MarkdownStartupBehaviorSetting = "newDocument" | "lastDocument";
export type MarkdownAutosaveSetting = "enabled" | "disabled";
export type MarkdownFormattingToolbarModeSetting = "selection" | "top" | "hidden";
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

const fontSizeOrder: MarkdownFontSizeSetting[] = ["small", "default", "large", "xlarge"];

const settingsSubscription = createSettingsSubscription();
const notifyMarkdownSettingsChanged = settingsSubscription.notify;

function isMarkdownThemeSetting(value: unknown): value is MarkdownThemeSetting {
  return value === "light" || value === "dark" || value === "grey";
}

function isMarkdownStartupBehaviorSetting(value: unknown): value is MarkdownStartupBehaviorSetting {
  return value === "newDocument" || value === "lastDocument";
}

function isMarkdownAutosaveSetting(value: unknown): value is MarkdownAutosaveSetting {
  return value === "enabled" || value === "disabled";
}

function isMarkdownFormattingToolbarModeSetting(value: unknown): value is MarkdownFormattingToolbarModeSetting {
  return value === "selection" || value === "top" || value === "hidden";
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

const themeSetting = createNativeSettingsValue<MarkdownThemeSetting>({
  afterSet: (theme) => {
    Uniwind.setTheme(theme as ThemeName);
  },
  defaultValue: "light",
  isValue: isMarkdownThemeSetting,
  key: themeSettingsKey,
  notify: notifyMarkdownSettingsChanged,
});
const startupBehaviorSetting = createNativeSettingsValue<MarkdownStartupBehaviorSetting>({
  defaultValue: "newDocument",
  isValue: isMarkdownStartupBehaviorSetting,
  key: startupBehaviorSettingsKey,
  notify: notifyMarkdownSettingsChanged,
});
const autosaveSetting = createNativeSettingsValue<MarkdownAutosaveSetting>({
  defaultValue: "enabled",
  isValue: isMarkdownAutosaveSetting,
  key: autosaveSettingsKey,
  notify: notifyMarkdownSettingsChanged,
});
const formattingToolbarModeSetting = createNativeSettingsValue<MarkdownFormattingToolbarModeSetting>({
  defaultValue: "selection",
  isValue: isMarkdownFormattingToolbarModeSetting,
  key: formattingToolbarModeSettingsKey,
  notify: notifyMarkdownSettingsChanged,
});
const fontFamilySetting = createNativeSettingsValue<MarkdownFontFamilySetting>({
  defaultValue: "system",
  isValue: isMarkdownFontFamilySetting,
  key: fontFamilySettingsKey,
  notify: notifyMarkdownSettingsChanged,
});
const fontSizeSetting = createNativeSettingsValue<MarkdownFontSizeSetting>({
  defaultValue: "default",
  isValue: isMarkdownFontSizeSetting,
  key: fontSizeSettingsKey,
  notify: notifyMarkdownSettingsChanged,
});
const lineHeightSetting = createNativeSettingsValue<MarkdownLineHeightSetting>({
  defaultValue: "normal",
  isValue: isMarkdownLineHeightSetting,
  key: lineHeightSettingsKey,
  notify: notifyMarkdownSettingsChanged,
});
const contentWidthSetting = createNativeSettingsValue<MarkdownContentWidthSetting>({
  defaultValue: "standard",
  isValue: isMarkdownContentWidthSetting,
  key: contentWidthSettingsKey,
  notify: notifyMarkdownSettingsChanged,
});
const documentDensitySetting = createNativeSettingsValue<MarkdownDocumentDensitySetting>({
  defaultValue: "comfortable",
  isValue: isMarkdownDocumentDensitySetting,
  key: documentDensitySettingsKey,
  notify: notifyMarkdownSettingsChanged,
});

let cachedAppearanceSettings: MarkdownAppearanceSettings | null = null;
let cachedHotkeySettings: HotkeyState<MarkdownHotkeyId> | null = null;
let cachedHotkeySettingsSource: string | null = null;

export function getMarkdownThemeSetting(): MarkdownThemeSetting {
  return themeSetting.get();
}

export function getMarkdownStartupBehaviorSetting(): MarkdownStartupBehaviorSetting {
  return startupBehaviorSetting.get();
}

export function getMarkdownAutosaveSetting(): MarkdownAutosaveSetting {
  return autosaveSetting.get();
}

export function getMarkdownFormattingToolbarModeSetting(): MarkdownFormattingToolbarModeSetting {
  return formattingToolbarModeSetting.get();
}

export function getMarkdownFontFamilySetting(): MarkdownFontFamilySetting {
  return fontFamilySetting.get();
}

export function getMarkdownFontSizeSetting(): MarkdownFontSizeSetting {
  return fontSizeSetting.get();
}

export function getMarkdownLineHeightSetting(): MarkdownLineHeightSetting {
  return lineHeightSetting.get();
}

export function getMarkdownContentWidthSetting(): MarkdownContentWidthSetting {
  return contentWidthSetting.get();
}

export function getMarkdownDocumentDensitySetting(): MarkdownDocumentDensitySetting {
  return documentDensitySetting.get();
}

export function getMarkdownAppearanceSettings(): MarkdownAppearanceSettings {
  const nextSettings = {
    contentWidth: getMarkdownContentWidthSetting(),
    density: getMarkdownDocumentDensitySetting(),
    fontFamily: getMarkdownFontFamilySetting(),
    fontSize: getMarkdownFontSizeSetting(),
    lineHeight: getMarkdownLineHeightSetting(),
  };

  if (
    cachedAppearanceSettings &&
    cachedAppearanceSettings.contentWidth === nextSettings.contentWidth &&
    cachedAppearanceSettings.density === nextSettings.density &&
    cachedAppearanceSettings.fontFamily === nextSettings.fontFamily &&
    cachedAppearanceSettings.fontSize === nextSettings.fontSize &&
    cachedAppearanceSettings.lineHeight === nextSettings.lineHeight
  ) {
    return cachedAppearanceSettings;
  }

  cachedAppearanceSettings = nextSettings;
  return nextSettings;
}

function isHotkeyValue(value: unknown): value is HotkeyValue | null {
  if (value === null) {
    return true;
  }
  if (typeof value !== "number" && typeof value !== "string") {
    return false;
  }
  return parseHotkey(value as HotkeyValue).length > 0;
}

function readStoredMarkdownHotkeys() {
  const value = Settings.get(hotkeysSettingsKey);
  if (typeof value === "string" && value.length > 0) {
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return undefined;
    }
  }
  return value;
}

export function getMarkdownHotkeySettings(): HotkeyState<MarkdownHotkeyId> {
  const stored = readStoredMarkdownHotkeys();
  const source = JSON.stringify(stored ?? null);
  if (cachedHotkeySettings && cachedHotkeySettingsSource === source) {
    return cachedHotkeySettings;
  }

  const nextSettings: HotkeyState<MarkdownHotkeyId> = { ...defaultMarkdownHotkeySettings };
  if (stored && typeof stored === "object") {
    for (const definition of markdownHotkeyDefinitions) {
      const value = (stored as Record<string, unknown>)[definition.id];
      if (isHotkeyValue(value)) {
        nextSettings[definition.id] = value;
      }
    }
  }

  cachedHotkeySettings = nextSettings;
  cachedHotkeySettingsSource = source;
  return nextSettings;
}

export function getLastMarkdownDocumentPath() {
  const value = Settings.get(lastDocumentPathSettingsKey);
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function subscribeToMarkdownSettings(listener: () => void) {
  return settingsSubscription.subscribe(listener);
}

export function setMarkdownThemeSetting(theme: MarkdownThemeSetting) {
  themeSetting.set(theme);
}

export function setMarkdownStartupBehaviorSetting(startupBehavior: MarkdownStartupBehaviorSetting) {
  startupBehaviorSetting.set(startupBehavior);
}

export function setMarkdownAutosaveSetting(autosave: MarkdownAutosaveSetting) {
  autosaveSetting.set(autosave);
}

export function setMarkdownFormattingToolbarModeSetting(formattingToolbarMode: MarkdownFormattingToolbarModeSetting) {
  formattingToolbarModeSetting.set(formattingToolbarMode);
}

export function setMarkdownFontFamilySetting(fontFamily: MarkdownFontFamilySetting) {
  fontFamilySetting.set(fontFamily);
}

export function setMarkdownFontSizeSetting(fontSize: MarkdownFontSizeSetting) {
  fontSizeSetting.set(fontSize);
}

export function increaseMarkdownFontSizeSetting() {
  const currentIndex = fontSizeOrder.indexOf(getMarkdownFontSizeSetting());
  const nextIndex = Math.min(fontSizeOrder.length - 1, currentIndex + 1);
  setMarkdownFontSizeSetting(fontSizeOrder[nextIndex] ?? "default");
}

export function decreaseMarkdownFontSizeSetting() {
  const currentIndex = fontSizeOrder.indexOf(getMarkdownFontSizeSetting());
  const nextIndex = Math.max(0, currentIndex - 1);
  setMarkdownFontSizeSetting(fontSizeOrder[nextIndex] ?? "default");
}

export function resetMarkdownFontSizeSetting() {
  setMarkdownFontSizeSetting("default");
}

export function setMarkdownLineHeightSetting(lineHeight: MarkdownLineHeightSetting) {
  lineHeightSetting.set(lineHeight);
}

export function setMarkdownContentWidthSetting(contentWidth: MarkdownContentWidthSetting) {
  contentWidthSetting.set(contentWidth);
}

export function setMarkdownDocumentDensitySetting(density: MarkdownDocumentDensitySetting) {
  documentDensitySetting.set(density);
}

export function setMarkdownHotkeySetting(id: MarkdownHotkeyId, value: HotkeyValue | null) {
  const nextSettings = {
    ...getMarkdownHotkeySettings(),
    [id]: value,
  };
  cachedHotkeySettings = nextSettings;
  cachedHotkeySettingsSource = JSON.stringify(nextSettings);
  Settings.set({ [hotkeysSettingsKey]: cachedHotkeySettingsSource });
  notifyMarkdownSettingsChanged();
}

export function setLastMarkdownDocumentPath(path: string) {
  Settings.set({ [lastDocumentPathSettingsKey]: path });
}

export function clearLastMarkdownDocumentPath(path?: string) {
  const currentPath = getLastMarkdownDocumentPath();
  if (!path || currentPath === path) {
    Settings.set({ [lastDocumentPathSettingsKey]: null });
  }
}

export function applyMarkdownThemeSetting() {
  Uniwind.setTheme(getMarkdownThemeSetting() as ThemeName);
}
