import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useColorScheme } from "react-native";
import { observable, type Observable } from "@legendapp/state";
import { useValue } from "@legendapp/state/react";
import { mergeSettings } from "./merge";
import { presetSettings } from "./presets";
import { defaultPreset, type Density, type GitSettings, type PanelId, type PanelOptions } from "./schema";
import type { GitSettingsStore } from "./store";
import { codeFontFamily, resolveColor, type Appearance, type ResolvedTheme } from "./theme";

/**
 * The window's effective settings as one observable (spec §7 item 1). Components subscribe to the narrowest path they
 * draw from (`settings$.panels.diff`, `settings$.theme`), so a change to one panel's options never renders another.
 * Settings are never passed down as props.
 */
export type SettingsContextValue = { settings$: Observable<GitSettings>; store: GitSettingsStore | null };
const fallback: SettingsContextValue = { settings$: observable(presetSettings(defaultPreset)), store: null };
export const SettingsContext = createContext<SettingsContextValue>(fallback);
export const useSettings = () => useContext(SettingsContext);

/** The layout pane a component renders in: its panel and per-instance `options` (LayoutHost provides it). */
export type PanelInstance = { id: string; panel: PanelId; options?: Record<string, unknown> };
export const PanelInstanceContext = createContext<PanelInstance | null>(null);

export function PanelInstanceProvider({ instance, children }: { instance: PanelInstance; children: ReactNode }) {
  const { id, panel, options } = instance;
  // Keyed by content, so an unchanged pane's consumers don't render when the layout is rebuilt.
  const value = useMemo(() => instance, [id, panel, options]); // eslint-disable-line react-hooks/exhaustive-deps -- the fields are the identity
  return <PanelInstanceContext.Provider value={value}>{children}</PanelInstanceContext.Provider>;
}

/**
 * The effective options of `panel` for the pane this component renders in. The file lists share one component, so
 * a list in a `changes` pane (or any file-list pane) reads that pane's panel; `panel` is the one used otherwise.
 */
export function usePanelOptions<P extends PanelId>(panel: P, accepts: readonly PanelId[] = [panel]): PanelOptions[P] {
  const { settings$ } = useSettings();
  const instance = useContext(PanelInstanceContext);
  const own = instance && accepts.includes(instance.panel) ? instance : null;
  const key = (own?.panel ?? panel) as P;
  const base = useValue(settings$.panels[key] as unknown as Observable<PanelOptions[P]>);
  const overrides = own?.options;
  // The layout node's options on top: objects merge key by key, arrays replace.
  return useMemo(() => overrides ? mergeSettings(base, overrides) : base, [base, overrides]);
}

/** A panel's density: its own, else the global one. */
export function useDensity(own: Density | undefined): Density {
  const global = useValue(useSettings().settings$.density);
  return own ?? global;
}

/** The appearance the window draws in: the setting's light or dark, else macOS's. */
export function useAppearance(): Appearance {
  const setting = useValue(useSettings().settings$.appearance);
  const system = useColorScheme() === "dark" ? "dark" : "light";
  return setting === "light" || setting === "dark" ? setting : system;
}

type TokenKey = "status" | "diff" | "lanes" | "refs";
/**
 * One group of theme tokens, resolved to hex for the current appearance. Lists subscribe to only the group they draw
 * (the graph to `lanes`, file rows to `status`), so editing the diff colors renders no list row.
 */
export function useThemeTokens<K extends TokenKey>(key: K): ResolvedTheme[K] {
  const appearance = useAppearance();
  const { settings$ } = useSettings();
  const raw = useValue(settings$.theme[appearance][key] as unknown as Observable<GitSettings["theme"]["light"][K]>);
  return useMemo(() => {
    if (Array.isArray(raw)) return Object.freeze(raw.map(color => resolveColor(color, appearance))) as ResolvedTheme[K];
    return Object.freeze(Object.fromEntries(Object.entries(raw).map(([name, color]) => [name, resolveColor(color as string, appearance)]))) as ResolvedTheme[K];
  }, [raw, appearance]);
}

/** The code font family (React Native's name for it) and size. */
export function useCodeFont() {
  const fonts = useValue(useSettings().settings$.theme.fonts);
  return useMemo(() => ({ family: codeFontFamily(fonts.code), size: fonts.codeSize }), [fonts]);
}
