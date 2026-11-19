import { observable, type Observable } from "@legendapp/state";
import { deepEqual, mergeSettings, shareStructure } from "./merge";
import { migrateSettings, type SettingsDocument } from "./migrations";
import { isPresetId, presetSettings, presetView, settingsPart } from "./presets";
import { defaultPreset, schemaUrl, settingsVersion, type GitSettings, type PresetId } from "./schema";
import { sha1 } from "./sha1";
import { isPlainObject, validateSettingsFile, type SettingsIssue } from "./validate";

/** File access the store needs; the app uses Spark's file system, tests an in-memory one. */
export type SettingsIO = {
  /** undefined when the file does not exist. */
  read(path: string): Promise<string | undefined>;
  write(path: string, text: string): Promise<void>;
  mkdir(path: string): Promise<void>;
  /** Calls `listener` after something inside `directory` changes (the path it passes is not relied on). */
  watch(directory: string, listener: (path: string) => void): Promise<{ remove(): unknown }>;
};

export type LayerId = "user" | "repo";

type Layer = {
  path: string;
  /** The text last read or written; a watcher event with the same text is our own write's echo. */
  text: string | undefined;
  /** The parsed, migrated file with its unknown keys; null when missing or unreadable. */
  file: SettingsDocument | null;
  /** The version on disk, before migration. */
  diskVersion: number | null;
  value: Record<string, unknown>;
  issues: SettingsIssue[];
  /** A newer app's file, or one with a JSON syntax error: never written. */
  readOnly: boolean;
  parseIssue: SettingsIssue | null;
  /** An unsaved file shown in place of `file` (Customize with AI's preview); edits go into it until it is kept or reverted. */
  preview: SettingsDocument | null;
};

/** Line and column for a JSON.parse failure, from the engine's message (V8 and Hermes word it differently). */
export function jsonErrorMessage(text: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const lineColumn = /line (\d+) column (\d+)/i.exec(message);
  if (lineColumn) return `JSON syntax error at line ${lineColumn[1]}, column ${lineColumn[2]}: ${message}`;
  const position = /position (\d+)/i.exec(message) ?? /character (\d+)/i.exec(message);
  if (position) {
    const before = text.slice(0, Number(position[1]));
    const line = before.split("\n").length;
    return `JSON syntax error at line ${line}, column ${before.length - before.lastIndexOf("\n")}: ${message}`;
  }
  return `JSON syntax error: ${message}`;
}

export const valueAt = (root: unknown, path: readonly string[]) => path.reduce<unknown>((current, key) => isPlainObject(current) ? current[key] : undefined, root);

/** Sets `path` in place, keeping existing key order; missing or non-object parents become objects. */
function setAt(root: SettingsDocument, path: readonly string[], value: unknown) {
  let current = root;
  for (const key of path.slice(0, -1)) {
    if (!isPlainObject(current[key])) current[key] = {};
    current = current[key] as SettingsDocument;
  }
  current[path.at(-1)!] = value;
}

/** Removes `path`, then any parent objects it leaves empty. */
function deleteAt(root: SettingsDocument, path: readonly string[]) {
  const parents: SettingsDocument[] = [root];
  for (const key of path.slice(0, -1)) {
    const next = parents.at(-1)![key];
    if (!isPlainObject(next)) return;
    parents.push(next);
  }
  delete parents.at(-1)![path.at(-1)!];
  for (let index = parents.length - 1; index > 0 && Object.keys(parents[index]!).length === 0; index--) delete parents[index - 1]![path[index - 1]!];
}

/**
 * A layer edit as the file it leaves (spec §3.3 Writes): sets `path` to `value`, or removes it when it equals the layer
 * below (`below`), so a file holds only what differs. Unknown keys and key order survive.
 */
export function applySparseEdit(file: SettingsDocument, path: readonly string[], value: unknown, below: unknown): SettingsDocument {
  const next = JSON.parse(JSON.stringify(file)) as SettingsDocument;
  if (value === undefined || deepEqual(value, valueAt(below, path))) deleteAt(next, path);
  else setAt(next, path, JSON.parse(JSON.stringify(value)));
  return next;
}

export const formatSettingsFile = (file: SettingsDocument) => `${JSON.stringify(file, null, 2)}\n`;

export type LayerState = { file: SettingsDocument | null; exists: boolean; previewing: boolean; readOnly: boolean };

