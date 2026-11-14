import { checkSchema, storyRefError, StoryValidationError, type Schema, type StoryIssue, type StoryRef } from "../story/storyContract";
import type { StoryHunk } from "../story/storyHunks";

export type WorkflowKind = "check" | "comments" | "patch";
export type WorkflowLineRef = Required<StoryRef>;
type Envelope<K extends WorkflowKind> = { contractVersion: 1; kind: K; summary: string };
export type WorkflowCheck = Envelope<"check"> & { result: "pass" | "fail" | "warn"; reasons: { text: string; refs?: StoryRef[] }[] };
export type WorkflowComment = { ref: WorkflowLineRef; severity: "info" | "warn" | "error"; body: string; suggestion?: string };
export type WorkflowComments = Envelope<"comments"> & { comments: WorkflowComment[] };
export type WorkflowPatch = Envelope<"patch"> & { description: string; patch: string; baseDiffHash: string };
export type WorkflowOutput = WorkflowCheck | WorkflowComments | WorkflowPatch;
export type ValidatedWorkflow = { output: WorkflowOutput; issues: StoryIssue[] };

const text: Schema = { type: "string" };
const nonempty: Schema = { type: "string", minLength: 1 };
const array = (items: Schema): Schema => ({ type: "array", items });
const object = (properties: Record<string, Schema>, optional: string[] = []): Schema => ({ type: "object", properties,
  required: Object.keys(properties).filter(key => !optional.includes(key)), additionalProperties: false });
const choice = (...values: string[]): Schema => ({ type: "string", enum: values });
const refFields = { hunk: nonempty, side: choice("old", "new"), startLine: { type: "integer" } as Schema, endLine: { type: "integer" } as Schema };
const envelope = (kind: WorkflowKind) => ({ contractVersion: { const: 1 }, kind: { const: kind }, summary: nonempty });
export const workflowContractSchemas: Record<WorkflowKind, Schema> = {
  check: object({ ...envelope("check"), result: choice("pass", "fail", "warn"),
    reasons: array(object({ text: nonempty, refs: array(object(refFields, ["side", "startLine", "endLine"])) }, ["refs"])) }),
  comments: object({ ...envelope("comments"), comments: array(object({ ref: object(refFields), severity: choice("info", "warn", "error"), body: nonempty, suggestion: text }, ["suggestion"])) }),
  patch: object({ ...envelope("patch"), description: nonempty, patch: text, baseDiffHash: nonempty }),
};

export function validateWorkflow(value: unknown, kind: WorkflowKind, hunks: readonly StoryHunk[]): ValidatedWorkflow {
  const errors: string[] = [];
  checkSchema(value, workflowContractSchemas[kind], "$", errors);
  if (errors.length) throw new StoryValidationError(errors);
  const candidate = value as WorkflowOutput;
  if (candidate.kind === "patch") {
    if (!/^sha256:[a-f0-9]{64}$/.test(candidate.baseDiffHash)) throw new StoryValidationError(["$.baseDiffHash: expected a sha256 diff hash"]);
    return { output: candidate, issues: [] };
  }
  const byId = new Map(hunks.map(hunk => [hunk.id, hunk]));
  const issues: StoryIssue[] = [];
  function valid(ref: StoryRef, path: string) {
    const message = storyRefError(ref, byId.get(ref.hunk));
    if (message) issues.push({ path, message, ref });
    return !message;
  }
  const output: WorkflowOutput = candidate.kind === "check"
    ? { ...candidate, reasons: candidate.reasons.map((reason, i) => ({ ...reason, ...(reason.refs ? {
      refs: reason.refs.filter((ref, j) => valid(ref, `$.reasons[${i}].refs[${j}]`)),
    } : {}) })) }
    : { ...candidate, comments: candidate.comments.filter((comment, i) => valid(comment.ref, `$.comments[${i}].ref`)) };
  return { output, issues };
}
