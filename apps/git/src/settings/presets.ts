import { defaultSettings } from "./defaults";
import { mergeSettings } from "./merge";
import { defaultPreset, fileOnlyKeys, presetIds, viewKinds, type GitSettings, type LayoutNode, type PresetId } from "./schema";
import { validateSettingsFile, type SettingsIssue } from "./validate";
import sourcetree from "./presets/sourcetree.json";
import fork from "./presets/fork.json";
import gitkraken from "./presets/gitkraken.json";

/** Layer 1: the preset files as written, validated by the same rules as user files. */
export const presetFiles: Record<PresetId, Record<string, unknown>> = { sourcetree, fork, gitkraken };

export const isPresetId = (value: unknown): value is PresetId => typeof value === "string" && (presetIds as readonly string[]).includes(value);

/** A preset and the presets it extends, base first. */
export function presetChain(id: PresetId): PresetId[] {
  const chain: PresetId[] = [];
  for (let current: PresetId | undefined = id; current && !chain.includes(current); current = presetFiles[current].extends as PresetId | undefined) chain.unshift(current);
  return chain;
}

/** Drops the keys that describe a file (version, name, extends…) so what remains merges onto settings. */
export function settingsPart(file: Record<string, unknown>) {
  const rest = { ...file };
  for (const key of fileOnlyKeys) delete rest[key];
  return rest;
}

const validated = new Map<PresetId, { value: Record<string, unknown>; issues: SettingsIssue[] }>();
export function validatedPreset(id: PresetId) {
  let entry = validated.get(id);
  if (!entry) {
    entry = validateSettingsFile(presetFiles[id], { file: `presets/${id}.json` });
    validated.set(id, entry);
  }
  return entry;
}

const presetSettingsCache = new Map<PresetId, GitSettings>();
/** Defaults with a preset (and what it extends) applied: layers 0 and 1. */
export function presetSettings(id: PresetId): GitSettings {
  let settings = presetSettingsCache.get(id);
  if (!settings) {
    settings = presetChain(id).reduce((current, preset) => mergeSettings(current, settingsPart(validatedPreset(preset).value)), defaultSettings);
    presetSettingsCache.set(id, settings);
  }
  return settings;
}

type LayoutDefinition = GitSettings["layout"]["layouts"][string];

/** The layout a preset activates. */
export function presetLayout(id: PresetId): LayoutDefinition {
  const settings = presetSettings(id);
  return settings.layout.layouts[settings.layout.active]!;
}

/** The base preset's tree for a view kind, or its default view. */
export function presetView(id: PresetId, kind: string): LayoutNode {
  const { views } = presetLayout(id);
  return (kind !== "default" && (views as Record<string, LayoutNode | null | undefined>)[kind]) || views.default;
}

/**
 * The layout settings activate: `layout.active` names a layout in `layouts` or a preset; anything else, or a layout
 * without a usable default view, gives the base preset's layout.
 */
export function activeLayout(settings: GitSettings, base: PresetId = defaultPreset): LayoutDefinition {
  const { active, layouts } = settings.layout;
  const named = Object.hasOwn(layouts, active) ? layouts[active] : isPresetId(active) ? presetLayout(active) : undefined;
  return named?.views?.default ? named : presetLayout(base);
}

/** The tree for one kind of sidebar selection: its own, else the layout's default. */
export function viewFor(layout: LayoutDefinition, kind: (typeof viewKinds)[number]): LayoutNode {
  return layout.views[kind] ?? layout.views.default;
}
