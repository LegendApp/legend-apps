import type { DiffOpenSource } from "../diffFiles";
import { getGitService, type GitReadOptions, type GitService } from "../git/GitService";
import type { StoryInput } from "../story/storyHunks";
import { getStoryCwd } from "../story/storySource";
import type { WorkflowPatch } from "./workflowContract";

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
