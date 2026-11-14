import type { StoryHunk } from "./storyHunks";

export const storyContractVersion = 1;
export type StoryRef = { hunk: string; side?: "old" | "new"; startLine?: number; endLine?: number };
export type ChangeStory = {
  contractVersion: 1; kind: "story"; title: string; state: "proposed" | "in-progress" | "delivered" | "blocked";
  risk: { level: "low" | "medium" | "high"; reason: string }; goal: string;
  organization: { mode: "concepts" | "commits"; reason: string };
  sections: { id: string; title: string; description: string; refs: StoryRef[]; commit?: string; lookHere?: boolean }[];
  behaviorChanges: { change: string; before: string; now: string; when: string; why: string }[];
  evidence: { text: string; ran: boolean }[]; notVerified: string[]; decisions: string[];
};
export type StoryIssue = { path: string; message: string; ref: StoryRef };
export type StoryCoverage = { file: string; hunkIds: string[] }[];
export type ValidatedStory = { story: ChangeStory; issues: StoryIssue[]; uncovered: StoryCoverage; coveredHunkIds: string[] };

export type Schema = { type?: "object" | "array" | "string" | "integer" | "boolean"; enum?: readonly unknown[]; const?: unknown;
  properties?: Record<string, Schema>; required?: string[]; additionalProperties?: false; items?: Schema; minLength?: number };
const string: Schema = { type: "string" };
const nonempty: Schema = { type: "string", minLength: 1 };
const array = (items: Schema): Schema => ({ type: "array", items });
const object = (properties: Record<string, Schema>, optional: string[] = []): Schema => ({ type: "object", properties,
  required: Object.keys(properties).filter(key => !optional.includes(key)), additionalProperties: false });
const enumeration = (...values: string[]): Schema => ({ type: "string", enum: values });

export const storyContractSchema: Schema = object({
  contractVersion: { const: 1 }, kind: { const: "story" }, title: nonempty,
  state: enumeration("proposed", "in-progress", "delivered", "blocked"),
  risk: object({ level: enumeration("low", "medium", "high"), reason: nonempty }), goal: nonempty,
  organization: object({ mode: enumeration("concepts", "commits"), reason: nonempty }),
  sections: array(object({ id: nonempty, title: nonempty, description: string,
    refs: array(object({ hunk: nonempty, side: enumeration("old", "new"), startLine: { type: "integer" }, endLine: { type: "integer" } }, ["side", "startLine", "endLine"])),
    commit: nonempty, lookHere: { type: "boolean" } }, ["commit", "lookHere"])),
  behaviorChanges: array(object({ change: nonempty, before: string, now: string, when: string, why: string })),
  evidence: array(object({ text: nonempty, ran: { type: "boolean" } })), notVerified: array(string), decisions: array(string),
});

export class StoryValidationError extends Error {
  constructor(public readonly errors: string[]) { super(errors.join("\n")); this.name = "StoryValidationError"; }
}

export function checkSchema(value: unknown, schema: Schema, path: string, errors: string[]) {
  if (schema.const !== undefined && value !== schema.const) errors.push(`${path}: expected ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: expected ${schema.enum.join(" | ")}`);
  if (schema.type === "object") {
    if (!value || typeof value !== "object" || Array.isArray(value)) { errors.push(`${path}: expected object`); return; }
    const record = value as Record<string, unknown>;
    for (const key of schema.required ?? []) if (!Object.hasOwn(record, key)) errors.push(`${path}.${key}: required`);
    for (const key of Object.keys(record)) {
      if (Object.hasOwn(schema.properties!, key)) checkSchema(record[key], schema.properties![key], `${path}.${key}`, errors);
      else errors.push(`${path}.${key}: unexpected property`);
    }
  } else if (schema.type === "array") {
    if (!Array.isArray(value)) errors.push(`${path}: expected array`);
    else value.forEach((item, i) => checkSchema(item, schema.items!, `${path}[${i}]`, errors));
  } else if (schema.type === "integer") {
    if (!Number.isSafeInteger(value)) errors.push(`${path}: expected integer`);
  } else if (schema.type && typeof value !== schema.type) errors.push(`${path}: expected ${schema.type}`);
  else if (schema.minLength && typeof value === "string" && value.trim().length < schema.minLength) errors.push(`${path}: must not be empty`);
}

export function storyRefError(ref: StoryRef, hunk: StoryHunk | undefined): string | undefined {
  if (!hunk) return `Unknown hunk ID: ${ref.hunk}`;
  if (ref.side === undefined && ref.startLine === undefined && ref.endLine === undefined) return;
  if (!ref.side || ref.startLine === undefined || ref.endLine === undefined) return "A line range requires side, startLine and endLine";
  const start = ref.side === "old" ? hunk.oldStart : hunk.newStart;
  const count = ref.side === "old" ? hunk.oldLines : hunk.newLines;
  if (!count || ref.startLine < start || ref.endLine < ref.startLine || ref.endLine >= start + count) return `Line range outside ${ref.hunk} (${ref.side}: ${start}–${start + count - 1})`;
}

export function validateStory(value: unknown, hunks: readonly StoryHunk[]): ValidatedStory {
  const errors: string[] = [];
  checkSchema(value, storyContractSchema, "$", errors);
  if (errors.length) throw new StoryValidationError(errors);
  const candidate = value as ChangeStory;
  const ids = new Set<string>();
  for (const section of candidate.sections) {
    if (ids.has(section.id)) errors.push(`Duplicate section ID: ${section.id}`);
    ids.add(section.id);
  }
  if (errors.length) throw new StoryValidationError(errors);
  const byId = new Map(hunks.map(hunk => [hunk.id, hunk]));
  const covered = new Set<string>();
  const issues: StoryIssue[] = [];
  const story = { ...candidate, sections: candidate.sections.map((section, i) => ({ ...section, refs: section.refs.filter((ref, j) => {
    const message = storyRefError(ref, byId.get(ref.hunk));
    if (message) { issues.push({ path: `$.sections[${i}].refs[${j}]`, message, ref }); return false; }
    covered.add(ref.hunk);
    return true;
  }) })) };
  const uncovered = new Map<string, string[]>();
  for (const hunk of hunks) if (!covered.has(hunk.id)) {
    if (!uncovered.has(hunk.file)) uncovered.set(hunk.file, []);
    uncovered.get(hunk.file)!.push(hunk.id);
  }
  return { story, issues, uncovered: [...uncovered].map(([file, hunkIds]) => ({ file, hunkIds })), coveredHunkIds: [...covered] };
}

export function extractStoryJSON(output: string, kind = "story"): unknown {
  const candidates = [output.trim(), ...Array.from(output.matchAll(/```(?:json)?\s*\n?([\s\S]*?)```/gi), match => match[1].trim())];
  // Balance braces outside strings so surrounding CLI prose and braces in Markdown are safe.
  let start = 0, depth = 0, quoted = false, escaped = false;
  for (let i = 0; i < output.length; i++) {
    const char = output[i];
    if (quoted) { if (escaped) escaped = false; else if (char === "\\") escaped = true; else if (char === '"') quoted = false; }
    else if (depth && char === '"') quoted = true;
    else if (char === "{") { if (!depth) start = i; depth++; }
    else if (char === "}" && depth && --depth === 0) candidates.push(output.slice(start, i + 1));
  }
  for (const candidate of candidates) {
    try {
      const parsed: unknown = JSON.parse(candidate);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed) && (parsed as Record<string, unknown>).kind === kind) return parsed;
    } catch { /* Try the next JSON candidate. */ }
  }
  throw new StoryValidationError([`No valid ${kind} JSON object found in the model output`]);
}
