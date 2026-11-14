import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import type { DirectoryChangeEvent } from "@legend-apps/file-system-watcher";
import { createSkillLibrary, type SkillFileSystem } from "../skillLibrary";
import { changeStoryMarkdown, changeStorySkill, parseStorySkill } from "../storySkill";

let directory: string;
const files: SkillFileSystem = {
  exists: async path => { try { await fs.access(path); return true; } catch { return false; } },
  list: async directory => (await fs.readdir(directory)).map(name => ({ name, path: path.join(directory, name) })),
  readText: path => fs.readFile(path, "utf8"), writeNewText: (path, text) => fs.writeFile(path, text, { flag: "wx" }),
  mkdir: async path => { await fs.mkdir(path, { recursive: true }); }, remove: path => fs.unlink(path),
  writeTextIfUnchanged: async (path, expected, text) => {
    if (await fs.readFile(path, "utf8") !== expected) return { written: false };
    await fs.writeFile(path, text); return { written: true };
  },
};
beforeEach(async () => { directory = await fs.mkdtemp(path.join(os.tmpdir(), "diff-skills-")); });
afterEach(async () => { jest.useRealTimers(); await fs.rm(directory, { recursive: true, force: true }); });
function setup() {
  const userDirectory = path.join(directory, "user"), repoRoot = path.join(directory, "repo"), repoDirectory = path.join(repoRoot, ".legend-diff/skills");
  let notify!: (event: DirectoryChangeEvent) => void;
  const remove = jest.fn();
  const watch = jest.fn((_paths, listener) => { notify = listener; return { remove }; });
  const library = createSkillLibrary({ userDirectory, repoRoot, files, watch });
  return { library, userDirectory, repoRoot, repoDirectory, watch, remove,
    notify: (filePath: string, contentChanged = true) => notify({ filePath, path: directory, type: "change", contentChanged }) };
}
async function put(directory: string, filename: string, markdown = changeStoryMarkdown) {
  await fs.mkdir(directory, { recursive: true }); await fs.writeFile(path.join(directory, filename), markdown);
}
it("loads repo over user over built-in while retaining all layers and workflows for the editor", async () => {
  const t = setup();
  await put(t.userDirectory, "override.md", changeStoryMarkdown + "User text");
  await put(t.repoDirectory, "repo.md", changeStoryMarkdown + "Repo text");
  await put(t.userDirectory, "workflow.md", changeStoryMarkdown.replace("name: change-story", "name: inspect-tests").replace("kind: story", "kind: workflow").replace("output: story", "output: check"));
  await put(t.repoDirectory, "ignored.txt");
  await t.library.start();
  expect(t.library.state$.active.peek().find(skill => skill.name === "change-story")).toMatchObject({ layer: "repo", repoRoot: t.repoRoot, body: expect.stringContaining("Repo text") });
  expect(t.library.state$.entries.peek()).toHaveLength(8);
  expect(t.library.state$.active.peek().find(skill => skill.name === "inspect-tests")?.kind).toBe("workflow");
  await fs.unlink(path.join(t.repoDirectory, "repo.md")); await t.library.reload();
  expect(t.library.state$.active.peek().find(skill => skill.name === "change-story")?.layer).toBe("user");
  await fs.unlink(path.join(t.userDirectory, "override.md")); await t.library.reload();
  expect(t.library.state$.active.peek().find(skill => skill.name === "change-story")?.layer).toBe("built-in");
  t.library.stop(); expect(t.remove).toHaveBeenCalledTimes(1);
});
it("reports invalid files with paths and duplicate names without failing other skills", async () => {
  const t = setup();
  await put(t.userDirectory, "bad.md", "missing frontmatter");
  await put(t.userDirectory, "first.md"); await put(t.userDirectory, "second.md");
  await t.library.reload();
  expect(t.library.state$.errors.peek()).toEqual(expect.arrayContaining([expect.stringContaining("bad.md: Start"), expect.stringContaining("Duplicate name in user layer")]));
  expect(t.library.state$.active.peek()).toHaveLength(5);
});
it("duplicates a built-in, saves a user edit and restores the bundled prompt in temp dirs", async () => {
  const t = setup(); await t.library.reload();
  const duplicate = await t.library.duplicate(changeStorySkill);
  expect(await fs.readFile(duplicate, "utf8")).toBe(changeStoryMarkdown);
  expect(changeStorySkill.layer).toBe("built-in");
  const user = t.library.state$.active.peek().find(skill => skill.name === changeStorySkill.name)!;
  await t.library.save(user, changeStoryMarkdown + "Local edit");
  const edited = t.library.state$.active.peek().find(skill => skill.name === changeStorySkill.name)!;
  expect(edited.hash).toBe(parseStorySkill(changeStoryMarkdown + "Local edit").hash);
  await expect(t.library.duplicate(changeStorySkill)).rejects.toThrow("already exists");
  await expect(t.library.save(changeStorySkill, changeStoryMarkdown)).rejects.toThrow("Duplicate");
  await expect(t.library.restore(changeStorySkill)).rejects.toThrow("user override");
  await t.library.restore(edited);
  expect(await files.exists(duplicate)).toBe(false);
  expect(t.library.state$.active.peek().find(skill => skill.name === changeStorySkill.name)).toEqual(changeStorySkill);
});
it("keeps external edits when a stale editor tries to save or restore", async () => {
  const t = setup(); const duplicate = await t.library.duplicate(changeStorySkill);
  const old = t.library.state$.active.peek().find(skill => skill.name === changeStorySkill.name)!;
  await fs.writeFile(duplicate, changeStoryMarkdown + "External edit");
  await expect(t.library.save(old, changeStoryMarkdown + "Stale editor")).rejects.toThrow("changed on disk");
  await expect(t.library.restore(old)).rejects.toThrow("changed on disk");
  expect(await fs.readFile(duplicate, "utf8")).toContain("External edit");
});
it("reloads user and repo prompt hashes through a fake M0 watcher and stops on disposal", async () => {
  const t = setup(); await put(t.userDirectory, "change-story.md"); await t.library.start();
  expect(t.watch).toHaveBeenCalledWith([t.userDirectory, t.repoRoot], expect.any(Function));
  jest.useFakeTimers();
  const initial = t.library.state$.active.peek()[0].hash;
  await put(t.userDirectory, "change-story.md", changeStoryMarkdown + "Reloaded user");
  t.notify(path.join(t.userDirectory, "change-story.md"));
  expect(t.library.state$.ready.peek()).toBe(false);
  await jest.advanceTimersByTimeAsync(300); await t.library.reload();
  expect(t.library.state$.active.peek().find(skill => skill.name === "change-story")?.hash).not.toBe(initial);
  await put(t.repoDirectory, "story.md", changeStoryMarkdown + "Reloaded repo");
  t.notify(path.join(t.repoRoot, ".legend-diff"));
  await jest.advanceTimersByTimeAsync(300); await t.library.reload();
  expect(t.library.state$.active.peek().find(skill => skill.name === "change-story")?.layer).toBe("repo");
  t.notify(path.join(t.userDirectory, "change-story.md"), false);
  t.notify(path.join(t.repoRoot, "src/other.ts"));
  expect(t.library.state$.ready.peek()).toBe(true);
  const before = t.library.state$.peek(); t.notify(t.repoDirectory); t.library.stop();
  await jest.advanceTimersByTimeAsync(1000);
  expect(t.library.state$.entries.peek()).toEqual(before.entries);
  expect(t.remove).toHaveBeenCalledTimes(1);
});

it("does not overwrite a file created between duplicate's existence check and publication", async () => {
  const t = setup(); await files.mkdir(t.userDirectory);
  const destination = path.join(t.userDirectory, "change-story.md");
  const racingFiles = { ...files, writeNewText: async (path: string, text: string) => {
    await fs.writeFile(path, "Other editor's file"); await files.writeNewText(path, text);
  } };
  const library = createSkillLibrary({ userDirectory: t.userDirectory, files: racingFiles });
  await expect(library.duplicate(changeStorySkill)).rejects.toThrow();
  expect(await fs.readFile(destination, "utf8")).toBe("Other editor's file");
});

it("rejects a colliding editor name before replacing the original skill file", async () => {
  const t = setup(); const destination = await t.library.duplicate(changeStorySkill);
  await put(t.userDirectory, "other.md", changeStoryMarkdown.replace("name: change-story", "name: other-story"));
  await t.library.reload();
  const original = t.library.state$.active.peek().find(skill => skill.name === "change-story")!;
  await expect(t.library.save(original, changeStoryMarkdown.replace("name: change-story", "name: other-story"))).rejects.toThrow("already exists");
  expect(await fs.readFile(destination, "utf8")).toBe(changeStoryMarkdown);
});
