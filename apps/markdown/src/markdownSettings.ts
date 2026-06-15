import { applyLegendThemeToUniwind } from "@legend-desktop/theme";
import { type HotkeyState, type HotkeyValue } from "@legend-desktop/hotkeys";
import { createObservableFile } from "@legend-desktop/storage";
import { useValue } from "@legendapp/state/react";
import { useMemo } from "react";
import {
  defaultMarkdownHotkeySettings,
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
export type MarkdownFormattingToolbarModeSetting = "selection" | "top" | "bottom" | "hidden";
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
  hotkeys: HotkeyState<MarkdownHotkeyId>;
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
  hotkeys: { ...defaultMarkdownHotkeySettings },
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
  return value === "selection" || value === "top" || value === "bottom" || value === "hidden";
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
  return {
    contentWidth: getMarkdownContentWidthSetting(),
    density: getMarkdownDocumentDensitySetting(),
    fontFamily: getMarkdownFontFamilySetting(),
    fontSize: getMarkdownFontSizeSetting(),
    lineHeight: getMarkdownLineHeightSetting(),
  };
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
  const hotkeys = markdownSettings$.hotkeys.get();
  return hotkeys && typeof hotkeys === "object" ? hotkeys : initialMarkdownSettings.hotkeys;
}

export function getMarkdownToolbarLayoutSetting(layoutId: MarkdownToolbarLayoutId): MarkdownToolbarLayout {
  const stored = readStoredMarkdownToolbarLayout(layoutId);
  return getNormalizedMarkdownToolbarLayout(stored, layoutId);
}

function getNormalizedMarkdownToolbarLayout(
  stored: MarkdownToolbarLayout | undefined,
  layoutId: MarkdownToolbarLayoutId,
): MarkdownToolbarLayout {
  const normalized = normalizeMarkdownToolbarLayout(stored, layoutId);
  return {
    shown: normalized.shown,
  };
}

export function getLastMarkdownDocumentPath() {
  const value = markdownSettings$.lastDocumentPath.get();
  return typeof value === "string" && value.length > 0 ? value : null;
}

export function useMarkdownThemeSetting(): MarkdownThemeSetting {
  const theme = useValue(markdownSettings$.theme);
  return isMarkdownThemeSetting(theme) ? theme : initialMarkdownSettings.theme;
}

export function useMarkdownStartupBehaviorSetting(): MarkdownStartupBehaviorSetting {
  const startupBehavior = useValue(markdownSettings$.startupBehavior);
  return isMarkdownStartupBehaviorSetting(startupBehavior) ? startupBehavior : initialMarkdownSettings.startupBehavior;
}

export function useMarkdownAutosaveSetting(): MarkdownAutosaveSetting {
  const autosave = useValue(markdownSettings$.autosave);
  return isMarkdownAutosaveSetting(autosave) ? autosave : initialMarkdownSettings.autosave;
}

export function useMarkdownFormattingToolbarModeSetting(): MarkdownFormattingToolbarModeSetting {
  const formattingToolbarMode = useValue(markdownSettings$.formattingToolbarMode);
  return isMarkdownFormattingToolbarModeSetting(formattingToolbarMode)
    ? formattingToolbarMode
    : initialMarkdownSettings.formattingToolbarMode;
}

export function useMarkdownFontFamilySetting(): MarkdownFontFamilySetting {
  const fontFamily = useValue(markdownSettings$.fontFamily);
  return isMarkdownFontFamilySetting(fontFamily) ? fontFamily : initialMarkdownSettings.fontFamily;
}

export function useMarkdownFontSizeSetting(): MarkdownFontSizeSetting {
  const fontSize = useValue(markdownSettings$.fontSize);
  return isMarkdownFontSizeSetting(fontSize) ? fontSize : initialMarkdownSettings.fontSize;
}

export function useMarkdownLineHeightSetting(): MarkdownLineHeightSetting {
  const lineHeight = useValue(markdownSettings$.lineHeight);
  return isMarkdownLineHeightSetting(lineHeight) ? lineHeight : initialMarkdownSettings.lineHeight;
}

export function useMarkdownContentWidthSetting(): MarkdownContentWidthSetting {
  const contentWidth = useValue(markdownSettings$.contentWidth);
  return isMarkdownContentWidthSetting(contentWidth) ? contentWidth : initialMarkdownSettings.contentWidth;
}

