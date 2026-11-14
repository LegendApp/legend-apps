import type { DiffOpenSource } from "../diffFiles";
import { getGitService, type GitReadOptions, type GitService } from "../git/GitService";
import type { StoryInput } from "../story/storyHunks";
import { getStoryCwd } from "../story/storySource";
import type { WorkflowPatch } from "./workflowContract";
import { loadGitFolderDiff, loadUnifiedDiff, type DiffDocument } from "@legend-apps/diff-parser";
import { runCommand } from "@legendapp/spark/processes";
import { decodeProcessText } from "@legend-apps/runtime-utils";
import { isDiffGitSource } from "../diffFiles";
import { readDiffGitSource } from "../git/diffGitSource";
import { buildStoryInput } from "../story/storyHunks";

export function workflowPatchApplyDisabled(output: WorkflowPatch, source: DiffOpenSource, repoRoot: string | undefined, currentHash: string | undefined, applying = false) {
  if (applying) return "Applying…";
  if (!canApplyWorkflowPatch(source, repoRoot)) return "This source is not a repository. Copy the patch to apply it elsewhere.";
  if (!output.patch.trim()) return "This workflow has no proposed changes to apply.";
  if (!currentHash || output.baseDiffHash !== currentHash) return "The base diff changed. Run the workflow again before applying.";
  return null;
}

export async function reloadWorkflowPatchInput(source: DiffOpenSource, settings: { ignoreWhitespaceChanges: boolean; showOnlyHunks: boolean }, signal?: AbortSignal) {
  let document: DiffDocument | undefined;
  async function git(args: string[]) {
    const response = await runCommand({ target: { type: "command", name: "git" }, cwd: "cwd" in source ? source.cwd : source.value,
      args, signal, timeoutMs: 60_000, env: { GIT_OPTIONAL_LOCKS: "0", GIT_TERMINAL_PROMPT: "0" } });
    if (response.aborted || signal?.aborted) throw new Error("Patch apply cancelled.");
    if (response.timedOut || response.exit.type !== "exited" || response.exit.code !== 0) throw new Error(decodeProcessText(response.stderr) || "Unable to reload the original diff.");
    return decodeProcessText(response.stdout);
  }
  try {
    if (source.kind === "folder") {
      const base = source.compareBase;
      const loaded = await loadGitFolderDiff(source.value, 0, { ...settings, compareBaseKind: base?.kind ?? "head", compareBaseRef: base?.kind === "ref" ? base.ref : "", compareUseMergeBase: base?.kind === "ref" ? base.useMergeBase !== false : true });
      document = loaded.document;
    } else if (isDiffGitSource(source)) {
      // This read runs inside the apply transaction, so it must bypass the GitService queue.
      const text = await readDiffGitSource(source, { ...settings, signal }, {
        diff: args => git(["diff", "-z", ...args]),
        showCommit: async (sha, options) => {
          const commit = (await git(["rev-parse", "--verify", "--end-of-options", `${sha}^{commit}`])).trim();
          return git(["show", "-z", "--format=", "--first-parent", "--root", "--patch", "--no-ext-diff", "--no-color", ...(options?.ignoreWhitespaceChanges ? ["--ignore-all-space"] : []), commit, "--"]);
        },
      });
      document = (await loadUnifiedDiff(text, source.label, 0, settings.ignoreWhitespaceChanges)).document;
    } else throw new Error("This source is not a repository.");
    if (signal?.aborted) throw new Error("Patch apply cancelled.");
    return buildStoryInput(document, source);
  } finally { document?.releaseNativeResources(); }
}

export function canApplyWorkflowPatch(source: DiffOpenSource, repoRoot?: string) {
  return getStoryCwd(source, repoRoot) !== undefined;
}
export async function applyWorkflowPatch(output: WorkflowPatch, context: GitReadOptions & {
  source: DiffOpenSource; repoRoot?: string; reloadInput: (signal?: AbortSignal) => Promise<StoryInput>;
}, service?: Pick<GitService, "applyPatch">) {
  const cwd = getStoryCwd(context.source, context.repoRoot);
  if (!cwd) throw new Error("This source is not a repository. Copy the patch to apply it elsewhere.");
  if (!output.patch.trim()) throw new Error("This workflow has no proposed changes to apply.");
  await (service ?? getGitService(cwd)).applyPatch(output.patch, { signal: context.signal, baseDiffHash: output.baseDiffHash,
    readCurrentDiffHash: async signal => (await context.reloadInput(signal)).diffHash });
}
