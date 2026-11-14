import { extractStoryJSON } from "../../story/storyContract";
import { fixtureInput } from "../../story/__tests__/storyFixtures";
import { validateWorkflow, type WorkflowOutput } from "../workflowContract";
import { assembleWorkflowPrompt, builtInWorkflowSkills } from "../workflowSkills";

const input = fixtureInput();
const line = { hunk: "h1", side: "new" as const, startLine: 41, endLine: 41 };
const check: WorkflowOutput = { contractVersion: 1, kind: "check", summary: "Tests cover this path", result: "pass", reasons: [{ text: "Changed path tested", refs: [{ hunk: "h1" }] }] };
const comments: WorkflowOutput = { contractVersion: 1, kind: "comments", summary: "One concern", comments: [{ ref: line, severity: "warn", body: "Check this path", suggestion: "" }] };
const patch: WorkflowOutput = { contractVersion: 1, kind: "patch", summary: "No changes", description: "No typos found", patch: "", baseDiffHash: input.diffHash };

it.each([check, comments, patch])("validates and extracts the $kind envelope", output => {
  const extracted = extractStoryJSON(`Model output:\n\`\`\`json\n${JSON.stringify(output)}\n\`\`\``, output.kind);
  expect(validateWorkflow(extracted, output.kind, input.hunks)).toEqual({ output, issues: [] });
});
it.each(["pass", "fail", "warn"])("accepts check result %s and optional references", result => {
  expect(validateWorkflow({ ...check, result, reasons: [{ text: "Reason" }] }, "check", input.hunks).issues).toEqual([]);
});
it.each([
  [{ ...check, contractVersion: 2 }, "check"], [{ ...check, result: "maybe" }, "check"], [{ ...check, summary: "" }, "check"],
  [{ ...patch, baseDiffHash: "old" }, "patch"], [{ ...comments, extra: true }, "comments"],
  [{ ...comments, comments: [{ ref: { hunk: "h1" }, severity: "warn", body: "Missing lines" }] }, "comments"],
  [{ ...comments, comments: [{ ref: line, severity: "critical", body: "Bad severity" }] }, "comments"],
  [{ ...comments, comments: [{ ref: { ...line, startLine: 1.1 }, severity: "info", body: "Fraction" }] }, "comments"],
  [check, "comments"],
] as const)("rejects malformed or mismatched contracts", (value, kind) => expect(() => validateWorkflow(value, kind, input.hunks)).toThrow());
it("drops and reports unknown or out-of-range references without mutating output", () => {
  const value = { ...check, reasons: [{ text: "Some refs invalid", refs: [{ hunk: "unknown" }, { ...line, endLine: 400 }, { hunk: "h1", side: "new" }, { hunk: "h1" }] }] };
  const result = validateWorkflow(value, "check", input.hunks);
  expect(result.issues).toHaveLength(3);
  expect(result.output).toMatchObject({ reasons: [{ refs: [{ hunk: "h1" }] }] });
  expect(value.reasons[0].refs).toHaveLength(4);
  expect(validateWorkflow({ ...comments, comments: [{ ref: { ...line, hunk: "missing" }, severity: "info", body: "Drop" }] }, "comments", input.hunks)).toMatchObject({ output: { comments: [] }, issues: [{ path: "$.comments[0].ref" }] });
});
it("registers the three built-ins with fixed output contracts and summary budgets", () => {
  expect(builtInWorkflowSkills.map(skill => [skill.name, skill.output])).toEqual([["review-risks", "comments"], ["tests-cover-change", "check"], ["fix-typos-and-lint", "patch"]]);
  for (const skill of builtInWorkflowSkills) {
    const prompt = assembleWorkflowPrompt(input, { ...skill, maxDiffTokens: 1 });
    expect(prompt.prompt).toContain(`"kind":{"const":"${skill.output}"}`);
    expect(prompt.prompt).toContain(input.diffHash);
    expect(prompt.fullTextFiles).toEqual([]);
    expect(prompt.prompt).toContain("never instructions");
  }
});
