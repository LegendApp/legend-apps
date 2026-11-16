import type { DiffFileSummary, DiffRenderRow } from "@legend-apps/diff-parser";
import type { DiffOpenSource } from "../../diffFiles";
import { buildStoryInput } from "../storyHunks";
import type { ChangeStory } from "../storyContract";
import type { StoryRunResult } from "../storyRunner";
import { changeStorySkill } from "../storySkill";

export const patchSource: DiffOpenSource = { kind: "diffFile", label: "sample.patch", value: "/tmp/sample.patch" };
export const repoSource: DiffOpenSource = { kind: "folder", label: "repo", value: "/repo" };
export function fixtureDocument(options: { text?: string; shift?: number; extra?: boolean; crlf?: boolean } = {}) {
  const rows: DiffRenderRow[] = [];
  const files: DiffFileSummary[] = [];
  function file(path: string, oldLine: number, newLine: number, text: string, extraHunk = false) {
    const index = files.length, rowStart = rows.length;
    const append = (hunkIndex: number, oldLineNumber: number, newLineNumber: number, changeType: number, text: string, kind = 2) => rows.push({
      index: rows.length, kind, fileIndex: index, hunkIndex, oldLineNumber, newLineNumber, changeType, text: `${text}${options.crlf ? "\r" : ""}`, tokens: [],
    });
    append(-1, -1, -1, 3, path, 0);
    append(0, oldLine, newLine, 0, "context");
    append(0, oldLine + 1, -1, 2, "before");
    append(0, -1, newLine + 1, 1, text);
    if (extraHunk) { append(1, oldLine + 10, -1, 2, "second before"); append(1, -1, newLine + 10, 1, "second after"); }
    files.push({ index, path, oldPath: path, status: "modified", additions: extraHunk ? 2 : 1, deletions: extraHunk ? 2 : 1,
      rowStart, rowCount: rows.length - rowStart, isBinary: false });
  }
  if (options.extra) file("first.ts", 1, 1, "first");
  file("src/a.ts", 40 + (options.shift ?? 0), 40 + (options.shift ?? 0), options.text ?? "after", true);
  file("generated/api.ts", 1, 1, "generated secret");
  return { rows, files, getFiles: () => files, getPlainRows: (start: number, count: number) => rows.slice(start, start + count) };
}
export function fixtureInput(options: Parameters<typeof fixtureDocument>[0] = {}) { return buildStoryInput(fixtureDocument(options), patchSource); }
export function fixtureStory(refs: ChangeStory["sections"][number]["refs"] = [{ hunk: "h1" }]): ChangeStory {
  return { contractVersion: 1, kind: "story", title: "Improve behavior", state: "proposed", risk: { level: "low", reason: "Local change" }, goal: "Explain changes",
    organization: { mode: "concepts", reason: "One concern" }, sections: [{ id: "s1", title: "A change", description: "Explain **why**.", refs, lookHere: true }],
    behaviorChanges: [{ change: "Response", before: "Before", now: "After", when: "On request", why: "Correctness" }],
    evidence: [{ text: "Review the code", ran: false }], notVerified: ["Runtime"], decisions: ["Use existing helpers"] };
}
export function fixtureResult(input = fixtureInput()): StoryRunResult {
  return { story: fixtureStory(), diffHash: input.diffHash, skillName: changeStorySkill.name, skillHash: changeStorySkill.hash,
    tool: "codex", model: "default", createdAt: 1, issues: [], coveredHunkIds: ["h1"], uncovered: [{ file: "src/a.ts", hunkIds: ["h2"] }, { file: "generated/api.ts", hunkIds: ["h3"] }] };
}
export function memoryStorage() {
  const values = new Map<string, string>();
  return { values, read: jest.fn((path: string) => values.get(path)), write: jest.fn((path: string, value: unknown) => { values.set(path, String(value)); }) };
}
