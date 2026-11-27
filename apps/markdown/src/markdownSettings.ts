import { applyLegendDisplayThemeToUniwind, defaultLegendChromeTheme, type LegendChromeTheme } from "@legend-apps/theme";
import { type HotkeyBindingState, type HotkeyValue } from "@legendapp/spark/shortcuts/commands";
import { createObservableFile } from "@legend-apps/storage";
import { parsePaneLayout, type PaneLayout } from "@legend-apps/workspace";
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
import {
  resolveMarkdownPluginRules,
  type MarkdownPluginCommand,
  type MarkdownPluginManifest,
  type MarkdownPluginRule,
  type MarkdownPreset,
  type MarkdownRuleOverride,
} from "./markdownPlugins";

export type MarkdownDisplayThemeSetting = string;
export type MarkdownLayoutThemeSetting = string;
export type MarkdownThemeSetting = MarkdownDisplayThemeSetting;
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
  chrome: LegendChromeTheme;
  contentWidth: MarkdownContentWidthSetting;
  density: MarkdownDocumentDensitySetting;
  displayTheme: MarkdownDisplayThemeSetting;
  fontFamily: MarkdownFontFamilySetting;
  fontSize: MarkdownFontSizeSetting;
  formattingToolbarMode: MarkdownFormattingToolbarModeSetting;
  hotkeys: HotkeyBindingState<MarkdownHotkeyId>;
  lastDocumentPath: string | null;
  layoutTheme: MarkdownLayoutThemeSetting;
  lineHeight: MarkdownLineHeightSetting;
  /** The main window's split panes; read through parsePaneLayout, so a bad value falls back to one pane. */
  paneLayout?: unknown;
  /** Plugin command IDs appended to the docked toolbar, kept apart from the built-in layout. */
  pluginToolbar?: { top?: string[] };
  /** Preset overrides for plugin-declared rules, keyed by rule ID. */
  pluginRuleOverrides?: Record<string, MarkdownRuleOverride>;
  /** Installed plugin manifests, keyed by plugin ID. */
  plugins?: Record<string, { enabled: boolean; manifest: MarkdownPluginManifest }>;
  selectionToolbarLayout: MarkdownToolbarLayout;
  sidebarFolders: string[];
  sidebarOpen: boolean;
  startupBehavior: MarkdownStartupBehaviorSetting;
  theme?: MarkdownDisplayThemeSetting;
  topToolbarLayout: MarkdownToolbarLayout;
};

const initialMarkdownSettings: MarkdownSettingsFile = {
  autosave: "enabled",
  chrome: defaultLegendChromeTheme,
  contentWidth: "standard",
  density: "comfortable",
  displayTheme: "light",
  fontFamily: "system",
  fontSize: "default",
  formattingToolbarMode: "selection",
  hotkeys: { ...defaultMarkdownHotkeySettings },
  lastDocumentPath: null,
  layoutTheme: "default",
  lineHeight: "normal",
  selectionToolbarLayout: getDefaultMarkdownToolbarLayout("selection"),
  sidebarFolders: [],
  sidebarOpen: true,
  startupBehavior: "newDocument",
  topToolbarLayout: getDefaultMarkdownToolbarLayout("top"),
};

const markdownSettings$ = createObservableFile<MarkdownSettingsFile>({
  filename: "settings",
  initialValue: initialMarkdownSettings,
});

