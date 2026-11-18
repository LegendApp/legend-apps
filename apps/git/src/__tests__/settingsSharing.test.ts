import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { buildCustomizePrompt, buildRepairPrompt, checkReply, examplePrompts, generateSettingsPatch, type CustomizeContext } from "../settings/customizeAI";
import { generatedDocs } from "../settings/docs";
import { presetSettings } from "../settings/presets";
import { applyImport, checkImport, exportSettings, importSettings, undoImport } from "../settings/sharing";
import { acquireGitSettings, createGitSettingsStore, type GitSettingsStore, type SettingsIO } from "../settings/store";
import { validateSettingsFile } from "../settings/validate";

jest.mock("@legend-apps/diff-parser", () => ({}));

const dir = "/support";
const userPath = `${dir}/settings.json`;
const json = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;
const docsDir = join(__dirname, "../../docs/settings");

function memoryIO(initial: Record<string, string> = {}) {
  const files = new Map(Object.entries(initial));
  const io: SettingsIO = {
    read: async path => files.get(path),
    write: async (path, text) => { files.set(path, text); },
    mkdir: async () => {},
    watch: async () => ({ remove: () => {} }),
  };
  return { io, files };
}

describe("export", () => {
  const layer = {
    $schema: "x", version: 1, root: "/Users/me/secret-repo", extends: "fork", density: "compact",
    windowState: { frame: [0, 0, 800, 600] }, githubToken: "ghp_secret", recents: ["/Users/me/a"],
    panels: { diff: { mode: "sideBySide", future: "kept on disk only" } },
    theme: { dark: { lanes: ["#000000", "#111111", "#222222"] } },
    toolbar: { items: ["fetch", "push"] },
  };

  it("keeps only known, valid settings: never window state, paths, tokens or recents", () => {
    const exported = exportSettings(layer, "everything", { name: "Mine" });
    expect(exported).toEqual({
      $schema: "https://legend.so/git/git-settings.v1.schema.json", version: 1, name: "Mine", extends: "fork", density: "compact",
      panels: { diff: { mode: "sideBySide" } }, theme: { dark: { lanes: ["#000000", "#111111", "#222222"] } }, toolbar: { items: ["fetch", "push"] },
    });
    expect(JSON.stringify(exported)).not.toMatch(/secret|ghp_|Users|frame|recents/);
  });

  it("exports one area at a time", () => {
    expect(Object.keys(exportSettings(layer, "layout"))).toEqual(["$schema", "version", "panels"]);
    expect(Object.keys(exportSettings(layer, "theme"))).toEqual(["$schema", "version", "density", "theme"]);
    expect(Object.keys(exportSettings(layer, "actions"))).toEqual(["$schema", "version", "toolbar"]);
    expect(exportSettings(null, "everything")).toEqual({ $schema: "https://legend.so/git/git-settings.v1.schema.json", version: 1 });
  });
});

