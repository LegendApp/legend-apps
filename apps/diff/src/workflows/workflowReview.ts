import type { Observable } from "@legendapp/state";
import type { StoryInput } from "../story/storyHunks";
import type { WorkflowRunResult } from "./workflowRunner";
import { reanchorWorkflowComments, type AnchoredWorkflowComment } from "./workflowComments";

export type WorkflowReviewComment = AnchoredWorkflowComment & { id: string; skillName: string; file: string; state: "open" | "resolved" | "dismissed" };
export type WorkflowGutter = { comments$: Observable<Record<string, WorkflowReviewComment[]>>; onOpen: (comment: WorkflowReviewComment) => void };
export function workflowReviewComments(skillName: string, result: WorkflowRunResult, original: StoryInput, current: StoryInput, states: Record<string, WorkflowReviewComment["state"]>) {
  if (result.output.kind !== "comments") return [];
  const originalComments = result.output.comments;
  return reanchorWorkflowComments(originalComments, original.hunks, current.hunks).map((comment, index): WorkflowReviewComment => {
    const id = `${skillName}:${result.diffHash}:${result.skillHash}:${result.createdAt}:${index}`;
    const file = original.hunks.find(hunk => hunk.id === originalComments[index].ref.hunk)?.file ?? "";
    return { ...comment, id, skillName, state: states[id] ?? "open", file };
  });
}
export function workflowGutterModel(comments: WorkflowReviewComment[], input: StoryInput) {
  const byLine: Record<string, WorkflowReviewComment[]> = {};
  const hunks = new Map(input.hunks.map(hunk => [hunk.id, hunk]));
  for (const comment of comments) {
    if (comment.outdated || comment.state !== "open") continue;
    const hunk = hunks.get(comment.ref.hunk);
    if (!hunk) continue;
    const key = `${hunk.fileIndex}:${comment.ref.side}:${comment.ref.startLine}`;
    (byLine[key] ??= []).push(comment);
  }
  return byLine;
}
