import { getLegendUniwindThemeName } from "@legend-desktop/theme";
import { parseHotkey, type HotkeyState, type HotkeyValue } from "@legend-desktop/hotkeys";
import { createObservableFile } from "@legend-desktop/storage";
import { Uniwind, type ThemeName } from "uniwind";
import {
  defaultMarkdownHotkeySettings,
  markdownHotkeyDefinitions,
  type MarkdownHotkeyId,
} from "./markdownHotkeys";
import {
  getDefaultMarkdownToolbarLayout,
  normalizeMarkdownToolbarLayout,
  type MarkdownToolbarLayout,
  type MarkdownToolbarLayoutId,
} from "./markdownToolbarLayout";

export type MarkdownThemeSetting = string;
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

export type {
  MarkdownToolbarControlGroup,
  MarkdownToolbarLayout,
  MarkdownToolbarLayoutId,
} from "./markdownToolbarLayout";

const fontSizeOrder: MarkdownFontSizeSetting[] = ["small", "default", "large", "xlarge"];

type MarkdownSettingsFile = {
  autosave: MarkdownAutosaveSetting;
  contentWidth: MarkdownContentWidthSetting;
  density: MarkdownDocumentDensitySetting;
  fontFamily: MarkdownFontFamilySetting;
  fontSize: MarkdownFontSizeSetting;
  formattingToolbarMode: MarkdownFormattingToolbarModeSetting;
  hotkeys: Partial<HotkeyState<MarkdownHotkeyId>>;
  lastDocumentPath: string | null;
  lineHeight: MarkdownLineHeightSetting;
  selectionToolbarLayout: MarkdownToolbarLayout;
  startupBehavior: MarkdownStartupBehaviorSetting;
  theme: MarkdownThemeSetting;
  topToolbarLayout: MarkdownToolbarLayout;
};

const initialMarkdownSettings: MarkdownSettingsFile = {
  autosave: "enabled",
  contentWidth: "standard",
  density: "comfortable",
  fontFamily: "system",
  fontSize: "default",
  formattingToolbarMode: "selection",
  hotkeys: {},
  lastDocumentPath: null,
  lineHeight: "normal",
  selectionToolbarLayout: getDefaultMarkdownToolbarLayout("selection"),
  startupBehavior: "newDocument",
  theme: "light",
  topToolbarLayout: getDefaultMarkdownToolbarLayout("top"),
};

const markdownSettings$ = createObservableFile<MarkdownSettingsFile>({
  filename: "settings",
  initialValue: initialMarkdownSettings,
});

const settingsSubscribers = new Set<() => void>();

function notifyMarkdownSettingsChanged() {
  settingsSubscribers.forEach((listener) => listener());
}

