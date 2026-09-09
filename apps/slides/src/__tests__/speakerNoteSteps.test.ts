// @ts-nocheck This suite uses Bun test globals.
import { expect, test } from "bun:test";
import { speakerNoteOpacity, splitSpeakerNoteSteps } from "../speakerNoteSteps";

test("numbered notes follow one-based steps in both navigation directions", () => {
  const sections = splitSpeakerNoteSteps("General reminder.\n\n1: Start calmly.\nContinue here.\n\n2. Turn up the glass.\n\n3) Land the joke.");
  expect(sections.map((section) => section.step)).toEqual([undefined, 0, 1, 2]);
  expect(sections[1].markdown).toBe("1: Start calmly.\nContinue here.");
  for (const step of [0, 1, 2, 1, 0]) {
    expect(sections.map((section) => speakerNoteOpacity(section, step)))
      .toEqual([1, ...[0, 1, 2].map((index) => index === step ? 1 : 0.75)]);
  }
});

test("timestamps and numbered examples inside code do not create note steps", () => {
  const sections = splitSpeakerNoteSteps("8:10–9:25. Timing.\n\n```text\n1: An example\n```\n\n1: Actual initial step.\n\n~~~\n2: Still code\n~~~\n\n2: Next step.");
  expect(sections.map((section) => section.step)).toEqual([undefined, 0, 1]);
  expect(sections[1].markdown).toContain("2: Still code");
});

test("plain notes remain fully visible and repeated step labels are supported", () => {
  expect(splitSpeakerNoteSteps("")).toEqual([]);
  expect(splitSpeakerNoteSteps("Plain notes.")).toEqual([{ markdown: "Plain notes.", step: undefined }]);
  const sections = splitSpeakerNoteSteps("1: First.\r\n\r\n1: Another thought.\r\n\r\n3: Later.");
  expect(sections.map((section) => speakerNoteOpacity(section, 0))).toEqual([1, 1, 0.75]);
});
