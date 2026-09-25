// @ts-nocheck Bun supplies the test API.
import { expect, test } from "bun:test";
import { createNotesDrafts } from "../notesDrafts";
import { describeNoteDraft, prepareNotesExit } from "../notesRecovery";

const key = `${JSON.stringify(["/deleted/deck.mdx", 2])}:# Old slide`;
test("orphaned drafts permit exit with a durable recovery copy and identify their source", async () => {
  let disk = { [key]: "Recovered text" };
  const drafts = createNotesDrafts({ read: () => disk, write: value => { disk = value; } });
  expect(describeNoteDraft(key)).toBe("/deleted/deck.mdx — Slide 3");
  expect(await prepareNotesExit(drafts, async affected => {
    expect(affected).toEqual(["/deleted/deck.mdx — Slide 3"]);
    return "keep";
  }, async () => false)).toBe(true);
  expect(createNotesDrafts({ read: () => disk, write() {} }).get(key, "")).toBe("Recovered text");
});

test("cancel and cancelled exports leave the app open and retain the draft", async () => {
  const drafts = createNotesDrafts();
  drafts.update(key, "unsaved", "original");
  expect(await prepareNotesExit(drafts, async () => "cancel", async () => true)).toBe(false);
  expect(await prepareNotesExit(drafts, async () => "export", async () => false)).toBe(false);
  expect(drafts.get(key, "")).toBe("unsaved");
});

test("exports identify the slide and include its text without dropping the local draft", async () => {
  const drafts = createNotesDrafts();
  drafts.update(key, "unsaved", "original");
  let exported;
  expect(await prepareNotesExit(drafts, async () => "export", async contents => {
    exported = contents;
    return true;
  })).toBe(true);
  expect(exported).toContain("/deleted/deck.mdx — Slide 3");
  expect(exported).toContain("unsaved");
  expect(drafts.get(key, "")).toBe("unsaved");
});

test("failure to persist recovery prevents exit", async () => {
  const drafts = createNotesDrafts({ read: () => ({ [key]: "unsaved" }), write() { throw new Error("Disk unavailable"); } });
  await expect(prepareNotesExit(drafts, async () => "keep", async () => true)).rejects.toThrow("Disk unavailable");
});
