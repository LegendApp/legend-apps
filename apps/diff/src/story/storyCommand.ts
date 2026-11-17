import type { DiffDocument } from "@legend-apps/diff-parser";
import { isDiffGitSource, type GitSource } from "@legend-apps/git-core";
import { getDiffSourceFromOpenUrl } from "../diffFiles";
import type { createStoryCache } from "./storyCache";
import { storyCacheIdentity } from "./storyCache";
import { buildStoryInput } from "./storyHunks";
import { storyToMarkdown } from "./storyMarkdown";
import { StoryOutputError, StoryRunError, type createStoryRunner, type StoryProgress, type StoryRunResult, type StoryTool } from "./storyRunner";
import { getStoryCwd, getStoryScope } from "./storySource";
import { changeStorySkill, type StorySkill } from "./storySkill";
import { selectPreferredAITool } from "@legendapp/spark/ai";

export type StoryCommandOptions = {
  comparisonArgs: string[]; agent?: StoryTool; model?: string; skill?: string; out?: string; json: boolean; help: boolean;
};
export class StoryCommandError extends Error {
  constructor(message: string, public readonly exitCode = 1) { super(message); this.name = "StoryCommandError"; }
}

export const storyCommandHelp = `Usage: ldiff story [comparison] [--agent claude|codex] [--model <name>] [--skill <name>] [--out <file>] [--json]

Generates a Change Story in the background without opening a Diff window, caches it where
Diff reads stories, and prints it as Markdown.

Comparison (default --index-vs-workdir, the unstaged changes):
  --index-vs-workdir | --head-vs-index | --commit <sha> | main..topic | main...topic | other git diff arguments

Options:
  --agent claude|codex  AI CLI to run (default: the skill's tool, else Codex or Claude, whichever is installed);
                        --engine is the same option, as in Review
  --model <name>        Model passed to the AI CLI (Diff caches stories per model; the app shows the default model)
  --skill <name>        Story skill (repository, then user, then built-in; default change-story)
  --out <file>          Write the story to <file> instead of stdout
  --json                Print the story result and cache identity as JSON
`;

const valueOptions = new Set(["--agent", "--engine", "--model", "--skill", "--out"]);

export function parseStoryCommandArgs(args: readonly string[]): StoryCommandOptions {
  const options: StoryCommandOptions = { comparisonArgs: [], json: false, help: false };
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--") { options.comparisonArgs.push(...args.slice(index)); break; }
    const [name, inline] = arg.startsWith("--") && arg.includes("=") ? [arg.slice(0, arg.indexOf("=")), arg.slice(arg.indexOf("=") + 1)] : [arg, undefined];
    if (name === "--json" || name === "--help" || name === "-h") {
      if (inline !== undefined) throw new StoryCommandError(`${name} does not take a value.`, 2);
      if (name === "--json") options.json = true; else options.help = true;
    } else if (valueOptions.has(name)) {
      const value = inline ?? args[++index];
      if (!value || (inline === undefined && value.startsWith("--"))) throw new StoryCommandError(`${name} needs a value.`, 2);
      if (name === "--agent" || name === "--engine") {
        if (value !== "claude" && value !== "codex") throw new StoryCommandError(`${name} must be claude or codex, not ${value}.`, 2);
        options.agent = value;
      } else options[name.slice(2) as "model" | "skill" | "out"] = value;
    } else options.comparisonArgs.push(arg);
  }
  if (!options.comparisonArgs.length) options.comparisonArgs.push("--index-vs-workdir");
  return options;
}

export function getStoryCommandSource(cwd: string, comparisonArgs: readonly string[]): GitSource {
  const params = new URLSearchParams({ cwd });
  comparisonArgs.forEach(arg => params.append("arg", arg));
  const source = getDiffSourceFromOpenUrl(`legend-diff://open?${params}`);
  if (!source || !isDiffGitSource(source)) throw new StoryCommandError("ldiff story supports Git comparisons only (see ldiff story --help).", 2);
  return source;
}

export function selectStoryCommandSkill(skills: readonly StorySkill[], name: string | undefined, repoTrusted: (skill: StorySkill) => boolean) {
  const stories = skills.filter(skill => skill.kind === "story" && skill.output === "story");
  const skill = stories.find(skill => skill.name === (name ?? changeStorySkill.name));
  if (!skill) throw new StoryCommandError(`No story skill named ${name}. Available: ${stories.map(skill => skill.name).join(", ")}.`, 2);
  // Naming a repository skill on the command line approves it for this run; an implicit repository override needs Diff's approval.
  if (!name && skill.layer === "repo" && !repoTrusted(skill)) throw new StoryCommandError(`${skill.name} is overridden by an unapproved repository skill (${skill.path}). Review it, then pass --skill ${skill.name} or approve it in Diff.`);
  return skill;
}