function isMarkdownThemeSetting(value: unknown): value is MarkdownThemeSetting {
  return typeof value === "string" && value.length > 0;
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

let cachedAppearanceSettings: MarkdownAppearanceSettings | null = null;
let cachedHotkeySettings: HotkeyState<MarkdownHotkeyId> | null = null;
let cachedHotkeySettingsSource: string | null = null;
let cachedToolbarLayoutSettings: Partial<Record<MarkdownToolbarLayoutId, MarkdownToolbarLayout>> = {};
let cachedToolbarLayoutSettingsSource: Partial<Record<MarkdownToolbarLayoutId, string>> = {};

export function getMarkdownThemeSetting(): MarkdownThemeSetting {
  const theme = markdownSettings$.theme.get();
  return isMarkdownThemeSetting(theme) ? theme : initialMarkdownSettings.theme;
}

export function getMarkdownStartupBehaviorSetting(): MarkdownStartupBehaviorSetting {
  const startupBehavior = markdownSettings$.startupBehavior.get();
  return isMarkdownStartupBehaviorSetting(startupBehavior) ? startupBehavior : initialMarkdownSettings.startupBehavior;
}

export function getMarkdownAutosaveSetting(): MarkdownAutosaveSetting {
  const autosave = markdownSettings$.autosave.get();
  return isMarkdownAutosaveSetting(autosave) ? autosave : initialMarkdownSettings.autosave;
}

export function getMarkdownFormattingToolbarModeSetting(): MarkdownFormattingToolbarModeSetting {
  const formattingToolbarMode = markdownSettings$.formattingToolbarMode.get();
  return isMarkdownFormattingToolbarModeSetting(formattingToolbarMode)
    ? formattingToolbarMode
    : initialMarkdownSettings.formattingToolbarMode;
}

export function getMarkdownFontFamilySetting(): MarkdownFontFamilySetting {
  const fontFamily = markdownSettings$.fontFamily.get();
  return isMarkdownFontFamilySetting(fontFamily) ? fontFamily : initialMarkdownSettings.fontFamily;
}

export function getMarkdownFontSizeSetting(): MarkdownFontSizeSetting {
  const fontSize = markdownSettings$.fontSize.get();
  return isMarkdownFontSizeSetting(fontSize) ? fontSize : initialMarkdownSettings.fontSize;
}

export function getMarkdownLineHeightSetting(): MarkdownLineHeightSetting {
  const lineHeight = markdownSettings$.lineHeight.get();
  return isMarkdownLineHeightSetting(lineHeight) ? lineHeight : initialMarkdownSettings.lineHeight;
}

export function getMarkdownContentWidthSetting(): MarkdownContentWidthSetting {
  const contentWidth = markdownSettings$.contentWidth.get();
  return isMarkdownContentWidthSetting(contentWidth) ? contentWidth : initialMarkdownSettings.contentWidth;
}

export function getMarkdownDocumentDensitySetting(): MarkdownDocumentDensitySetting {
  const density = markdownSettings$.density.get();
  return isMarkdownDocumentDensitySetting(density) ? density : initialMarkdownSettings.density;
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

function readStoredMarkdownToolbarLayout(layoutId: MarkdownToolbarLayoutId): MarkdownToolbarLayout | undefined {
  const parsedValue = layoutId === "top"
    ? markdownSettings$.topToolbarLayout.get()
    : markdownSettings$.selectionToolbarLayout.get();

  if (parsedValue && typeof parsedValue === "object" && Array.isArray((parsedValue as { shown?: unknown }).shown)) {
    return parsedValue as MarkdownToolbarLayout;
  }

  return undefined;
}

export function getMarkdownHotkeySettings(): HotkeyState<MarkdownHotkeyId> {
  const stored = markdownSettings$.hotkeys.get();
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

export function getMarkdownToolbarLayoutSetting(layoutId: MarkdownToolbarLayoutId): MarkdownToolbarLayout {
  const stored = readStoredMarkdownToolbarLayout(layoutId);
  const source = JSON.stringify(stored ?? null);
  const cached = cachedToolbarLayoutSettings[layoutId];
  if (cached && cachedToolbarLayoutSettingsSource[layoutId] === source) {
    return cached;
  }

  const normalized = normalizeMarkdownToolbarLayout(stored, layoutId);
  const nextLayout = {
    shown: normalized.shown,
  };

  cachedToolbarLayoutSettings[layoutId] = nextLayout;
  cachedToolbarLayoutSettingsSource[layoutId] = source;
  return nextLayout;
}

export function getLastMarkdownDocumentPath() {
  const value = markdownSettings$.lastDocumentPath.get();
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function subscribeToMarkdownSettings(listener: () => void) {
  settingsSubscribers.add(listener);
  return () => {
    settingsSubscribers.delete(listener);
  };
}

export function setMarkdownThemeSetting(theme: MarkdownThemeSetting) {
  markdownSettings$.theme.set(theme);
  Uniwind.setTheme(getLegendUniwindThemeName(theme) as ThemeName);
  notifyMarkdownSettingsChanged();
}

export function setMarkdownStartupBehaviorSetting(startupBehavior: MarkdownStartupBehaviorSetting) {
  markdownSettings$.startupBehavior.set(startupBehavior);
  notifyMarkdownSettingsChanged();
}

export function setMarkdownAutosaveSetting(autosave: MarkdownAutosaveSetting) {
  markdownSettings$.autosave.set(autosave);
  notifyMarkdownSettingsChanged();
}

export function setMarkdownFormattingToolbarModeSetting(formattingToolbarMode: MarkdownFormattingToolbarModeSetting) {
  markdownSettings$.formattingToolbarMode.set(formattingToolbarMode);
  notifyMarkdownSettingsChanged();
}

export function setMarkdownFontFamilySetting(fontFamily: MarkdownFontFamilySetting) {
  markdownSettings$.fontFamily.set(fontFamily);
  notifyMarkdownSettingsChanged();
}

export function setMarkdownFontSizeSetting(fontSize: MarkdownFontSizeSetting) {
  markdownSettings$.fontSize.set(fontSize);
  notifyMarkdownSettingsChanged();
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
  markdownSettings$.lineHeight.set(lineHeight);
  notifyMarkdownSettingsChanged();
}

export function setMarkdownContentWidthSetting(contentWidth: MarkdownContentWidthSetting) {
  markdownSettings$.contentWidth.set(contentWidth);
  notifyMarkdownSettingsChanged();
}

export function setMarkdownDocumentDensitySetting(density: MarkdownDocumentDensitySetting) {
  markdownSettings$.density.set(density);
  notifyMarkdownSettingsChanged();
}

export function setMarkdownHotkeySetting(id: MarkdownHotkeyId, value: HotkeyValue | null) {
  const nextSettings = {
    ...getMarkdownHotkeySettings(),
    [id]: value,
  };
  cachedHotkeySettings = nextSettings;
  cachedHotkeySettingsSource = JSON.stringify(nextSettings);
  markdownSettings$.hotkeys.set(nextSettings);
  notifyMarkdownSettingsChanged();
}

export function setMarkdownToolbarLayoutSetting(layoutId: MarkdownToolbarLayoutId, layout: MarkdownToolbarLayout) {
  const normalized = normalizeMarkdownToolbarLayout(layout, layoutId);
  const nextLayout = {
    shown: normalized.shown,
  };
  const source = JSON.stringify(nextLayout);

  cachedToolbarLayoutSettings[layoutId] = nextLayout;
  cachedToolbarLayoutSettingsSource[layoutId] = source;
  if (layoutId === "top") {
    markdownSettings$.topToolbarLayout.set(nextLayout);
  } else {
    markdownSettings$.selectionToolbarLayout.set(nextLayout);
  }
  notifyMarkdownSettingsChanged();
}

export function resetMarkdownToolbarLayoutSetting(layoutId: MarkdownToolbarLayoutId) {
  setMarkdownToolbarLayoutSetting(layoutId, getDefaultMarkdownToolbarLayout(layoutId));
}

export function setLastMarkdownDocumentPath(path: string) {
  markdownSettings$.lastDocumentPath.set(path);
  notifyMarkdownSettingsChanged();
}

export function clearLastMarkdownDocumentPath(path?: string) {
  const currentPath = getLastMarkdownDocumentPath();
  if (!path || currentPath === path) {
    markdownSettings$.lastDocumentPath.set(null);
    notifyMarkdownSettingsChanged();
  }
}

export function applyMarkdownThemeSetting() {
  Uniwind.setTheme(getLegendUniwindThemeName(getMarkdownThemeSetting()) as ThemeName);
}