export type GitSettingsStore = {
  /** Effective settings: defaults ⊕ preset ⊕ user ⊕ repository. Unchanged subtrees keep their identity. */
  settings$: Observable<GitSettings>;
  /** Every layer's issues, user first. */
  issues$: Observable<SettingsIssue[]>;
  /** The base preset: `extends` of the highest layer that sets it. */
  base$: Observable<PresetId>;
  /** Each layer as the window uses it, for rendering (`layerFile` is the same, read once). Null: no such layer. */
  layers$: Observable<Record<LayerId, LayerState | null>>;
  paths: { user: string; repo: string | null };
  /** Resolves once both layers are read and watched. */
  ready: Promise<void>;
  /** Writes one key of a layer (undefined resets it to the layer below). Refuses read-only and unparseable layers. */
  edit(layer: LayerId, path: readonly string[], value: unknown): Promise<void>;
  /** Copies a layer's file to `<file>.bak` (before an import replaces it). */
  backup(layer: LayerId): Promise<void>;
  /** Writes a whole layer file (an import); refuses a newer version's file. A file with a JSON error may be replaced. */
  replace(layer: LayerId, file: SettingsDocument): Promise<void>;
  /** Writes a layer's text back as it was (Undo Import); undefined writes an empty file. */
  restore(layer: LayerId, text: string | undefined): Promise<void>;
  /** Shows `file` in place of the layer without writing it; null ends the preview. */
  preview(layer: LayerId, file: SettingsDocument | null): void;
  /** The layer's file as the window uses it (the preview while there is one), and its text on disk. */
  layerFile(layer: LayerId): { file: SettingsDocument | null; text: string | undefined; previewing: boolean };
  hasLayer(layer: LayerId): boolean;
  /** Re-reads a layer from disk; false when its text is what the store last read or wrote. */
  reload(layer: LayerId): Promise<boolean>;
  isReadOnly(layer: LayerId): boolean;
  close(): Promise<void>;
};

/**
 * The settings layers for one window: `<directory>/settings.json` (user) and, with a repository,
 * `<directory>/repositories/<sha1 of root>.json` (spec D2: never a file inside the repository).
 */
