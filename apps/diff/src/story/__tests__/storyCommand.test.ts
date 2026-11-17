import type { ProcessHandle, ProcessOptions } from "@legendapp/spark/processes";
import { processResult } from "../../__tests__/processFixtures";
import { getLaunchDiffSource } from "../../diffFiles";
import { createStoryCache } from "../storyCache";
import { getStoryCommandSource, parseStoryCommandArgs, runStoryCommand, StoryCommandError, type StoryCommandDependencies } from "../storyCommand";
import { getStoryCommandRequestFolder, getStoryCommandRequestFromLaunchArguments, parseStoryCommandRequest } from "../storyCommandHost";
import { buildStoryInput } from "../storyHunks";
import { createStoryRunner } from "../storyRunner";
import { getStoryScope } from "../storySource";
import { createStoryStore } from "../storyStore";
import { changeStorySkill, parseStorySkill, type StorySkill } from "../storySkill";
import { fixtureDocument, fixtureStory, memoryStorage } from "./storyFixtures";

describe("parseStoryCommandArgs", () => {
  it("defaults to unstaged changes with Markdown on stdout", () => {
    expect(parseStoryCommandArgs([])).toEqual({ comparisonArgs: ["--index-vs-workdir"], json: false, help: false });
  });
  it("reads agent, model, skill, out and json in either form and keeps comparison arguments in order", () => {
    expect(parseStoryCommandArgs(["--commit", "abc123", "--agent", "claude", "--model=opus", "--skill", "change-story-detailed", "--out=story.md", "--json"])).toEqual({
      comparisonArgs: ["--commit", "abc123"], agent: "claude", model: "opus", skill: "change-story-detailed", out: "story.md", json: true, help: false,
    });
    expect(parseStoryCommandArgs(["main...topic", "--agent=codex", "-U5"]).comparisonArgs).toEqual(["main...topic", "-U5"]);
    expect(parseStoryCommandArgs(["--engine", "claude"]).agent).toBe("claude");
    expect(parseStoryCommandArgs(["--head-vs-index", "--", "--agent"]).comparisonArgs).toEqual(["--head-vs-index", "--", "--agent"]);
    expect(parseStoryCommandArgs(["-h"]).help).toBe(true);
  });
  it.each([
    [["--agent", "gpt"], "--agent must be claude or codex, not gpt."],
    [["--engine=gpt"], "--engine must be claude or codex, not gpt."],
    [["--model"], "--model needs a value."],
    [["--skill", "--json"], "--skill needs a value."],
    [["--out="], "--out needs a value."],
    [["--json=yes"], "--json does not take a value."],
  ])("rejects %j with a usage error", (args, message) => {
    expect(() => parseStoryCommandArgs(args)).toThrow(message);
    try { parseStoryCommandArgs(args); } catch (error) { expect((error as StoryCommandError).exitCode).toBe(2); }
  });
});

describe("getStoryCommandSource", () => {
  it("resolves the same Git sources as ldiff", () => {
    expect(getStoryCommandSource("/repo", ["--index-vs-workdir"])).toMatchObject({ kind: "index-vs-workdir", cwd: "/repo" });
    expect(getStoryCommandSource("/repo", ["--head-vs-index"])).toMatchObject({ kind: "head-vs-index" });
    expect(getStoryCommandSource("/repo", ["--commit", "abc123"])).toMatchObject({ kind: "commit", sha: "abc123" });
    expect(getStoryCommandSource("/repo", ["main...topic"])).toMatchObject({ kind: "range", range: "main...topic" });
  });
  it("rejects non-Git sources", () => {
    expect(() => getStoryCommandSource("/repo", ["https://github.com/a/b/pull/1"])).toThrow("Git comparisons only");
  });
});

function fakeSpawn() {
  const commands: ProcessOptions[] = [];
  const spawn = jest.fn(async (options: ProcessOptions): Promise<ProcessHandle> => {
    commands.push(options);
    const result = processResult({ stdout: JSON.stringify(fixtureStory()) });
    let complete!: (value: typeof result) => void;
    const exited = new Promise<typeof result>(resolve => { complete = resolve; });
    return { id: "1", exited, terminate: jest.fn(async () => {}), write: jest.fn(async () => {}), resize: jest.fn(async () => {}),
      closeInput: jest.fn(async () => { complete(result); }) };
  });
  return { spawn, commands };
}

