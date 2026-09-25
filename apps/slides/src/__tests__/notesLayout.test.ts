// @ts-nocheck Bun supplies the test API.
import { expect, test } from "bun:test";
import { notesLayout } from "../notesLayout";
import { speakerNotesEditorMarkdown } from "../speakerNoteSteps";

test("step highlighting and following use native paragraph coordinates", () => {
  expect(notesLayout([
    { text: "Intro", y: 0, height: 24 },
    { text: "1.\u2060 Step", y: 40, height: 48 },
    { text: "Wrapped continuation", y: 98, height: 72 },
    { text: "2:\u2060 Step", y: 190, height: 24 },
  ])).toEqual([{ y: 0, height: 40 }, { step: 0, y: 40, height: 150 }, { step: 1, y: 190, height: 24 }]);
});

test("labels inside fenced examples never become step boundaries", () => {
  const markdown = "1: Actual\n\n```\n2: Example\n```\n\n2) Actual";
  const editor = speakerNotesEditorMarkdown(markdown);
  expect(editor).toContain("1:\u2060 Actual");
  expect(editor).toContain("2: Example");
  expect(speakerNotesEditorMarkdown(editor, true)).toBe(markdown);
  expect(notesLayout([{ text: "1:\u2060 Actual", y: 0, height: 20 }, { text: "2: Example", y: 30, height: 20 }]))
    .toEqual([{ step: 0, y: 0, height: 50 }]);
});