export function createGitSettingsStore({ io, directory, repositoryRoot = null }: { io: SettingsIO; directory: string; repositoryRoot?: string | null }): GitSettingsStore {
  const paths = { user: `${directory}/settings.json`, repo: repositoryRoot ? `${directory}/repositories/${sha1(repositoryRoot)}.json` : null };
  const emptyLayer = (path: string): Layer => ({ path, text: undefined, file: null, diskVersion: null, value: {}, issues: [], readOnly: false, parseIssue: null, preview: null });
  const layers: Record<LayerId, Layer | null> = { user: emptyLayer(paths.user), repo: paths.repo ? emptyLayer(paths.repo) : null };
  const order: LayerId[] = ["user", "repo"];
  const settings$ = observable<GitSettings>(presetSettings(defaultPreset));
  const issues$ = observable<SettingsIssue[]>([]);
  const base$ = observable<PresetId>(defaultPreset);
  const layerState = (layer: Layer | null): LayerState | null => layer && { file: layer.preview ?? layer.file, exists: layer.text !== undefined, previewing: !!layer.preview, readOnly: layer.readOnly };
  const layers$ = observable<Record<LayerId, LayerState | null>>({ user: layerState(layers.user), repo: layerState(layers.repo) });
  const watchers: { remove(): unknown }[] = [];
  let closed = false;
  let queue: Promise<unknown> = Promise.resolve();
  const serial = <T>(task: () => Promise<T>) => {
    const next = queue.then(task, task);
    queue = next.catch(() => {});
    return next;
  };

  function parse(layer: Layer, text: string | undefined) {
    layer.text = text;
    layer.parseIssue = null;
    layer.file = null;
    layer.diskVersion = null;
    if (text === undefined) return;
    try {
      const parsed = JSON.parse(text) as unknown;
      if (!isPlainObject(parsed)) throw new Error("expected a JSON object");
      const migrated = migrateSettings(parsed);
      layer.diskVersion = typeof parsed.version === "number" ? parsed.version : null;
      layer.file = migrated.file;
      if (migrated.error) layer.parseIssue = { file: layer.path, path: "version", level: "error", message: `${migrated.error}; the file is skipped` };
    } catch (error) {
      layer.parseIssue = { file: layer.path, path: "", level: "error", message: `${jsonErrorMessage(text, error)}; the file is skipped and left untouched` };
    }
  }

  function recompute() {
    const present = order.map(id => layers[id]).filter((layer): layer is Layer => !!layer);
    const extending = [...present].reverse().map(layer => layer.preview ? layer.preview.extends : layer.parseIssue ? undefined : layer.file?.extends).find(isPresetId);
    const base = extending ?? defaultPreset;
    let effective = presetSettings(base);
    const issues: SettingsIssue[] = [];
    for (const layer of present) {
      if (layer.preview) {
        const result = validateSettingsFile(layer.preview, { file: layer.path, fallbackView: kind => presetView(base, kind) });
        layer.value = result.value;
        layer.issues = result.issues;
        effective = mergeSettings(effective, settingsPart(result.value));
      } else if (layer.parseIssue || !layer.file) {
        layer.value = {};
        layer.issues = layer.parseIssue ? [layer.parseIssue] : [];
        layer.readOnly = !!layer.parseIssue;
      } else {
        const result = validateSettingsFile(layer.file, { file: layer.path, fallbackView: kind => presetView(base, kind) });
        layer.value = result.value;
        layer.issues = result.issues;
        layer.readOnly = result.readOnly;
        effective = mergeSettings(effective, settingsPart(result.value));
      }
      issues.push(...layer.issues);
    }
    base$.set(base);
    layers$.set(shareStructure(layers$.peek(), { user: layerState(layers.user), repo: layerState(layers.repo) }));
    settings$.set(shareStructure(settings$.peek(), effective));
    if (!deepEqual(issues$.peek(), issues)) issues$.set(issues);
  }

  /** The effective settings without `layer` and the layers above it. */
  function below(id: LayerId) {
    let effective = presetSettings(base$.peek());
    for (const other of order) {
      if (other === id) break;
      const layer = layers[other];
      if (layer) effective = mergeSettings(effective, settingsPart(layer.value));
    }
    return effective;
  }

  const layerOf = (id: LayerId) => {
    const layer = layers[id];
    if (!layer) throw new Error("This window has no repository settings layer.");
    return layer;
  };

  async function readLayer(id: LayerId) {
    const layer = layers[id];
    if (!layer) return false;
    const text = await io.read(layer.path);
    if (text === layer.text) return false;
    parse(layer, text);
    return true;
  }

  const ready = (async () => {
    await io.mkdir(directory);
    if (paths.repo) await io.mkdir(`${directory}/repositories`);
    await Promise.all(order.map(readLayer));
    recompute();
    // Spark's watcher is an invalidation (it reports the watched folder, not the file), so re-read that folder's layers;
    // a layer whose text did not change, such as our own write's echo, stays as it is.
    const watchFolder = async (folder: string) => {
      const ids = order.filter(id => layers[id]?.path.slice(0, layers[id]!.path.lastIndexOf("/")) === folder);
      watchers.push(await io.watch(folder, () => {
        if (!closed) for (const id of ids) void serial(() => reloadLayer(id)).catch(console.error);
      }));
    };
    await watchFolder(directory);
    if (paths.repo) await watchFolder(`${directory}/repositories`);
  })();

  async function write(layer: Layer, text: string) {
    if (text === layer.text) { recompute(); return; }
    parse(layer, text);
    recompute();
    await io.write(layer.path, text);
  }

  async function reloadLayer(id: LayerId) {
    const changed = await readLayer(id);
    if (changed) recompute();
    return changed;
  }

  return {
    settings$, issues$, base$, layers$, paths, ready,
    isReadOnly: id => !!layers[id]?.readOnly,
    reload: id => ready.then(() => serial(() => reloadLayer(id))),
    edit: (id, path, value) => ready.then(() => serial(async () => {
      const layer = layerOf(id);
      if (layer.preview) {
        layer.preview = applySparseEdit(layer.preview, path, value, below(id));
        recompute();
        return;
      }
      if (layer.readOnly) throw new Error(layer.parseIssue ? `${layer.path} has an error (${layer.parseIssue.message}); fix the file first` : `${layer.path} was written by a newer Legend Git; it is read-only`);
      const start: SettingsDocument = layer.file ?? { $schema: schemaUrl, version: settingsVersion, ...id === "repo" ? { root: repositoryRoot } : {} };
      const file = applySparseEdit(start, path, value, below(id));
      // A new file holding nothing but its own bookkeeping is not written; `extends` (the preset) is a choice and is.
      if (!layer.file && Object.keys(file).every(key => key === "$schema" || key === "version" || key === "root")) return;
      // A migrated file is written at the current version, after a backup the older app can still read.
      if (layer.diskVersion !== null && layer.diskVersion < settingsVersion && layer.text !== undefined) await io.write(`${layer.path}.bak`, layer.text);
      file.version = settingsVersion;
      await write(layer, formatSettingsFile(file));
    })),
    replace: (id, file) => ready.then(() => serial(async () => {
      const layer = layerOf(id);
      if (layer.diskVersion !== null && layer.diskVersion > settingsVersion) throw new Error(`${layer.path} was written by a newer Legend Git; it is read-only`);
      layer.preview = null;
      await write(layer, formatSettingsFile({ ...file, version: settingsVersion, ...id === "repo" ? { root: repositoryRoot } : {} }));
    })),
    restore: (id, text) => ready.then(() => serial(async () => {
      const layer = layerOf(id);
      layer.preview = null;
      await write(layer, text ?? formatSettingsFile({ $schema: schemaUrl, version: settingsVersion, ...id === "repo" ? { root: repositoryRoot } : {} }));
    })),
    preview(id, file) {
      const layer = layerOf(id);
      layer.preview = file && JSON.parse(JSON.stringify(file)) as SettingsDocument;
      recompute();
    },
    layerFile(id) {
      const layer = layerOf(id);
      return { file: layer.preview ?? layer.file, text: layer.text, previewing: !!layer.preview };
    },
    hasLayer: id => !!layers[id],
    backup: id => ready.then(() => serial(async () => {
      const layer = layerOf(id);
      if (layer.text !== undefined) await io.write(`${layer.path}.bak`, layer.text);
    })),
    async close() {
      closed = true;
      await ready.catch(() => {});
      await Promise.all(watchers.splice(0).map(watcher => watcher.remove()));
    },
  };
}

