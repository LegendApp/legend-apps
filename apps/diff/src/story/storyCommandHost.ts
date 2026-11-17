import { loadUnifiedDiff } from "@legend-apps/diff-parser";
import { getGitService, readDiffGitSource } from "@legend-apps/git-core";
import { getAICommandAvailability } from "@legendapp/spark/ai";
import * as files from "@legendapp/spark/files";
import { getDiffIgnoreWhitespaceChangesSetting } from "../diffSettings";
import { createSkillLibrary } from "./skillLibrary";
import { skillFiles, userSkillDirectory } from "./skillRuntime";
import { skillTrust } from "./skillTrust";
import { createStoryCache } from "./storyCache";
import { parseStoryCommandArgs, runStoryCommand, StoryCommandError, storyCommandHelp, type StoryCommandDependencies } from "./storyCommand";
import { storyRunner } from "./storyRunner";

// `ldiff story` makes a private request folder, writes `request` (cwd, then each argument, URL-encoded, one per line) and opens
// legend-diff://story?request=<folder> with the launch argument `--story-request=<folder>`: a running app gets the URL, while a
// cold launch sees no initial URL and reads the arguments. Diff answers in that folder: `started`, `progress` (one line per step),
// then `stdout`/`stderr` and finally `exit`. The script waits for `exit`; it writes `cancel` on Ctrl-C.
const requestFolderPattern = /\/legend-diff-story\.[A-Za-z0-9]+$/;

function validRequestFolder(value: string | null | undefined) {
  const folder = value?.replace(/\/+$/, "");
  return folder && folder.startsWith("/") && requestFolderPattern.test(folder) && !folder.split("/").includes("..") ? folder : null;
}

export function getStoryCommandRequestFolder(url: string) {
  let parsed: URL;
  try { parsed = new URL(url); } catch { return null; }
  if (parsed.protocol !== "legend-diff:" || parsed.hostname !== "story") return null;
  return validRequestFolder(parsed.searchParams.get("request"));
}

export function getStoryCommandRequestFromLaunchArguments(args: readonly string[]) {
  // One token, so the launch source parser skips it as a flag instead of opening the folder.
  const arg = args.find(arg => arg.startsWith("--story-request="));
  return arg ? validRequestFolder(arg.slice("--story-request=".length)) : null;
}

// Spark's readText stops at a NUL byte, so the request is line-based.
export function parseStoryCommandRequest(text: string) {
  const [cwd, ...args] = text.replace(/\n$/, "").split("\n").map(line => decodeURIComponent(line));
  if (!cwd?.startsWith("/")) throw new StoryCommandError("The story request has no working directory.");
  return { cwd, args };
}

export const storyCommandDependencies: StoryCommandDependencies = {
  resolveRoot: cwd => getGitService(cwd).resolveRoot(),
  async loadDocument(source) {
    // Same reader and parser options as the viewer, so the diff hash matches what a Diff window computes.
    const ignoreWhitespaceChanges = getDiffIgnoreWhitespaceChangesSetting();
    const text = await readDiffGitSource(source, { ignoreWhitespaceChanges });
    const { document } = await loadUnifiedDiff(text, source.label, 0, ignoreWhitespaceChanges);
    return { document, dispose: () => { document.cancelTokenizationRequests("story command"); document.releaseNativeResources(); } };
  },
  async loadSkills(repoRoot) {
    const library = createSkillLibrary({ userDirectory: userSkillDirectory(), repoRoot, files: skillFiles });
    await library.reload();
    const state = library.state$.peek();
    return { skills: state.active, errors: state.errors };
  },
  isRepoSkillTrusted: (skill, repoRoot) => skillTrust.isTrusted(skill, repoRoot),
  availability: getAICommandAvailability,
  runner: storyRunner,
  get cache() { return cache ??= createStoryCache(); },
};
let cache: ReturnType<typeof createStoryCache> | undefined;

const handledFolders = new Set<string>();
export async function handleStoryCommandUrl(folder: string, dependencies = storyCommandDependencies) {
  // A cold launch can see the same URL as the initial URL and as an open event.
  if (handledFolders.has(folder)) return;
  handledFolders.add(folder);
  const write = (name: string, text: string) => files.writeText(`${folder}/${name}`, text);
  if (!await files.exists(`${folder}/request`)) return;
  await write("started", "");
  const progress: string[] = [];
  const report = (message: string) => { progress.push(message); void write("progress", `${progress.join("\n")}\n`).catch(() => {}); };
  const controller = new AbortController();
  const poll = setInterval(() => {
    void files.exists(`${folder}/cancel`).then(cancelled => { if (cancelled) controller.abort(); }).catch(() => {});
  }, 500);
  let exitCode = 0;
  try {
    const { cwd, args } = parseStoryCommandRequest(await files.readText(`${folder}/request`));
    const options = parseStoryCommandArgs(args);
    if (options.help) await write("stdout", storyCommandHelp);
    else {
      const output = await runStoryCommand(cwd, options, dependencies, { signal: controller.signal, onProgress: report });
      if (options.out) {
        const path = options.out.startsWith("/") ? options.out : `${cwd.replace(/\/+$/, "")}/${options.out}`;
        await files.writeText(path, output.text);
        report(`Wrote ${path}`);
      } else await write("stdout", output.text);
      report(`Cached for Diff (${output.result.tool}, ${output.result.model}).`);
    }
  } catch (error) {
    exitCode = error instanceof StoryCommandError ? error.exitCode : 1;
    await write("stderr", `${error instanceof Error ? error.message : String(error)}\n`).catch(() => {});
  } finally {
    clearInterval(poll);
    await write("exit", String(exitCode)).catch(() => {});
  }
}
