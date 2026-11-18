import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { commandIds, commandMeta, resolveCommandId } from "../commandMeta";
import { commands } from "../commands";
import { defaultSettings } from "../settings/defaults";
import { buildSettingsJsonSchema, formatJsonSchema, schemaFileName } from "../settings/jsonSchema";
import { deepEqual, mergeSettings, shareStructure } from "../settings/merge";
import { migrateSettings, migrations, type Migrations } from "../settings/migrations";
import { activeLayout, presetFiles, presetLayout, presetSettings, presetView, validatedPreset, viewFor } from "../settings/presets";
import { presetIds, viewKinds, type LayoutNode } from "../settings/schema";
import { sha1 } from "../settings/sha1";
import { applySparseEdit, createGitSettingsStore, type SettingsIO } from "../settings/store";
import { layoutProblem, validateSettingsFile } from "../settings/validate";

jest.mock("@legend-apps/diff-parser", () => ({}));

const dir = "/support";
const userPath = `${dir}/settings.json`;
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const flush = () => new Promise(resolve => setTimeout(resolve, 0));

/** Files in memory; a watcher hears every write, ours and "external" ones, and names only its folder, like Spark's. */
function memoryIO(initial: Record<string, string> = {}) {
  const files = new Map(Object.entries(initial));
  const watchers = new Set<{ directory: string; listener: (path: string) => void }>();
  const writes: string[] = [];
  const emit = (path: string) => {
    for (const { directory, listener } of watchers) if (path.slice(0, path.lastIndexOf("/")) === directory) setTimeout(() => listener(directory), 0);
  };
  const io: SettingsIO = {
    read: async path => files.get(path),
    write: async (path, text) => { files.set(path, text); writes.push(path); emit(path); },
    mkdir: async () => {},
    watch: async (directory, listener) => {
      const entry = { directory, listener };
      watchers.add(entry);
      return { remove: () => watchers.delete(entry) };
    },
  };
  return { io, files, writes, external(path: string, text: string) { files.set(path, text); emit(path); } };
}

describe("merge", () => {
  it("merges objects key by key, replaces arrays and layout nodes whole, and inherits omitted keys", () => {
    const base = { a: { b: 1, c: 2 }, list: [1, 2, 3], node: { type: "split", direction: "row", children: [1, 2] } };
    const merged = mergeSettings(base, { a: { c: 3 }, list: [9], node: { type: "panel", panel: "diff" } });
    expect(merged).toEqual({ a: { b: 1, c: 3 }, list: [9], node: { type: "panel", panel: "diff" } });
    expect(mergeSettings(base, { a: undefined })).toEqual(base);
  });

  it("keeps the identity of unchanged subtrees", () => {
    const previous = { theme: { light: { accent: "#000000" } }, panels: { diff: { mode: "unified" } } };
    const next = shareStructure(previous, { theme: { light: { accent: "#FFFFFF" } }, panels: { diff: { mode: "unified" } } });
    expect(next.panels).toBe(previous.panels);
    expect(next.theme).not.toBe(previous.theme);
    expect(shareStructure(previous, JSON.parse(JSON.stringify(previous)))).toBe(previous);
  });
});