function isMarkdownThemeSetting(value: unknown): value is MarkdownDisplayThemeSetting {
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

/** Falls back to the default for a missing height, or one too short for the traffic lights or taller than a toolbar. */
function toChromeTheme(chrome: Partial<LegendChromeTheme> | undefined): LegendChromeTheme {
  const titleBarHeight = chrome?.titleBarHeight;
  return typeof titleBarHeight === "number" && titleBarHeight >= 28 && titleBarHeight <= 80 ? { titleBarHeight } : defaultLegendChromeTheme;
}

export function getMarkdownChromeTheme(): LegendChromeTheme {
  return toChromeTheme(markdownSettings$.chrome.get());
}

export function useMarkdownChromeTheme(): LegendChromeTheme {
  return toChromeTheme(useValue(markdownSettings$.chrome));
}

export function setMarkdownChromeTheme(chrome: LegendChromeTheme) {
  markdownSettings$.chrome.set(chrome);
}

export function getMarkdownDisplayThemeSetting(): MarkdownDisplayThemeSetting {
  const displayTheme = markdownSettings$.displayTheme.get();
  if (isMarkdownThemeSetting(displayTheme)) {
    return displayTheme;
  }

  const legacyTheme = markdownSettings$.theme.get();
  return isMarkdownThemeSetting(legacyTheme) ? legacyTheme : initialMarkdownSettings.displayTheme;
}

export function getMarkdownThemeSetting(): MarkdownThemeSetting {
  return getMarkdownDisplayThemeSetting();
}

export function getMarkdownLayoutThemeSetting(): MarkdownLayoutThemeSetting {
  const layoutTheme = markdownSettings$.layoutTheme.get();
  return isMarkdownThemeSetting(layoutTheme) ? layoutTheme : initialMarkdownSettings.layoutTheme;
}

export function getMarkdownStartupBehaviorSetting(): MarkdownStartupBehaviorSetting {
  const startupBehavior = markdownSettings$.startupBehavior.get();
  return isMarkdownStartupBehaviorSetting(startupBehavior) ? startupBehavior : initialMarkdownSettings.startupBehavior;
}

/** Whether folder and workspace windows open with the sidebar shown. */
export function getMarkdownSidebarOpenSetting(): boolean {
  return markdownSettings$.sidebarOpen.get() !== false;
}

export function setMarkdownSidebarOpenSetting(open: boolean) {
  markdownSettings$.sidebarOpen.set(open);
}

/** The main window's sidebar folders, restored on the next launch. */
export function getMarkdownSidebarFoldersSetting(): string[] {
  const folders: unknown = markdownSettings$.sidebarFolders.get();
  return Array.isArray(folders) ? folders.filter((folder): folder is string => typeof folder === "string") : [];
}

export function setMarkdownSidebarFoldersSetting(folders: string[]) {
  markdownSettings$.sidebarFolders.set(folders);
}

export function getMarkdownPaneLayoutSetting(): PaneLayout | undefined {
  return parsePaneLayout(markdownSettings$.paneLayout.get());
}

export function setMarkdownPaneLayoutSetting(layout: PaneLayout) {
  markdownSettings$.paneLayout.set(layout);
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

export function getMarkdownHotkeySettings(): HotkeyBindingState<MarkdownHotkeyId> {
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

export function useMarkdownDisplayThemeSetting(): MarkdownDisplayThemeSetting {
  const displayTheme = useValue(markdownSettings$.displayTheme);
  const legacyTheme = useValue(markdownSettings$.theme);
  if (isMarkdownThemeSetting(displayTheme)) {
    return displayTheme;
  }

  return isMarkdownThemeSetting(legacyTheme) ? legacyTheme : initialMarkdownSettings.displayTheme;
}

export function useMarkdownThemeSetting(): MarkdownThemeSetting {
  return useMarkdownDisplayThemeSetting();
}

export function useMarkdownLayoutThemeSetting(): MarkdownLayoutThemeSetting {
  const layoutTheme = useValue(markdownSettings$.layoutTheme);
  return isMarkdownThemeSetting(layoutTheme) ? layoutTheme : initialMarkdownSettings.layoutTheme;
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

export function useMarkdownHotkeySettings(): HotkeyBindingState<MarkdownHotkeyId> {
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

export function setMarkdownDisplayThemeSetting(displayTheme: MarkdownDisplayThemeSetting) {
  markdownSettings$.displayTheme.set(displayTheme);
  applyLegendDisplayThemeToUniwind(displayTheme);
}

export function setMarkdownThemeSetting(theme: MarkdownThemeSetting) {
  setMarkdownDisplayThemeSetting(theme);
}

export function setMarkdownLayoutThemeSetting(layoutTheme: MarkdownLayoutThemeSetting) {
  markdownSettings$.layoutTheme.set(layoutTheme);
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

export function toggleMarkdownFormattingToolbarModeSetting() {
  const currentMode = getMarkdownFormattingToolbarModeSetting();
  markdownSettings$.formattingToolbarMode.set(currentMode === "hidden" ? "selection" : "hidden");
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

export function setMarkdownHotkeySetting(id: MarkdownHotkeyId, value: readonly HotkeyValue[]) {
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
  applyLegendDisplayThemeToUniwind(getMarkdownDisplayThemeSetting());
}

export type MarkdownInstalledPlugin = { enabled: boolean; manifest: MarkdownPluginManifest };

function installedPlugins(plugins: MarkdownSettingsFile["plugins"]): MarkdownInstalledPlugin[] {
  return plugins && typeof plugins === "object" ? Object.values(plugins) : [];
}

export function getMarkdownInstalledPlugins(): MarkdownInstalledPlugin[] {
  return installedPlugins(markdownSettings$.plugins.get());
}

export function useMarkdownInstalledPlugins(): MarkdownInstalledPlugin[] {
  const plugins = useValue(markdownSettings$.plugins);
  return useMemo(() => installedPlugins(plugins), [plugins]);
}

// Plugin writes replace the whole map so hooks memoized on its reference see the change.
function setMarkdownPlugin(pluginId: string, plugin: MarkdownInstalledPlugin) {
  markdownSettings$.plugins.set({ ...markdownSettings$.plugins.peek(), [pluginId]: plugin });
}

/** Installing replaces any earlier version of the same plugin and enables it. */
export function installMarkdownPlugin(manifest: MarkdownPluginManifest) {
  setMarkdownPlugin(manifest.id, { enabled: true, manifest });
}

export function setMarkdownPluginEnabled(pluginId: string, enabled: boolean) {
  const plugin = markdownSettings$.plugins.peek()?.[pluginId];
  if (plugin) setMarkdownPlugin(pluginId, { ...plugin, enabled });
}

export function applyMarkdownPreset(preset: MarkdownPreset) {
  if (preset.formattingToolbarMode) setMarkdownFormattingToolbarModeSetting(preset.formattingToolbarMode);
  if (preset.toolbar) markdownSettings$.pluginToolbar.set({ top: preset.toolbar.top });
  if (preset.rules) markdownSettings$.pluginRuleOverrides.set(preset.rules);
}

export type ResolvedMarkdownPluginCommand = MarkdownPluginCommand & { rules: MarkdownPluginRule[] };

function resolvePluginCommand(
  commandId: string,
  plugins: MarkdownSettingsFile["plugins"],
  overrides: MarkdownSettingsFile["pluginRuleOverrides"],
): ResolvedMarkdownPluginCommand | undefined {
  for (const { enabled, manifest } of installedPlugins(plugins)) {
    const command = enabled ? manifest.commands.find((candidate) => candidate.id === commandId) : undefined;
    if (command) return { ...command, rules: resolveMarkdownPluginRules(manifest, overrides ?? {}) };
  }
  return undefined;
}

/** Resolves an enabled plugin's command at dispatch time, so disabling a plugin takes effect immediately. */
export function getMarkdownPluginCommand(commandId: string): ResolvedMarkdownPluginCommand | undefined {
  return resolvePluginCommand(commandId, markdownSettings$.plugins.get(), markdownSettings$.pluginRuleOverrides.get());
}

export function useMarkdownPluginToolbarCommands(layoutId: MarkdownToolbarLayoutId): ResolvedMarkdownPluginCommand[] {
  const toolbar = useValue(markdownSettings$.pluginToolbar);
  const plugins = useValue(markdownSettings$.plugins);
  const overrides = useValue(markdownSettings$.pluginRuleOverrides);
  return useMemo(() => {
    const ids = layoutId === "top" && Array.isArray(toolbar?.top) ? toolbar.top : [];
    return ids.flatMap((id) => resolvePluginCommand(id, plugins, overrides) ?? []);
  }, [layoutId, overrides, plugins, toolbar]);
}
