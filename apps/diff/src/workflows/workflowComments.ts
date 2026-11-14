import type { StoryHunk } from "../story/storyHunks";
import { storyRefError } from "../story/storyContract";
import type { WorkflowComment } from "./workflowContract";

export type AnchoredWorkflowComment = WorkflowComment & { outdated: boolean };
export function reanchorWorkflowComments(comments: readonly WorkflowComment[], original: readonly StoryHunk[], current: readonly StoryHunk[]): AnchoredWorkflowComment[] {
  const byId = new Map(original.map(hunk => [hunk.id, hunk]));
  const byHash = new Map<string, StoryHunk[]>();
  for (const hunk of current) byHash.set(hunk.hash, [...(byHash.get(hunk.hash) ?? []), hunk]);
  return comments.map(comment => {
    const before = byId.get(comment.ref.hunk);
    if (!before || storyRefError(comment.ref, before)) return { ...comment, outdated: true };
    const candidates = (byHash.get(before.hash) ?? []).filter(hunk => hunk.file === before.file);
    const after = candidates.length === 1 ? candidates[0] : undefined;
    if (!after) return { ...comment, outdated: true };
    const offset = comment.ref.side === "old" ? after.oldStart - before.oldStart : after.newStart - before.newStart;
    const ref = { ...comment.ref, hunk: after.id, startLine: comment.ref.startLine + offset, endLine: comment.ref.endLine + offset };
    return storyRefError(ref, after) ? { ...comment, outdated: true } : { ...comment, ref, outdated: false };
  });
}
