import { fixtureInput } from "../../story/__tests__/storyFixtures";
import { reanchorWorkflowComments } from "../workflowComments";
import type { WorkflowComment } from "../workflowContract";

const comment: WorkflowComment = { ref: { hunk: "h1", side: "new", startLine: 41, endLine: 41 }, severity: "warn", body: "Review", suggestion: "replacement" };
it.each(["old", "new"] as const)("reanchors %s lines by content after hunk IDs and line positions change", side => {
  const before = fixtureInput(), after = fixtureInput({ shift: 15, extra: true });
  const result = reanchorWorkflowComments([{ ...comment, ref: { ...comment.ref, side } }], before.hunks, after.hunks);
  expect(result[0]).toMatchObject({ ref: { hunk: "h2", side, startLine: 56, endLine: 56 }, outdated: false });
  expect(comment.ref.startLine).toBe(41);
});
it("marks changed, removed, invalid or ambiguous hunks outdated", () => {
  const before = fixtureInput();
  for (const current of [fixtureInput({ text: "different" }).hunks, [], [before.hunks[0], { ...before.hunks[0], id: "h99" }]]) {
    expect(reanchorWorkflowComments([comment], before.hunks, current)[0]).toMatchObject({ ref: comment.ref, outdated: true });
  }
  expect(reanchorWorkflowComments([{ ...comment, ref: { ...comment.ref, endLine: 500 } }], before.hunks, before.hunks)[0].outdated).toBe(true);
});
