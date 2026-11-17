import { checkSchema, extractResultJSON, StoryValidationError, storyRefError, type Schema, type StoryHunk, type StoryIssue, type StoryRef } from "@legend-apps/change-story";

export { StoryValidationError, type StoryIssue, type StoryRef } from "@legend-apps/change-story";

export const storyContractVersion = 1;
export type ChangeStory = {
  contractVersion: 1; kind: "story"; title: string; state: "proposed" | "in-progress" | "delivered" | "blocked";
  risk: { level: "low" | "medium" | "high"; reason: string }; goal: string;
  organization: { mode: "concepts" | "commits"; reason: string };
  sections: { id: string; title: string; description: string; refs: StoryRef[]; commit?: string; lookHere?: boolean }[];
  behaviorChanges: { change: string; before: string; now: string; when: string; why: string }[];
  evidence: { text: string; ran: boolean }[]; notVerified: string[]; decisions: string[];
};
export type StoryCoverage = { file: string; hunkIds: string[] }[];
export type ValidatedStory = { story: ChangeStory; issues: StoryIssue[]; uncovered: StoryCoverage; coveredHunkIds: string[] };

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

export function extractStoryJSON(output: string): unknown {
  return extractResultJSON(output, "story");
}