/**
 * Settings ▸ Preset: `extends` in the layer, and a `layout.active` there that names a preset (View ▸ Layout) is dropped,
 * so the window shows the chosen preset's layout. A saved layout of the user's stays active.
 */
export async function choosePreset(store: Pick<GitSettingsStore, "edit" | "layerFile">, layer: LayerId, id: PresetId) {
  await store.edit(layer, ["extends"], id);
  if (isPresetId(valueAt(store.layerFile(layer).file, ["layout", "active"]))) await store.edit(layer, ["layout", "active"], undefined);
}

/** Spark's file system, required on first use so code that never reads settings doesn't load the native module. */
export function sparkSettingsIO(): SettingsIO {
  const files = () => require("@legendapp/spark/files") as typeof import("@legendapp/spark/files");
  return {
    async read(path) {
      try { return await files().readText(path); }
      catch (error) { if ((error as { code?: string }).code === "E_NOT_FOUND") return undefined; throw error; }
    },
    write: (path, text) => files().writeText(path, text),
    mkdir: path => files().mkdir(path, { recursive: true }),
    // Recursive: Spark's plain directory watch is a vnode source that only sees entries added, removed or renamed, so it
    // misses a file rewritten in place (`>` in a shell, many editors); the recursive one uses FSEvents file events.
    watch: (directory, listener) => files().watch(directory, listener, { recursive: true }),
  };
}

/** The store for a window, reading `~/Library/Application Support/<bundle id>/` (Spark's data directory). */
export async function openGitSettings(repositoryRoot: string | null, io: SettingsIO = sparkSettingsIO()) {
  const files = require("@legendapp/spark/files") as typeof import("@legendapp/spark/files");
  return createGitSettingsStore({ io, directory: await files.getDirectory("data"), repositoryRoot });
}

const shared = new Map<string, { store: Promise<GitSettingsStore>; users: number }>();

/**
 * One store per repository for every window of the app (repository windows and the Settings window share it, so an AI
 * preview shows in the window it was made for). Each `acquire` is paired with one `release`; the last closes it.
 */
export function acquireGitSettings(repositoryRoot: string | null, open: (root: string | null) => Promise<GitSettingsStore> = openGitSettings) {
  const key = repositoryRoot ?? "";
  let entry = shared.get(key);
  if (!entry) shared.set(key, entry = { store: open(repositoryRoot), users: 0 });
  entry.users += 1;
  const current = entry;
  current.store.catch(() => { if (shared.get(key) === current) shared.delete(key); });
  let released = false;
  return {
    store: current.store,
    release() {
      if (released) return;
      released = true;
      current.users -= 1;
      if (current.users > 0 || shared.get(key) !== current) return;
      shared.delete(key);
      void current.store.then(store => store.close(), () => {});
    },
  };
}
