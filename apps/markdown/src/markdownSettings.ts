import { Settings } from "react-native";
import { Uniwind, type ThemeName } from "uniwind";

const themeSettingsKey = "legend-markdown.settings.theme";
const startupBehaviorSettingsKey = "legend-markdown.settings.startupBehavior";
const formattingToolbarModeSettingsKey = "legend-markdown.settings.formattingToolbarMode";
const lastDocumentPathSettingsKey = "legend-markdown.settings.lastDocumentPath";

export type MarkdownThemeSetting = "light" | "dark" | "grey";
export type MarkdownStartupBehaviorSetting = "newDocument" | "lastDocument";
export type MarkdownFormattingToolbarModeSetting = "selection" | "top";

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

export function setLastMarkdownDocumentPath(path: string) {
  Settings.set({ [lastDocumentPathSettingsKey]: path });
}

export function applyMarkdownThemeSetting() {
  Uniwind.setTheme(getMarkdownThemeSetting() as ThemeName);
}
