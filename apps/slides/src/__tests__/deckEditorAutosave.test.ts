// @ts-ignore Bun's test module is supplied by the test runner.
import { expect, test } from "bun:test";
import { createDeckEditorSession } from "../deckEditorSession";
import { createDeckEditorAutosave } from "../deckEditorAutosave";

function fixture(write?: (expected: string, source: string) => Promise<boolean>) {
  let disk = "original";
  const writes: string[] = [];
  const session = createDeckEditorSession({
    read: async () => disk,
    write: async (_path, expected, source) => {
      writes.push(source);
      const ok = write ? await write(expected, source) : expected === disk;
      if (ok) disk = source;
      return ok;
    },
    preview: async () => true, invalidate() {}, opened() {},
  });
  const autosave = createDeckEditorAutosave(session, 10);
  return { session, autosave, writes, disk: () => disk, dispose() { autosave.dispose(); session.dispose(); } };
}

test("autosave coalesces edits and writes without an explicit save", async () => {
  const f = fixture();
  try {
    await f.session.open("deck.mdx");
    f.session.edit("first", 1);
    f.session.edit("latest", 2);
    await new Promise(resolve => setTimeout(resolve, 40));
    expect(f.writes).toEqual(["latest"]);
    expect(f.disk()).toBe("latest");
    expect(f.session.getSnapshot().dirty).toBe(false);
  } finally { f.dispose(); }
});

test("leaving editing flushes pending changes and drains edits arriving during a write", async () => {
  const completions: Array<(ok: boolean) => void> = [];
  const f = fixture(() => new Promise(resolve => completions.push(resolve)));
  try {
    await f.session.open("deck.mdx");
    f.session.edit("first", 1);
    const leaving = f.autosave.flush();
    f.session.edit("latest", 2);
    expect(f.autosave.flush()).toBe(leaving);
    completions.shift()!(true);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(f.writes).toEqual(["first", "latest"]);
    completions.shift()!(true);
    expect(await leaving).toBe(true);
    expect(f.disk()).toBe("latest");
    expect(f.session.getSnapshot().dirty).toBe(false);
  } finally { f.dispose(); }
});

test("a rejected write preserves the draft and prevents exit without retrying forever", async () => {
  const f = fixture(async () => false);
  try {
    await f.session.open("deck.mdx");
    f.session.edit("draft", 1);
    expect(await f.autosave.flush()).toBe(false);
    expect(f.disk()).toBe("original");
    expect(f.session.getSnapshot().dirty).toBe(true);
    expect(f.session.getSnapshot().conflict).toBe(true);
    await new Promise(resolve => setTimeout(resolve, 30));
    expect(f.writes).toEqual(["draft"]);
  } finally { f.dispose(); }
});

test("disposing cancels a pending debounce", async () => {
  const f = fixture();
  await f.session.open("deck.mdx");
  f.session.edit("draft", 1);
  f.dispose();
  await new Promise(resolve => setTimeout(resolve, 30));
  expect(f.writes).toEqual([]);
});
