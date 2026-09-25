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
