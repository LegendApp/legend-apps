import { observable } from "@legendapp/state";
import type { DiffDirectoryWatcher } from "../git/diffRepoWatcher";
import { builtInStorySkills, parseStorySkill, type StorySkill } from "./storySkill";
import { builtInWorkflowSkills } from "../workflows/workflowSkills";

const builtInSkills = [...builtInStorySkills, ...builtInWorkflowSkills];

export type SkillFileSystem = {
  exists(path: string): Promise<boolean>;
  list(path: string): Promise<{ name: string; path: string }[]>;
  readText(path: string): Promise<string>;
  mkdir(path: string): Promise<void>;
  writeNewText(path: string, text: string): Promise<void>;
  writeTextIfUnchanged(path: string, expected: string, text: string): Promise<{ written: boolean }>;
  remove(path: string): Promise<void>;
};
export type SkillLibraryState = { entries: StorySkill[]; active: StorySkill[]; errors: string[]; ready: boolean };
export function skillDirectory(repoRoot: string) { return `${repoRoot.replace(/\/+$/, "")}/.legend-diff/skills`; }
const normalized = (path: string) => path.replace(/^\/private(?=\/(?:tmp|var)(?:\/|$))/, "").replace(/\/+$/, "");

export function resolveSkillLayers(entries: StorySkill[]) {
  const rank = { repo: 0, user: 1, "built-in": 2 };
  const active = new Map<string, StorySkill>();
  for (const skill of [...entries].sort((a, b) => rank[a.layer ?? "built-in"] - rank[b.layer ?? "built-in"])) {
    if (!active.has(skill.name)) active.set(skill.name, skill);
  }
  return [...active.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function createSkillLibrary({ userDirectory, repoRoot, files, watch }: {
  userDirectory: string; repoRoot?: string; files: SkillFileSystem; watch?: DiffDirectoryWatcher;
}) {
  const state$ = observable<SkillLibraryState>({ entries: builtInSkills, active: builtInSkills, errors: [], ready: false });
  const repoDirectory = repoRoot ? skillDirectory(repoRoot) : undefined;
  let subscription: { remove(): void } | undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  let pending = false;
  let loading: Promise<void> | undefined;

  async function readLayer(directory: string, layer: "user" | "repo", errors: string[]) {
    const entries: StorySkill[] = [];
    try {
      if (!await files.exists(directory)) return entries;
      const paths = (await files.list(directory)).filter(file => file.name.toLowerCase().endsWith(".md")).sort((a, b) => a.name.localeCompare(b.name));
      const names = new Set<string>();
      for (const file of paths) {
        try {
          const skill = parseStorySkill(await files.readText(file.path));
          if (names.has(skill.name)) throw new Error(`Duplicate name in ${layer} layer: ${skill.name}. Use a unique name in each layer.`);
          names.add(skill.name);
          entries.push({ ...skill, layer, path: file.path, ...(layer === "repo" ? { repoRoot } : {}) });
        } catch (error) { errors.push(`${file.path}: ${error instanceof Error ? error.message : String(error)}`); }
      }
    } catch (error) { errors.push(`${directory}: ${error instanceof Error ? error.message : String(error)}`); }
    return entries;
  }

  function reload(): Promise<void> {
    pending = true;
    if (loading) return loading;
    state$.ready.set(false);
    loading = (async () => {
      do {
        pending = false;
        const errors: string[] = [];
        const user = await readLayer(userDirectory, "user", errors);
        const repo = repoDirectory ? await readLayer(repoDirectory, "repo", errors) : [];
        if (!stopped) {
          const entries = [...repo, ...user, ...builtInSkills];
          state$.set({ entries, active: resolveSkillLayers(entries), errors, ready: !pending });
        }
      } while (pending && !stopped);
    })().finally(() => { loading = undefined; });
    return loading;
  }

  return {
    state$, userDirectory, repoRoot, reload,
    start() {
      stopped = false;
      subscription = watch?.([userDirectory, ...(repoRoot ? [repoRoot] : [])], event => {
        const path = normalized(event.filePath);
        const inSkills = [userDirectory, repoDirectory].some(directory => directory && (path === normalized(directory) || path.startsWith(`${normalized(directory)}/`)));
        const repoConfigChanged = repoRoot && path === `${normalized(repoRoot)}/.legend-diff`;
        if (event.contentChanged === false || !inSkills && !repoConfigChanged) return;
        state$.ready.set(false);
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => { timer = undefined; void reload(); }, 300);
      });
      return reload();
    },
    stop() { stopped = true; if (timer) clearTimeout(timer); subscription?.remove(); subscription = undefined; },
    async duplicate(skill: StorySkill) {
      const path = `${userDirectory}/${skill.name}.md`;
      if (state$.entries.peek().some(entry => entry.layer === "user" && entry.name === skill.name) || await files.exists(path)) throw new Error("A user copy already exists. Select it to edit.");
      await files.mkdir(userDirectory);
      await files.writeNewText(path, skill.markdown);
      await reload();
      return path;
    },
    async save(skill: StorySkill, markdown: string) {
      const parsed = parseStorySkill(markdown);
      if (!skill.path || skill.layer === "built-in") throw new Error("Duplicate the built-in skill to edit it.");
      if (state$.entries.peek().some(entry => entry.layer === skill.layer && entry.path !== skill.path && entry.name === parsed.name)) throw new Error(`A ${skill.layer} skill named ${parsed.name} already exists. Choose a unique name.`);
      if (!(await files.writeTextIfUnchanged(skill.path, skill.markdown, markdown)).written) throw new Error("This file changed on disk. Reload it before saving.");
      await reload();
    },
    async restore(skill: StorySkill) {
      if (skill.layer !== "user" || !skill.path || !builtInSkills.some(builtIn => builtIn.name === skill.name)) throw new Error("Select a user override of a built-in skill to restore it.");
      if (await files.readText(skill.path) !== skill.markdown) throw new Error("This file changed on disk. Reload it before restoring.");
      await files.remove(skill.path);
      await reload();
    },
  };
}
export type SkillLibrary = ReturnType<typeof createSkillLibrary>;