export function selectStoryCommandTool(skill: StorySkill, agent: StoryTool | undefined, availability: { codex: boolean; claude: boolean }): StoryTool {
  if (agent && skill.tool !== "auto" && skill.tool !== agent) throw new StoryCommandError(`The ${skill.name} skill runs with ${skill.tool}; drop --agent or pass --agent ${skill.tool}.`, 2);
  const tool = agent ?? (skill.tool === "auto" ? selectPreferredAITool(availability) : skill.tool);
  if (!tool) throw new StoryCommandError("Install the Codex or Claude CLI and sign in to generate a story.");
  if (!availability[tool]) throw new StoryCommandError(`The ${tool} CLI is not installed or not on PATH. Install it and sign in, then retry.`);
  return tool;
}

export type StoryCommandDependencies = {
  resolveRoot(cwd: string): Promise<string | undefined>;
  loadDocument(source: GitSource): Promise<{ document: Pick<DiffDocument, "getFiles" | "getPlainRows">; dispose(): void }>;
  loadSkills(repoRoot: string | undefined): Promise<{ skills: StorySkill[]; errors: string[] }>;
  isRepoSkillTrusted(skill: StorySkill, repoRoot: string | undefined): boolean;
  availability(): Promise<{ codex: boolean; claude: boolean }>;
  runner: Pick<ReturnType<typeof createStoryRunner>, "run">;
  cache: Pick<ReturnType<typeof createStoryCache>, "isDisabled" | "save">;
};
export type StoryCommandOutput = { text: string; result: StoryRunResult; scope: string };

export async function runStoryCommand(cwd: string, options: StoryCommandOptions, dependencies: StoryCommandDependencies,
  context: { signal?: AbortSignal; onProgress?: (message: string) => void } = {}): Promise<StoryCommandOutput> {
  const source = getStoryCommandSource(cwd, options.comparisonArgs);
  const repoRoot = await dependencies.resolveRoot(source.cwd);
  const scope = getStoryScope(source, repoRoot);
  const library = await dependencies.loadSkills(repoRoot);
  library.errors.forEach(error => context.onProgress?.(`Skill error: ${error}`));
  const skill = selectStoryCommandSkill(library.skills, options.skill, skill => dependencies.isRepoSkillTrusted(skill, repoRoot));
  const tool = selectStoryCommandTool(skill, options.agent, await dependencies.availability());
  // Running the command is consent for this run; a repository where story generation was turned off stays off.
  if (dependencies.cache.isDisabled(scope, tool)) throw new StoryCommandError(`Story generation with ${tool === "codex" ? "Codex" : "Claude"} is off for this repository. Turn it on in Diff's Story tab to use ldiff story.`);
  context.onProgress?.(`Reading ${source.label}…`);
  const loaded = await dependencies.loadDocument(source);
  let input;
  try { input = buildStoryInput(loaded.document, source); } finally { loaded.dispose(); }
  if (!input.files.length) throw new StoryCommandError(`No changes in ${source.label}.`);
  context.onProgress?.(`Generating ${skill.name} with ${tool}${options.model ? ` (${options.model})` : ""} for ${input.hunks.length} hunks…`);
  let result: StoryRunResult;
  try {
    result = await dependencies.runner.run(input, { windowId: `cli:${scope}`, skill, tool, model: options.model, cwd: getStoryCwd(source, repoRoot),
      signal: context.signal, onProgress: (progress: StoryProgress) => { if (progress.phase === "repairing") context.onProgress?.("Repairing invalid output…"); } });
  } catch (error) {
    if (error instanceof StoryOutputError) throw new StoryCommandError(`${error.message}\n\nRaw output:\n${error.rawOutput}`);
    if (error instanceof StoryRunError) throw new StoryCommandError(error.message);
    throw error;
  }
  dependencies.cache.save(storyCacheIdentity(scope, input, skill, result.tool, result.model), result, input);
  const text = options.json
    ? `${JSON.stringify({ scope, source: input.source, diffHash: result.diffHash, skill: result.skillName, tool: result.tool, model: result.model, story: result.story, uncovered: result.uncovered, markdown: storyToMarkdown(result.story, input) }, null, 2)}\n`
    : storyToMarkdown(result.story, input);
  return { text, result, scope };
}