export function useMarkdownDocumentDensitySetting(): MarkdownDocumentDensitySetting {
  const density = useValue(markdownSettings$.density);
  return isMarkdownDocumentDensitySetting(density) ? density : initialMarkdownSettings.density;
}

export function useMarkdownAppearanceSettings(): MarkdownAppearanceSettings {
  const contentWidth = useMarkdownContentWidthSetting();
  const density = useMarkdownDocumentDensitySetting();
  const fontFamily = useMarkdownFontFamilySetting();
  const fontSize = useMarkdownFontSizeSetting();
  const lineHeight = useMarkdownLineHeightSetting();

  return useMemo(
    () => ({
      contentWidth,
      density,
      fontFamily,
      fontSize,
      lineHeight,
    }),
    [contentWidth, density, fontFamily, fontSize, lineHeight],
  );
}

export function useMarkdownHotkeySettings(): HotkeyState<MarkdownHotkeyId> {
  return useValue(markdownSettings$.hotkeys);
}

export function useMarkdownToolbarLayoutSetting(layoutId: MarkdownToolbarLayoutId): MarkdownToolbarLayout {
  const layout$ = layoutId === "top" ? markdownSettings$.topToolbarLayout : markdownSettings$.selectionToolbarLayout;
  const stored = useValue(layout$);
  return useMemo(
    () => getNormalizedMarkdownToolbarLayout(stored, layoutId),
    [layoutId, stored],
  );
}

export function setMarkdownThemeSetting(theme: MarkdownThemeSetting) {
  markdownSettings$.theme.set(theme);
  applyLegendThemeToUniwind(theme);
}

export function setMarkdownStartupBehaviorSetting(startupBehavior: MarkdownStartupBehaviorSetting) {
  markdownSettings$.startupBehavior.set(startupBehavior);
}

export function setMarkdownAutosaveSetting(autosave: MarkdownAutosaveSetting) {
  markdownSettings$.autosave.set(autosave);
}

export function setMarkdownFormattingToolbarModeSetting(formattingToolbarMode: MarkdownFormattingToolbarModeSetting) {
  markdownSettings$.formattingToolbarMode.set(formattingToolbarMode);
}

export function setMarkdownFontFamilySetting(fontFamily: MarkdownFontFamilySetting) {
  markdownSettings$.fontFamily.set(fontFamily);
}

export function setMarkdownFontSizeSetting(fontSize: MarkdownFontSizeSetting) {
  markdownSettings$.fontSize.set(fontSize);
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
}

export function setMarkdownContentWidthSetting(contentWidth: MarkdownContentWidthSetting) {
  markdownSettings$.contentWidth.set(contentWidth);
}

export function setMarkdownDocumentDensitySetting(density: MarkdownDocumentDensitySetting) {
  markdownSettings$.density.set(density);
}

export function setMarkdownHotkeySetting(id: MarkdownHotkeyId, value: HotkeyValue | null) {
  const nextSettings = {
    ...getMarkdownHotkeySettings(),
    [id]: value,
  };
  markdownSettings$.hotkeys.set(nextSettings);
}

export function setMarkdownToolbarLayoutSetting(layoutId: MarkdownToolbarLayoutId, layout: MarkdownToolbarLayout) {
  const normalized = normalizeMarkdownToolbarLayout(layout, layoutId);
  const nextLayout = {
    shown: normalized.shown,
  };

  if (layoutId === "top") {
    markdownSettings$.topToolbarLayout.set(nextLayout);
  } else {
    markdownSettings$.selectionToolbarLayout.set(nextLayout);
  }
}

export function resetMarkdownToolbarLayoutSetting(layoutId: MarkdownToolbarLayoutId) {
  setMarkdownToolbarLayoutSetting(layoutId, getDefaultMarkdownToolbarLayout(layoutId));
}

export function setLastMarkdownDocumentPath(path: string) {
  markdownSettings$.lastDocumentPath.set(path);
}

export function clearLastMarkdownDocumentPath(path?: string) {
  const currentPath = getLastMarkdownDocumentPath();
  if (!path || currentPath === path) {
    markdownSettings$.lastDocumentPath.set(null);
  }
}

export function applyMarkdownThemeSetting() {
  applyLegendThemeToUniwind(getMarkdownThemeSetting());
}
