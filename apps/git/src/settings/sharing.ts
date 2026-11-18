import { mergeSettings } from "./merge";
import type { GitSettingsStore, LayerId } from "./store";
import type { SettingsDocument } from "./migrations";
import { migrateSettings } from "./migrations";
import { isPresetId, presetView, settingsPart } from "./presets";
import { defaultPreset, schemaUrl, settingsVersion } from "./schema";
import { isPlainObject, validateSettingsFile, type SettingsIssue } from "./validate";

/** What Export… writes (spec §8): everything, or one area. */
export const exportParts = ["everything", "layout", "theme", "actions"] as const;
export type ExportPart = (typeof exportParts)[number];
export const exportPartTitles: Record<ExportPart, string> = {
  everything: "Everything",
  layout: "Layout and Panels",
  theme: "Theme and Density",
  actions: "Toolbar, Menus and Keys",
};

/** The settings keys each area covers; `everything` is every key the schema knows. */
export const areaKeys: Record<Exclude<ExportPart, "everything">, readonly string[]> = {
  layout: ["layout", "panels", "sidebar"],
  theme: ["theme", "appearance", "density"],
  actions: ["toolbar", "contextMenus", "keybindings"],
};

export const areaOf = (key: string): Exclude<ExportPart, "everything"> | null =>
  (Object.keys(areaKeys) as (keyof typeof areaKeys)[]).find(area => areaKeys[area].includes(key)) ?? null;

/**
 * A settings layer as a shareable file. Only keys the schema knows and that validate are kept, so unknown keys,
 * invalid leaves and the repository layer's `root` never leave the machine; window state, recents and tokens live in
 * other files and never reach a settings layer.
 */
export function exportSettings(layer: SettingsDocument | null, part: ExportPart, about: { name?: string; description?: string } = {}): SettingsDocument {
  const { value } = validateSettingsFile({ ...layer ?? {}, version: settingsVersion }, { file: "export" });
  const settings = settingsPart(value);
  const kept = part === "everything" ? settings : Object.fromEntries(Object.entries(settings).filter(([key]) => areaKeys[part].includes(key)));
  return {
    $schema: schemaUrl,
    version: settingsVersion,
    ...about.name ? { name: about.name } : {},
    ...about.description ? { description: about.description } : {},
    ...part === "everything" && isPresetId(value.extends) ? { extends: value.extends } : {},
    ...kept,
  };
}

export type ImportCheck = {
  /** The file's valid known keys only (what Replace and Apply on Top use). */
  file: SettingsDocument;
  name?: string;
  author?: string;
  description?: string;
  /** Changed keys grouped by area (`preset` when it sets `extends`). */
  changes: { area: string; keys: string[] }[];
  issues: SettingsIssue[];
  /** A JSON or version error: nothing can be imported. */
  error?: string;
};

/** Reads a file to import: parses, migrates and validates it leaf by leaf, and lists what it changes. */
export function checkImport(text: string, fileName = "import"): ImportCheck {
  let parsed: unknown;
  try { parsed = JSON.parse(text); }
  catch (error) { return { file: {}, changes: [], issues: [], error: `Not a JSON file: ${error instanceof Error ? error.message : String(error)}` }; }
  if (!isPlainObject(parsed)) return { file: {}, changes: [], issues: [], error: "A settings file is a JSON object." };
  const migrated = migrateSettings(parsed);
  if (migrated.error) return { file: {}, changes: [], issues: [], error: migrated.error };
  const base = isPresetId(parsed.extends) ? parsed.extends : defaultPreset;
  const result = validateSettingsFile(migrated.file, { file: fileName, fallbackView: kind => presetView(base, kind) });
  if (result.readOnly) return { file: {}, changes: [], issues: result.issues, error: `${fileName} was written by a newer Legend Git.` };
  const { root: _root, ...value } = result.value;
  const groups = new Map<string, string[]>();
  if (isPresetId(value.extends)) groups.set("preset", ["extends"]);
  for (const key of Object.keys(settingsPart(value))) {
    const area = areaOf(key) ?? "other";
    groups.set(area, [...groups.get(area) ?? [], key]);
  }
  return {
    file: { ...value, version: settingsVersion },
    name: typeof value.name === "string" ? value.name : undefined,
    author: typeof value.author === "string" ? value.author : undefined,
    description: typeof value.description === "string" ? value.description : undefined,
    changes: [...groups].map(([area, keys]) => ({ area, keys })),
    issues: result.issues,
  };
}

export type ImportMode = "replace" | "onTop";

/**
 * The layer file after an import. Replace drops the layer's settings for the imported ones; Apply on Top merges them
 * in by the settings merge rules (objects key by key, arrays and layout nodes whole). The layer's own `root` and its
 * unknown keys survive Apply on Top; Replace keeps only `root`. The file's name and notes are not copied.
 */
export function applyImport(current: SettingsDocument | null, imported: SettingsDocument, mode: ImportMode): SettingsDocument {
  const { $schema: _s, version: _v, name: _n, description: _d, author: _a, root: _r, ...incoming } = imported;
  const header = { $schema: schemaUrl, version: settingsVersion, ...typeof current?.root === "string" ? { root: current.root } : {} };
  if (mode === "replace") return { ...header, ...incoming };
  const { $schema: _cs, version: _cv, root: _cr, ...rest } = current ?? {};
  return { ...header, ...mergeSettings(rest, incoming) as SettingsDocument };
}

export type ImportUndo = { layer: LayerId; text: string | undefined };

/** Backs up the layer (`<file>.bak`), writes the imported settings, and returns what Undo Import restores. */
export async function importSettings(store: Pick<GitSettingsStore, "layerFile" | "backup" | "replace">, layer: LayerId, imported: SettingsDocument, mode: ImportMode): Promise<ImportUndo> {
  const { file, text } = store.layerFile(layer);
  await store.backup(layer);
  await store.replace(layer, applyImport(file, imported, mode));
  return { layer, text };
}

export const undoImport = (store: Pick<GitSettingsStore, "restore">, undo: ImportUndo) => store.restore(undo.layer, undo.text);
