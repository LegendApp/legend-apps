import type { StoryHunk } from "./storyHunks";

// Reference and schema primitives shared by story and workflow contracts. Each host owns its story output format.
export type StoryRef = { hunk: string; side?: "old" | "new"; startLine?: number; endLine?: number };
export type StoryIssue = { path: string; message: string; ref: StoryRef };

export type Schema = { type?: "object" | "array" | "string" | "integer" | "boolean"; enum?: readonly unknown[]; const?: unknown;
  properties?: Record<string, Schema>; required?: string[]; additionalProperties?: false; items?: Schema; minLength?: number };

export class StoryValidationError extends Error {
  readonly errors: string[];
  constructor(errors: string[]) { super(errors.join("\n")); this.name = "StoryValidationError"; this.errors = errors; }
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

/** Finds the result JSON object of `kind` in CLI output, skipping surrounding prose and Markdown fences. */
export function extractResultJSON(output: string, kind: string): unknown {
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