describe("validation", () => {
  it("ignores an invalid leaf, so the layer below wins, and records the issue", async () => {
    const memory = memoryIO({ [userPath]: json({ version: 1, panels: { diff: { mode: "sideways", wrap: true } } }) });
    const store = createGitSettingsStore({ io: memory.io, directory: dir });
    await store.ready;
    expect(store.settings$.panels.diff.mode.peek()).toBe("unified");
    expect(store.settings$.panels.diff.wrap.peek()).toBe(true);
    expect(store.issues$.peek()).toEqual([expect.objectContaining({ file: userPath, path: "panels.diff.mode", level: "error" })]);
  });

  it("reports unknown keys at info level and leaves them out of the effective settings", () => {
    const { value, issues } = validateSettingsFile({ version: 1, futureKey: 1, panels: { diff: { futureOption: true } } }, { file: "f" });
    expect(value).toEqual({ panels: { diff: {} } });
    expect(issues.map(issue => [issue.path, issue.level])).toEqual([["futureKey", "info"], ["panels.diff.futureOption", "info"]]);
  });

  it("warns about unknown command ids in toolbars, menus and bindings but keeps them", () => {
    const { value, issues } = validateSettingsFile({
      version: 1, toolbar: { items: ["fetch", "space", "no-such", { command: "gone" }] },
      contextMenus: { commit: ["copy-sha", "separator", { submenu: "More", items: ["nope"] }] }, keybindings: { "fake-command": ["Cmd+k"] },
    }, { file: "f" });
    expect((value.toolbar as { items: unknown[] }).items).toHaveLength(4);
    expect(issues.map(issue => issue.path)).toEqual(["toolbar.items.2", "toolbar.items.3", "contextMenus.commit.2.items.0", "keybindings.fake-command"]);
    expect(issues.every(issue => issue.level === "warning")).toBe(true);
  });

  const diff: LayoutNode = { type: "panel", panel: "diff" };
  it("checks layout rules a schema cannot express", () => {
    expect(layoutProblem({ type: "split", direction: "row", children: [{ node: { type: "panel", panel: "commitList" } }, { node: diff }] })).toBeNull();
    expect(layoutProblem({ type: "panel", panel: "commitList" })).toBe("no diff panel in this view");
    expect(layoutProblem({ type: "split", direction: "row", children: [{ node: diff }, { node: diff }] })).toMatch(/appears twice/);
    expect(layoutProblem({ type: "split", direction: "row", children: [{ node: diff }, { node: { type: "panel", panel: "diff", id: "second" } }] })).toBeNull();
    expect(layoutProblem({ type: "split", direction: "row", children: [{ node: diff, minSize: 600 }, { node: { type: "panel", panel: "fileList" }, minSize: 400 }] })).toMatch(/1000 pt of width/);
    expect(layoutProblem({ type: "split", direction: "row", children: [{ node: diff }, { node: { type: "panel", panel: "fileList", options: { style: "spiral" } } }] })).toMatch(/children\.1\.node\.options: style/);
    // A switch shows one branch at a time, so a panel may appear in each branch.
    expect(layoutProblem({ type: "switch", cases: [{ when: "fileSelected", node: diff }], otherwise: { type: "split", direction: "row", children: [{ node: diff }, { node: { type: "panel", panel: "fileList" } }] } })).toBeNull();
  });

  it("falls back to the base preset's view for an invalid view and names the node path", async () => {
    const mine = {
      views: {
        default: { type: "split", direction: "row", children: [{ node: { type: "panel", panel: "commitList" } }, { node: diff }] },
        changes: { type: "split", direction: "row", children: [{ node: diff }, { node: { type: "panel", panel: "nope" } }] },
        history: { type: "panel", panel: "staged" },
      },
    };
    const memory = memoryIO({ [userPath]: json({ version: 1, extends: "fork", layout: { active: "mine", layouts: { mine } } }) });
    const store = createGitSettingsStore({ io: memory.io, directory: dir });
    await store.ready;
    const layout = activeLayout(store.settings$.peek(), store.base$.peek());
    expect(layout.views.default).toEqual(mine.views.default);
    expect(viewFor(layout, "changes")).toEqual(presetView("fork", "changes"));
    expect(viewFor(layout, "history")).toEqual(presetView("fork", "history"));
    expect(store.issues$.peek().map(issue => issue.path)).toEqual(["layout.layouts.mine.views.changes", "layout.layouts.mine.views.history"]);
    expect(store.issues$.peek()[0]!.message).toMatch(/children\.1\.node\.panel/);
  });

  it("uses the base preset's layout when the active layout is unknown", () => {
    expect(activeLayout({ ...defaultSettings, layout: { active: "missing", layouts: {} } }, "gitkraken")).toBe(presetLayout("gitkraken"));
    expect(activeLayout({ ...defaultSettings, layout: { active: "fork", layouts: {} } })).toBe(presetLayout("fork"));
  });
});

describe("presets", () => {
  it.each(presetIds)("%s validates with no issues and names only registered commands", id => {
    expect(validatedPreset(id).issues).toEqual([]);
    const file = presetFiles[id] as { toolbar?: { items: (string | { command: string })[] } };
    const widgets = ["branchPicker", "viewSwitcher", "search", "networkProgress", "space", "flexibleSpace"];
    for (const item of file.toolbar?.items ?? []) {
      const commandId = typeof item === "string" ? (widgets.includes(item) ? null : item) : item.command;
      if (commandId) expect(resolveCommandId(commandId)).toBe(commandId);
    }
  });

  it.each(presetIds)("%s resolves every view kind to a tree with a diff", id => {
    const layout = presetLayout(id);
    for (const kind of viewKinds) expect(layoutProblem(viewFor(layout, kind))).toBeNull();
  });

  it("SourceTree is the default and Fork and GitKraken differ from it only where their files say", () => {
    expect(presetSettings("sourcetree").layout.active).toBe("sourcetree");
    expect(presetSettings("fork").density).toBe("compact");
    expect(presetSettings("fork").sidebar).toEqual(presetSettings("sourcetree").sidebar);
    expect(presetSettings("gitkraken").panels.diff.mode).toBe("sideBySide");
    expect(presetSettings("gitkraken").panels.commitList.graph.lineWidth).toBe(3);
  });
});

describe("command metadata", () => {
  it("covers every registered command exactly once", () => {
    expect([...commandIds].sort()).toEqual(commands.map(command => command.id).sort());
    for (const id of commandIds) expect(commandMeta[id].description).toMatch(/\.$/);
  });
});