function setup(options: { skills?: StorySkill[]; availability?: { codex: boolean; claude: boolean }; trusted?: boolean } = {}) {
  const storage = memoryStorage(), cache = createStoryCache(storage), cli = fakeSpawn();
  const runner = createStoryRunner({ spawn: cli.spawn, runCommand: jest.fn(), availability: async () => options.availability ?? { codex: true, claude: true } });
  const dispose = jest.fn();
  const dependencies: StoryCommandDependencies = {
    resolveRoot: async () => "/repo",
    loadDocument: async () => ({ document: fixtureDocument(), dispose }),
    loadSkills: async () => ({ skills: options.skills ?? [changeStorySkill], errors: [] }),
    isRepoSkillTrusted: () => options.trusted ?? false,
    availability: async () => options.availability ?? { codex: true, claude: true },
    runner, cache,
  };
  return { dependencies, cache, runner, commands: cli.commands, dispose };
}

describe("runStoryCommand", () => {
  it.each([
    ["claude", undefined, ["-p", "--tools", "", "--strict-mcp-config", "--disable-slash-commands", "--no-session-persistence"]],
    ["claude", "opus", ["--model", "opus"]],
    ["codex", undefined, ["--sandbox", "read-only", "-"]],
    ["codex", "gpt-5", ["gpt-5", "--sandbox", "read-only", "-"]],
  ] as const)("runs %s (model %s) read-only from the repository root", async (agent, model, args) => {
    const { dependencies, commands, dispose } = setup();
    const output = await runStoryCommand("/repo/sub", parseStoryCommandArgs(["--agent", agent, ...(model ? ["--model", model] : [])]), dependencies);
    expect(commands).toHaveLength(1);
    expect(commands[0].target).toEqual({ type: "command", name: agent });
    expect(commands[0].cwd).toBe("/repo");
    expect(commands[0].args).toEqual(expect.arrayContaining([...args]));
    if (agent === "claude" && !model) expect(commands[0].args).not.toContain("--model");
    expect(commands[0].input).toContain("Hunk index");
    expect(output.result).toMatchObject({ tool: agent, model: model ?? "default", skillName: "change-story" });
    expect(output.text).toMatch(/^# Improve behavior\n/);
    expect(dispose).toHaveBeenCalled();
  });

  it("caches the story where the app's lookup finds it for the same comparison", async () => {
    const { dependencies, cache, runner } = setup({ availability: { codex: false, claude: true } });
    const output = await runStoryCommand("/repo", parseStoryCommandArgs(["--head-vs-index"]), dependencies);
    expect(output.result.tool).toBe("claude");
    // The app builds its own input from its own document for the source `ldiff --head-vs-index` opens.
    const source = getStoryCommandSource("/repo", ["--head-vs-index"]);
    const store = createStoryStore({ runner, cache: () => cache });
    store.load("window", { input: buildStoryInput(fixtureDocument(), source), source, repoRoot: "/repo", tool: "claude", skill: changeStorySkill });
    expect(store.state("window").peek()).toMatchObject({ status: "done", result: { story: fixtureStory(), tool: "claude", model: "default" } });
  });

  it("prints JSON with the cache identity", async () => {
    const { dependencies } = setup();
    const output = await runStoryCommand("/repo", parseStoryCommandArgs(["--json", "--agent", "codex"]), dependencies);
    expect(JSON.parse(output.text)).toMatchObject({ scope: "repo:/repo", skill: "change-story", tool: "codex", model: "default", story: fixtureStory(), markdown: expect.stringContaining("# Improve behavior") });
  });

  it("stops when story generation is off for the repository and does not turn it on", async () => {
    const { dependencies, cache, commands } = setup();
    cache.setEnabled("repo:/repo", "claude", false);
    await expect(runStoryCommand("/repo", parseStoryCommandArgs(["--agent", "claude"]), dependencies)).rejects.toThrow("off for this repository");
    expect(commands).toHaveLength(0);
    const { dependencies: fresh, cache: freshCache } = setup();
    await runStoryCommand("/repo", parseStoryCommandArgs(["--agent", "claude"]), fresh);
    expect(freshCache.isEnabled(getStoryScope(getStoryCommandSource("/repo", ["--index-vs-workdir"]), "/repo"), "claude")).toBe(false);
  });

  it("explains a missing CLI and an agent that conflicts with the skill", async () => {
    await expect(runStoryCommand("/repo", parseStoryCommandArgs(["--agent", "codex"]), setup({ availability: { codex: false, claude: true } }).dependencies))
      .rejects.toThrow("The codex CLI is not installed");
    await expect(runStoryCommand("/repo", parseStoryCommandArgs([]), setup({ availability: { codex: false, claude: false } }).dependencies))
      .rejects.toThrow("Install the Codex or Claude CLI");
    const pinned = { ...parseStorySkill(changeStorySkill.markdown.replace("tool: auto", "tool: claude")), layer: "user" as const };
    await expect(runStoryCommand("/repo", parseStoryCommandArgs(["--agent", "codex"]), setup({ skills: [pinned] }).dependencies))
      .rejects.toThrow("runs with claude");
  });

  it("selects skills by name and requires an explicit name for an unapproved repository override", async () => {
    const repo = { ...changeStorySkill, layer: "repo" as const, path: "/repo/.legend-diff/skills/change-story.md", repoRoot: "/repo" };
    await expect(runStoryCommand("/repo", parseStoryCommandArgs([]), setup({ skills: [repo] }).dependencies)).rejects.toThrow("unapproved repository skill");
    await expect(runStoryCommand("/repo", parseStoryCommandArgs(["--skill", "change-story"]), setup({ skills: [repo] }).dependencies)).resolves.toBeTruthy();
    await expect(runStoryCommand("/repo", parseStoryCommandArgs([]), setup({ skills: [repo], trusted: true }).dependencies)).resolves.toBeTruthy();
    await expect(runStoryCommand("/repo", parseStoryCommandArgs(["--skill", "missing"]), setup().dependencies)).rejects.toThrow("No story skill named missing. Available: change-story.");
  });
});

describe("story command request", () => {
  it("accepts only the request folders ldiff creates", () => {
    expect(getStoryCommandRequestFolder("legend-diff://story?request=%2Fvar%2Ffolders%2Fx%2FT%2Flegend-diff-story.Ab12Cd34")).toBe("/var/folders/x/T/legend-diff-story.Ab12Cd34");
    expect(getStoryCommandRequestFolder("legend-diff://open?request=%2Ftmp%2Flegend-diff-story.Ab12")).toBeNull();
    expect(getStoryCommandRequestFolder("legend-diff://story?request=%2FUsers%2Fme%2Fproject")).toBeNull();
    expect(getStoryCommandRequestFolder("legend-diff://story?request=tmp%2Flegend-diff-story.Ab12")).toBeNull();
    expect(getStoryCommandRequestFolder("legend-diff://story?request=%2Ftmp%2F..%2Flegend-diff-story.Ab12")).toBeNull();
    expect(getStoryCommandRequestFromLaunchArguments(["/App/MacOS/Diff", "-RCT_jsLocation", "x", "--story-request=/tmp/legend-diff-story.Ab12"])).toBe("/tmp/legend-diff-story.Ab12");
    expect(getStoryCommandRequestFromLaunchArguments(["/App/MacOS/Diff", "--story-request=/Users/me"])).toBeNull();
    expect(getStoryCommandRequestFromLaunchArguments(["/App/MacOS/Diff", "--story-request", "/tmp/legend-diff-story.Ab12"])).toBeNull();
    // The launch source parser must not open the request folder as a window.
    expect(getLaunchDiffSource(["--story-request=/tmp/legend-diff-story.Ab12"])).toBeNull();
  });
  it("reads the URL-encoded working directory and arguments, one per line", () => {
    expect(parseStoryCommandRequest("%2Frepo%20dir\n--commit\nabc\n--model\nmy%20model\n%0A\n\n")).toEqual({ cwd: "/repo dir", args: ["--commit", "abc", "--model", "my model", "\n", ""] });
    expect(parseStoryCommandRequest("%2Frepo\n")).toEqual({ cwd: "/repo", args: [] });
    expect(() => parseStoryCommandRequest("relative\n")).toThrow("no working directory");
  });
});
