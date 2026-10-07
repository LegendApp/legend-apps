// @ts-nocheck Bun supplies the test API.
import { expect, test } from "bun:test";
import { createNotesDrafts } from "../notesDrafts";
import { describeNoteDraft, prepareNotesExit } from "../notesRecovery";

const key = `${JSON.stringify(["/deleted/deck.mdx", 2])}:# Old slide`;
test("closing another deck leaves unopened recovered drafts on disk without prompting", async () => {
  let disk = { [key]: { text: "Recovered text", base: "original" } };
  const persistence = { read: () => disk, write: value => { disk = value; } };
  const drafts = createNotesDrafts(persistence);
  const activeKey = `${JSON.stringify(["/open/deck.mdx", 0])}:# Current slide`;
  drafts.bind(activeKey, async () => {});
  drafts.update(activeKey, "current notes", "");
  const choose = async () => { throw new Error("Unopened deck must not prompt"); };
  expect(await prepareNotesExit(drafts, choose, async () => false)).toBe(true);
  expect(disk).toEqual({ [key]: { text: "Recovered text", base: "original" } });
  expect(await prepareNotesExit(createNotesDrafts(persistence), choose, async () => false)).toBe(true);
});

test("recovery prompts and exports only session drafts while preserving unopened ones", async () => {
  let disk = { [key]: { text: "Recovered text", base: "original" } };
  const drafts = createNotesDrafts({ read: () => disk, write: value => { disk = value; } });
  const activeKey = `${JSON.stringify(["/open/deck.mdx", 0])}:# Current slide`;
  drafts.bind(activeKey, async () => { throw new Error("Read only"); });
  drafts.update(activeKey, "current notes", "");
  expect(await prepareNotesExit(drafts, async affected => {
    expect(affected).toEqual(["/open/deck.mdx — Slide 1"]);
    return "export";
  }, async contents => {
    expect(contents).toContain("current notes");
    expect(contents).not.toContain("Recovered text");
    return true;
  })).toBe(true);
  expect(disk[key]).toEqual({ text: "Recovered text", base: "original" });
  expect(disk[activeKey].text).toBe("current notes");
});

test("opened recovered drafts permit exit with a durable copy and identify their source", async () => {
  let disk = { [key]: "Recovered text" };
  const drafts = createNotesDrafts({ read: () => disk, write: value => { disk = value; } });
  drafts.bind(key, async () => { throw new Error("Deck missing"); });
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
  drafts.bind(key, async () => { throw new Error("Deck missing"); });
  await expect(prepareNotesExit(drafts, async () => "keep", async () => true)).rejects.toThrow("Disk unavailable");
});

test("retry saves the latest draft after a temporary failure before allowing exit", async () => {
  let disk = {};
  const drafts = createNotesDrafts({ read: () => disk, write: value => { disk = value; } });
  const writes = [];
  drafts.bind(key, async (text, base) => {
    writes.push([text, base]);
    if (writes.length === 1) throw new Error("Temporarily unavailable");
  });
  drafts.update(key, "first edit", "original");
  let prompts = 0;
  expect(await prepareNotesExit(drafts, async affected => {
    prompts++;
    expect(affected).toEqual(["/deleted/deck.mdx — Slide 3"]);
    drafts.update(key, "latest edit", "original");
    return "retry";
  }, async () => { throw new Error("Retry must not export notes"); })).toBe(true);
  expect(writes).toEqual([["first edit", "original"], ["latest edit", "original"]]);
  expect(prompts).toBe(1);
  expect(drafts.sessionEntries()).toEqual([]);
  expect(disk).toEqual({});
});

test("a failed retry prompts for only remaining drafts and cancel keeps the app open", async () => {
  const drafts = createNotesDrafts();
  const otherKey = `${JSON.stringify(["/other/deck.mdx", 0])}:# Other slide`;
  let firstAvailable = false;
  drafts.bind(key, async () => { if (!firstAvailable) throw new Error("Unavailable"); });
  drafts.bind(otherKey, async () => { throw new Error("Read only"); });
  drafts.update(key, "first notes", "original");
  drafts.update(otherKey, "remaining notes", "original");
  let prompts = 0;
  expect(await prepareNotesExit(drafts, async affected => {
    prompts++;
    if (prompts === 1) {
      expect(affected).toEqual(["/deleted/deck.mdx — Slide 3", "/other/deck.mdx — Slide 1"]);
      firstAvailable = true;
      return "retry";
    }
    expect(affected).toEqual(["/other/deck.mdx — Slide 1"]);
    return "cancel";
  }, async () => false)).toBe(false);
  expect(prompts).toBe(2);
  expect(drafts.get(key, "saved")).toBe("saved");
  expect(drafts.get(otherKey, "")).toBe("remaining notes");
});