describe("import", () => {
  const shared = json({ version: 1, name: "Team", author: "Ana", root: "/elsewhere", density: "comfortable", panels: { diff: { mode: "sideBySide", wrap: "yes" } }, toolbar: { items: ["fetch"] }, bogus: 1 });

  it("summarizes what a file changes by area and drops invalid leaves, unknown keys and root", () => {
    const check = checkImport(shared, "team.json");
    expect(check.error).toBeUndefined();
    expect(check.name).toBe("Team");
    expect(check.author).toBe("Ana");
    expect(check.changes).toEqual([{ area: "theme", keys: ["density"] }, { area: "layout", keys: ["panels"] }, { area: "actions", keys: ["toolbar"] }]);
    expect(check.file).toEqual({ version: 1, name: "Team", author: "Ana", density: "comfortable", panels: { diff: { mode: "sideBySide" } }, toolbar: { items: ["fetch"] } });
    expect(check.issues.map(issue => `${issue.level} ${issue.path}`)).toEqual(["error panels.diff.wrap", "info bogus"]);
    expect(checkImport("{ nope").error).toMatch(/Not a JSON file/);
    expect(checkImport(json({ version: 9 })).error).toMatch(/newer Legend Git/);
  });

  it("replaces the layer, or applies on top of it by the merge rules", () => {
    const current = { $schema: "x", version: 1, root: "/repo", density: "compact", unknownMine: true, panels: { diff: { wrap: true } }, toolbar: { items: ["push", "pull"] } };
    const { file } = checkImport(shared);
    const header = { $schema: "https://legend.so/git/git-settings.v1.schema.json", version: 1, root: "/repo" };
    expect(applyImport(current, file, "replace")).toEqual({ ...header, density: "comfortable", panels: { diff: { mode: "sideBySide" } }, toolbar: { items: ["fetch"] } });
    expect(applyImport(current, file, "onTop")).toEqual({ ...header, density: "comfortable", unknownMine: true, panels: { diff: { wrap: true, mode: "sideBySide" } }, toolbar: { items: ["fetch"] } });
  });

  it("backs up first, applies to the chosen layer, and Undo Import restores the file exactly", async () => {
    const before = `${json({ version: 1, density: "compact", panels: { diff: { wrap: true } } })}`;
    const memory = memoryIO({ [userPath]: before });
    const store = createGitSettingsStore({ io: memory.io, directory: dir, repositoryRoot: "/repo" });
    await store.ready;
    const undo = await importSettings(store, "user", checkImport(shared).file, "onTop");
    expect(memory.files.get(`${userPath}.bak`)).toBe(before);
    expect(store.settings$.panels.diff.mode.peek()).toBe("sideBySide");
    expect(store.settings$.panels.diff.wrap.peek()).toBe(true);
    expect(store.settings$.density.peek()).toBe("comfortable");
    await undoImport(store, undo);
    expect(memory.files.get(userPath)).toBe(before);
    expect(store.settings$.panels.diff.mode.peek()).toBe("unified");
    // Scoped to this repository: a layer that had no file is emptied again by Undo.
    const repoUndo = await importSettings(store, "repo", checkImport(shared).file, "replace");
    expect(JSON.parse(memory.files.get(store.paths.repo!)!).root).toBe("/repo");
    expect(store.settings$.toolbar.items.peek()).toEqual(["fetch"]);
    await undoImport(store, repoUndo);
    expect(store.settings$.toolbar.items.peek()).toEqual(presetSettings("sourcetree").toolbar.items);
  });
});