describe("layers", () => {
  it("applies preset < user < repository and takes the base preset from the highest layer that sets it", async () => {
    const root = "/repos/app";
    const repoPath = `${dir}/repositories/${sha1(root)}.json`;
    const memory = memoryIO({
      [userPath]: json({ version: 1, extends: "fork", density: "comfortable", panels: { diff: { wrap: true } } }),
      [repoPath]: json({ version: 1, root, extends: "gitkraken", panels: { diff: { wrap: false, contextLines: 5 } } }),
    });
    const store = createGitSettingsStore({ io: memory.io, directory: dir, repositoryRoot: root });
    await store.ready;
    expect(store.base$.peek()).toBe("gitkraken");
    expect(store.settings$.density.peek()).toBe("comfortable");
    expect(store.settings$.panels.diff.peek()).toMatchObject({ mode: "sideBySide", wrap: false, contextLines: 5 });
    expect(store.issues$.peek()).toEqual([]);
  });

  it("skips a layer with a JSON syntax error, reports where, and never writes it", async () => {
    const broken = "{\n  \"version\": 1,\n  \"density\": \"compact\",,\n}\n";
    const memory = memoryIO({ [userPath]: broken });
    const store = createGitSettingsStore({ io: memory.io, directory: dir });
    await store.ready;
    expect(store.settings$.density.peek()).toBe("regular");
    expect(store.issues$.peek()).toEqual([expect.objectContaining({ path: "", level: "error", message: expect.stringMatching(/line 3, column \d+/) })]);
    await expect(store.edit("user", ["density"], "compact")).rejects.toThrow(/fix the file first/);
    expect(memory.files.get(userPath)).toBe(broken);
    expect(memory.writes).toEqual([]);
  });

  it("reads a newer version's known keys but never writes it", async () => {
    const newer = json({ version: 2, density: "compact", panels: { diff: { mode: "sideBySide", newFeature: { a: 1 } } } });
    const memory = memoryIO({ [userPath]: newer });
    const store = createGitSettingsStore({ io: memory.io, directory: dir });
    await store.ready;
    expect(store.isReadOnly("user")).toBe(true);
    expect(store.settings$.density.peek()).toBe("compact");
    expect(store.settings$.panels.diff.mode.peek()).toBe("sideBySide");
    expect(store.issues$.peek()[0]).toMatchObject({ path: "version", level: "warning" });
    await expect(store.edit("user", ["density"], "regular")).rejects.toThrow(/newer Legend Git/);
    expect(memory.files.get(userPath)).toBe(newer);
  });

  it("writes sparse patches that keep unknown keys and key order", async () => {
    const original = { $schema: "x", version: 1, zeta: "kept", panels: { diff: { future: [1, 2], wrap: true } }, density: "compact" };
    const memory = memoryIO({ [userPath]: json(original) });
    const store = createGitSettingsStore({ io: memory.io, directory: dir });
    await store.ready;
    await store.edit("user", ["panels", "diff", "contextLines"], 8);
    await store.edit("user", ["panels", "diff", "wrap"], false);
    expect(memory.files.get(userPath)).toBe(json({ $schema: "x", version: 1, zeta: "kept", panels: { diff: { future: [1, 2], contextLines: 8 } }, density: "compact" }));
    expect(store.settings$.panels.diff.contextLines.peek()).toBe(8);
    // Setting a key back to the layer below's value removes it (and the parents it empties).
    await store.edit("user", ["panels", "diff", "contextLines"], 3);
    await store.edit("user", ["density"], undefined);
    expect(JSON.parse(memory.files.get(userPath)!)).toEqual({ $schema: "x", version: 1, zeta: "kept", panels: { diff: { future: [1, 2] } } });
  });

  it("creates a repository file named by the root's hash with the root inside", async () => {
    const root = "/repos/app";
    const memory = memoryIO();
    const store = createGitSettingsStore({ io: memory.io, directory: dir, repositoryRoot: root });
    await store.ready;
    await store.edit("repo", ["panels", "diff", "mode"], "sideBySide");
    expect(store.paths.repo).toBe(`${dir}/repositories/${sha1(root)}.json`);
    expect(JSON.parse(memory.files.get(store.paths.repo!)!)).toEqual({ $schema: "https://legend.so/git/git-settings.v1.schema.json", version: 1, root, panels: { diff: { mode: "sideBySide" } } });
    expect(memory.files.has(userPath)).toBe(false);
    // Resetting a key in a layer that has no file yet writes nothing.
    await store.edit("user", ["density"], "regular");
    expect(memory.files.has(userPath)).toBe(false);
  });

  it("compares a repository edit with the user layer below it", () => {
    const below = mergeSettings(defaultSettings, { density: "compact" });
    expect(applySparseEdit({ version: 1, density: "comfortable" }, ["density"], "compact", below)).toEqual({ version: 1 });
  });

  it("reloads a layer edited on disk, ignores its own writes' echoes, and notifies only what changed", async () => {
    const memory = memoryIO({ [userPath]: json({ version: 1, panels: { diff: { wrap: true } } }) });
    const store = createGitSettingsStore({ io: memory.io, directory: dir });
    await store.ready;
    const diffChanges = jest.fn(), listChanges = jest.fn(), themeChanges = jest.fn();
    store.settings$.panels.diff.onChange(diffChanges);
    store.settings$.panels.commitList.onChange(listChanges);
    store.settings$.theme.onChange(themeChanges);
    const panels = store.settings$.panels.peek();

    memory.external(userPath, json({ version: 1, panels: { diff: { wrap: true } }, theme: { dark: { accent: "#123456" } } }));
    await flush(); await flush();
    expect(store.settings$.theme.dark.accent.peek()).toBe("#123456");
    expect(themeChanges).toHaveBeenCalledTimes(1);
    expect(diffChanges).not.toHaveBeenCalled();
    expect(listChanges).not.toHaveBeenCalled();
    // Readers that compare by reference (useValue on an object) see the same panels object.
    expect(store.settings$.panels.peek()).toBe(panels);

    await store.edit("user", ["panels", "diff", "contextLines"], 5);
    await flush(); await flush();
    expect(diffChanges).toHaveBeenCalledTimes(1);
    expect(await store.reload("user")).toBe(false);
    expect(themeChanges).toHaveBeenCalledTimes(1);

    // A broken external edit skips the layer; fixing it brings the layer back.
    memory.external(userPath, "{");
    await flush(); await flush();
    expect(store.settings$.theme.dark.accent.peek()).toBe(defaultSettings.theme.dark.accent);
    memory.external(userPath, json({ version: 1, density: "compact" }));
    await flush(); await flush();
    expect(store.settings$.density.peek()).toBe("compact");
    expect(store.issues$.peek()).toEqual([]);
    await store.close();
  });
});

