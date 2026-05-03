import { Settings } from "react-native";
import { Uniwind, type ThemeName } from "uniwind";

const settingsKey = "legend-markdown.settings.theme";

export type MarkdownThemeSetting = "light" | "dark";

const subscribers = new Set<() => void>();

function isMarkdownThemeSetting(value: unknown): value is MarkdownThemeSetting {
  return value === "light" || value === "dark";
}

export function getMarkdownThemeSetting(): MarkdownThemeSetting {
  const value = Settings.get(settingsKey);
  return isMarkdownThemeSetting(value) ? value : "light";
}

export function subscribeToMarkdownSettings(listener: () => void) {
  subscribers.add(listener);
  return () => {
    subscribers.delete(listener);
  };
}

export function setMarkdownThemeSetting(theme: MarkdownThemeSetting) {
  Settings.set({ [settingsKey]: theme });
  Uniwind.setTheme(theme as ThemeName);
  subscribers.forEach((listener) => listener());
}

export function applyMarkdownThemeSetting() {
  Uniwind.setTheme(getMarkdownThemeSetting() as ThemeName);
}
