// @ts-nocheck Bun supplies the test API.
import { expect, test } from "bun:test";
import { createNotesDrafts } from "../notesDrafts";

test("exit flush drains edits made during a pending save", async () => {
  const drafts = createNotesDrafts();
  const writes = [], completions = [];
  drafts.bind("slide", text => { writes.push(text); return new Promise(resolve => completions.push(resolve)); });
  drafts.update("slide", "first");
  const exiting = drafts.flushAll();
  await Promise.resolve();
  drafts.update("slide", "latest");
  completions.shift()();
  await Promise.resolve();
  expect(writes).toEqual(["first", "latest"]);
  completions.shift()();
  expect(await exiting).toBe(true);
});

test("failed saves survive view removal and restart, then retry", async () => {
  let disk = {};
  const persistence = { read: () => disk, write: value => { disk = value; } };
  const drafts = createNotesDrafts(persistence);
  drafts.bind("slide", async () => { throw new Error("read only"); });
  drafts.update("slide", "unsaved");
  expect(await drafts.flushAll()).toBe(false);
  const restored = createNotesDrafts(persistence);
  expect(restored.get("slide", "old")).toBe("unsaved");
  expect(await restored.flushAll()).toBe(false);
  restored.bind("slide", async () => {});
  expect(await restored.flushAll()).toBe(true);
  expect(disk).toEqual({});
});


test("recovery preserves the editing baseline and advances it between queued writes", async () => {
  let disk = {};
  const persistence = { read: () => disk, write: value => { disk = value; } };
  const drafts = createNotesDrafts(persistence);
  drafts.update("slide", "first", "original");
  const restored = createNotesDrafts(persistence);
  const bases = [];
  restored.bind("slide", async (text, base) => {
    bases.push(base);
    if (text === "first") restored.update("slide", "second", "stale prop");
  });
  expect(await restored.flushAll()).toBe(true);
  expect(bases).toEqual(["original", "first"]);
  expect(disk).toEqual({});
});


test("exit also drains a newly edited slide added while another write is pending", async () => {
  const drafts = createNotesDrafts();
  const completions = [];
  const writes = [];
  for (const key of ["first", "second"]) drafts.bind(key, text => {
    writes.push([key, text]);
    return new Promise(resolve => completions.push(resolve));
  });
  drafts.update("first", "first notes", "");
  let finished = false;
  const exiting = drafts.flushAll().then(result => { finished = true; return result; });
  await Promise.resolve();
  drafts.update("second", "second notes", "");
  completions.shift()();
  // Let the next batch start without resolving its disk write.
  for (let i = 0; i < 10; i++) await Promise.resolve();
  expect(writes).toEqual([["first", "first notes"], ["second", "second notes"]]);
  expect(finished).toBe(false);
  completions.shift()();
  expect(await exiting).toBe(true);
  expect(drafts.entries()).toEqual([]);
});

test("a new slide with a failed save rejects exit and keeps its draft", async () => {
  const drafts = createNotesDrafts();
  drafts.bind("first", async () => { drafts.update("second", "unsaved", ""); });
  drafts.bind("second", async () => { throw new Error("read only"); });
  drafts.update("first", "notes", "");
  expect(await drafts.flushAll()).toBe(false);
  expect(drafts.get("second", "")).toBe("unsaved");
});