describe("migrations", () => {
  const table: Migrations = {
    1: file => { const { compact, ...rest } = file; return compact === true ? { ...rest, density: "compact" } : rest; },
    2: file => ({ ...file, renamed: true }),
  };

  it("runs each step in order up to the target and stamps the version", () => {
    expect(migrateSettings({ version: 1, compact: true, other: 1 }, table, 3)).toEqual({ from: 1, file: { version: 3, density: "compact", other: 1, renamed: true } });
    expect(migrateSettings({ version: 3, a: 1 }, table, 3).file).toEqual({ version: 3, a: 1 });
    expect(migrateSettings({ version: 1 }, {}, 2).error).toBe("no migration from version 1");
  });

  // Each `fixtures/migrations/v<n>-to-v<m>/in.json` must migrate to its `out.json` with the shipped migrations.
  const fixtures = join(__dirname, "../settings/fixtures/migrations");
  it.each(readdirSync(fixtures))("%s", name => {
    const [, to] = /^v\d+-to-v(\d+)$/.exec(name)!;
    const read = (file: string) => JSON.parse(readFileSync(join(fixtures, name, file), "utf8"));
    const result = migrateSettings(read("in.json"), migrations, Number(to));
    expect(result.error).toBeUndefined();
    expect(result.file).toEqual(read("out.json"));
    expect(validateSettingsFile(result.file, { file: name }).issues.filter(issue => issue.level === "error")).toEqual([]);
  });
});

describe("JSON Schema", () => {
  it("is checked in and matches a fresh generation (run `bun run git:settings schema`)", () => {
    const checkedIn = readFileSync(join(__dirname, "../../settings", schemaFileName), "utf8");
    expect(checkedIn).toBe(formatJsonSchema(buildSettingsJsonSchema()));
  });

  it("allows unknown keys, requires version and carries defaults and preset values", () => {
    const schema = buildSettingsJsonSchema() as Record<string, any>;
    expect(schema.required).toEqual(["version"]);
    expect(schema.additionalProperties).toEqual({});
    const mode = schema.properties.panels.properties.diff.properties.mode;
    expect(mode.default).toBe("unified");
    expect(mode["x-preset-values"]).toEqual({ sourcetree: "unified", fork: "unified", gitkraken: "sideBySide" });
  });
});

it("hashes like SHA-1", () => {
  expect(sha1("abc")).toBe("a9993e364706816aba3e25717850c26c9cd0d89d");
  expect(sha1("")).toBe("da39a3ee5e6b4b0d3255bfef95601890afd80709");
  expect(sha1("/Users/jay/repos/ünïcode")).toHaveLength(40);
  expect(deepEqual({ a: [1] }, { a: [1] })).toBe(true);
});
