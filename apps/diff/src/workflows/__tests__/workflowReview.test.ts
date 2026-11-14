import { fixtureInput } from "../../story/__tests__/storyFixtures";
import { builtInWorkflowSkills } from "../workflowSkills";
import { workflowResult } from "./workflowFixtures";
import { workflowGutterModel, workflowReviewComments } from "../workflowReview";

it("keeps comment identity through shifted lines, removes closed/outdated markers and recovers original anchors", () => {
  const original = fixtureInput(), shifted = fixtureInput({ shift: 15, extra: true });
  const result = { ...workflowResult(builtInWorkflowSkills[0], original), output: { contractVersion: 1 as const, kind: "comments" as const, summary: "Review", comments: [
    { ref: { hunk: "h1", side: "new" as const, startLine: 41, endLine: 41 }, severity: "warn" as const, body: "Check this" },
  ] } };
  const comments = workflowReviewComments("review-risks", result, original, shifted, {});
  expect(comments[0]).toMatchObject({ file: "src/a.ts", outdated: false, ref: { hunk: "h2", startLine: 56 } });
  expect(workflowGutterModel(comments, shifted)["1:new:56"]).toHaveLength(1);
  for (const state of ["resolved", "dismissed"] as const) {
    expect(workflowGutterModel(workflowReviewComments("review-risks", result, original, shifted, { [comments[0].id]: state }), shifted)).toEqual({});
  }
  const outdated = workflowReviewComments("review-risks", result, original, fixtureInput({ text: "changed" }), {});
  expect(outdated[0].outdated).toBe(true);
  expect(workflowGutterModel(outdated, shifted)).toEqual({});
  const recovered = workflowReviewComments("review-risks", result, original, original, {});
  expect(recovered[0]).toMatchObject({ id: comments[0].id, outdated: false, ref: { startLine: 41 } });
});

it("groups overlapping workflows on a line and keeps old and new sides separate", () => {
  const input = fixtureInput();
  const result = { ...workflowResult(builtInWorkflowSkills[0]), output: { contractVersion: 1 as const, kind: "comments" as const, summary: "Review", comments: [
    { ref: { hunk: "h1", side: "old" as const, startLine: 41, endLine: 41 }, severity: "error" as const, body: "Old" },
    { ref: { hunk: "h1", side: "new" as const, startLine: 41, endLine: 41 }, severity: "info" as const, body: "New" },
  ] } };
  const comments = ["first", "second"].flatMap(name => workflowReviewComments(name, result, input, input, {}));
  const gutter = workflowGutterModel(comments, input);
  expect(gutter["0:old:41"]).toHaveLength(2);
  expect(gutter["0:new:41"]).toHaveLength(2);
  expect(gutter["0:new:40"]).toBeUndefined();
});