describe("Customize with AI", () => {
  const context: CustomizeContext = { request: "Compact everything", aiReference: "REF", schema: "{}", effective: { density: "regular" }, scope: "user" };

  it("sends the reference, schema, command ids, effective settings and request", () => {
    const prompt = buildCustomizePrompt(context);
    for (const part of ["<ai-reference>\nREF", "<json-schema>\n{}", "commit: Commit", "{\"density\":\"regular\"}", "<request>\nCompact everything"]) expect(prompt).toContain(part);
  });

  it("accepts a valid reply, fenced or bare, and lists the problems of an invalid one", () => {
    expect(checkReply('{"version":1,"density":"compact"}')).toEqual({ patch: { version: 1, density: "compact" }, problems: [] });
    expect(checkReply('Here you go:\n```json\n{"density":"compact"}\n```').patch).toEqual({ density: "compact", version: 1 });
    const bad = checkReply(json({ version: 1, density: "tiny", toolbar: { items: ["make-coffee"] }, sparkle: true }));
    expect(bad.problems.map(issue => `${issue.level} ${issue.path}`)).toEqual(["error density", "info sparkle", "warning toolbar.items.0"]);
    expect(checkReply("I can't do that.").error).toBe("The reply is not a JSON object.");
  });

  it("sends the problems back once and uses the corrected reply (recorded replies)", async () => {
    const replies = [json({ version: 1, density: "tiny" }), json({ version: 1, density: "compact" })];
    const prompts: string[] = [];
    const result = await generateSettingsPatch(context, async prompt => { prompts.push(prompt); return replies.shift()!; });
    expect(result).toEqual({ patch: { version: 1, density: "compact" }, reply: json({ version: 1, density: "compact" }), attempts: 2 });
    expect(prompts[1]).toBe(buildRepairPrompt(prompts[0]!, json({ version: 1, density: "tiny" }), checkReply(json({ version: 1, density: "tiny" }))));
    expect(prompts[1]).toContain('- density: Invalid option: expected one of "compact"|"regular"|"comfortable"; ignored');
  });

  it("gives up after one correction", async () => {
    const run = jest.fn(async () => "no json here");
    await expect(generateSettingsPatch(context, run)).rejects.toThrow(/still have problems after one correction:\nThe reply is not a JSON object/);
    expect(run).toHaveBeenCalledTimes(2);
  });

  it("previews a patch without writing, then keeps or reverts it", async () => {
    const memory = memoryIO({ [userPath]: json({ version: 1, density: "compact" }) });
    const store = createGitSettingsStore({ io: memory.io, directory: dir });
    await store.ready;
    store.preview("user", applyImport(store.layerFile("user").file, { version: 1, panels: { diff: { mode: "sideBySide" } } }, "onTop"));
    expect(store.settings$.panels.diff.mode.peek()).toBe("sideBySide");
    expect(store.settings$.density.peek()).toBe("compact");
    // Settings renders from layers$ (the React Compiler memoizes plain method calls on the store).
    expect(store.layers$.user.peek()).toMatchObject({ previewing: true, exists: true, readOnly: false, file: { panels: { diff: { mode: "sideBySide" } } } });
    expect(store.layers$.repo.peek()).toBeNull();
    // An edit during the preview changes the preview, not the file.
    await store.edit("user", ["panels", "diff", "wrap"], true);
    expect(JSON.parse(memory.files.get(userPath)!)).toEqual({ version: 1, density: "compact" });
    store.preview("user", null);
    expect(store.settings$.panels.diff.mode.peek()).toBe("unified");
    expect(store.layers$.user.previewing.peek()).toBe(false);
    store.preview("user", applyImport(store.layerFile("user").file, { version: 1, panels: { diff: { mode: "sideBySide" } } }, "onTop"));
    await store.replace("user", store.layerFile("user").file!);
    expect(JSON.parse(memory.files.get(userPath)!)).toEqual({ $schema: "https://legend.so/git/git-settings.v1.schema.json", version: 1, density: "compact", panels: { diff: { mode: "sideBySide" } } });
    expect(store.layerFile("user").previewing).toBe(false);
  });
});

describe("shared stores", () => {
  it("gives every window of one repository the same store and closes it after the last release", async () => {
    const close = jest.fn(async () => {});
    const open = jest.fn(async (root: string | null) => ({ root, close }) as unknown as GitSettingsStore);
    const first = acquireGitSettings("/repo", open), second = acquireGitSettings("/repo", open), other = acquireGitSettings(null, open);
    expect(await first.store).toBe(await second.store);
    expect(await other.store).not.toBe(await first.store);
    expect(open).toHaveBeenCalledTimes(2);
    first.release();
    first.release();
    await Promise.resolve();
    expect(close).not.toHaveBeenCalled();
    second.release();
    other.release();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(close).toHaveBeenCalledTimes(2);
    acquireGitSettings("/repo", open).release();
    expect(open).toHaveBeenCalledTimes(3);
  });
});

describe("settings docs", () => {
  it("every example file validates with no issues, and each §8 prompt has one", () => {
    const files = readdirSync(join(docsDir, "examples")).filter(name => name.endsWith(".json"));
    expect(files.length).toBe(examplePrompts.length + 3);
    const descriptions = new Set<string>();
    for (const name of files) {
      const file = JSON.parse(readFileSync(join(docsDir, "examples", name), "utf8")) as Record<string, unknown>;
      expect([name, validateSettingsFile(file, { file: name }).issues]).toEqual([name, []]);
      descriptions.add(String(file.description));
    }
    for (const prompt of examplePrompts) expect(descriptions).toContain(prompt);
  });

  it.each(Object.keys(generatedDocs))("%s is checked in and current (GIT_SETTINGS_WRITE_DOCS=1 rewrites it)", name => {
    const text = generatedDocs[name as keyof typeof generatedDocs]();
    const path = join(docsDir, name);
    if (process.env.GIT_SETTINGS_WRITE_DOCS === "1") writeFileSync(path, text);
    expect(readFileSync(path, "utf8")).toBe(text);
  });
});
