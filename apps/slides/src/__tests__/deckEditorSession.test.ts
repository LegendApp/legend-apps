// @ts-ignore Bun's test module is supplied by the test runner.
import { describe, expect, it } from "bun:test";
import { createDeckEditorSession } from "../deckEditorSession";

function fixture() {
  let disk = "# One\n\n---\n\n# Two";
  const previews: string[] = [];
  const session = createDeckEditorSession({
    read: async () => disk,
    write: async (_path, expected, source) => { if (disk !== expected) return false; disk = source; return true; },
    preview: async (_path, source) => { previews.push(source); return !source.includes("broken"); },
    invalidate() {}, opened() {},
  });
  return { session, previews, disk: () => disk, external: (source: string) => { disk = source; } };
}

describe("deck source editing", () => {
  it("journals native edits without reconstructing drafts until preview or save", async () => {
    const f = fixture(); await f.session.open("deck.mdx");
    const original = f.session.getSnapshot().source;
    f.session.applyEdit({ offset: 2, removedLength: 3, insertedText: "New", revision: 1 });
    f.session.applyEdit({ offset: 5, removedLength: 0, insertedText: " title", revision: 2 });
    expect(f.session.getSnapshot().source).toBe(original);
    expect(f.session.getSnapshot().dirty).toBe(true);
    await f.session.ensurePreview();
    expect(f.previews.at(-1)).toBe(original.replace("One", "New title"));
    f.session.applyEdit({ offset: 0, removedLength: 0, insertedText: "Intro\n", revision: 3 });
    expect(await f.session.save()).toBe(true);
    expect(f.disk()).toBe("Intro\n" + original.replace("One", "New title"));
    expect(f.session.getSnapshot().dirty).toBe(false);
    f.session.dispose();
  });
  it("gets slide boundaries only from the background preview, not caret motion or each native event", async () => {
    let scans = 0;
    const session = createDeckEditorSession({
      read: async () => "# One\n---\n# Two", write: async () => true,
      preview: async (_path, source) => { ++scans; return { success: true, slideEnds: [source.indexOf("---"), source.length] }; },
      invalidate() {}, opened() {},
    });
    await session.open("deck.mdx");
    const initialScans = scans;
    for (let i = 0; i < 100; ++i) session.select(i);
    session.applyEdit({ offset: 0, removedLength: 0, insertedText: "x", revision: 1 });
    session.applyEdit({ offset: 0, removedLength: 0, insertedText: "y", revision: 2 });
    expect(scans).toBe(initialScans);
    await session.ensurePreview();
    expect(scans).toBe(initialScans + 1);
    expect(session.getSnapshot().slideEnds).toEqual([8, 17]);
    session.dispose();
  });
  it("discards stale preview indexes and retains the last useful index after a failed scan", async () => {
    let finish!: (result: { success: boolean; slideEnds?: number[] }) => void;
    let first = true;
    const session = createDeckEditorSession({
      read: async () => "# One\n---\n# Two", write: async () => true,
      preview: async () => {
        if (first) { first = false; return { success: true, slideEnds: [6, 15] }; }
        return new Promise((resolve) => { finish = resolve; });
      },
      invalidate() {}, opened() {},
    });
    await session.open("deck.mdx");
    session.applyEdit({ offset: 0, removedLength: 0, insertedText: "x", revision: 1 });
    const stale = session.ensurePreview();
    session.applyEdit({ offset: 0, removedLength: 0, insertedText: "y", revision: 2 });
    finish({ success: true, slideEnds: [123] });
    expect(await stale).toBe(false);
    expect(session.getSnapshot().slideEnds).toEqual([8, 17]);
    const current = session.ensurePreview();
    finish({ success: false });
    expect(await current).toBe(false);
    expect(session.getSnapshot().slideEnds).toEqual([8, 17]);
    session.dispose();
  });
  it("protects pending native edits from refresh and a save completion", async () => {
    let finish!: (value: boolean) => void;
    let disk = "original";
    const session = createDeckEditorSession({ read: async () => disk,
      write: () => new Promise((resolve) => { finish = resolve; }), preview: async () => true, invalidate() {}, opened() {} });
    await session.open("deck.mdx");
    session.applyEdit({ offset: 0, removedLength: 0, insertedText: "a", revision: 1 });
    const saving = session.save();
    session.applyEdit({ offset: 0, removedLength: 0, insertedText: "b", revision: 2 });
    finish(true); await saving;
    expect(session.getSnapshot().dirty).toBe(true);
    disk = "external";
    await session.refresh();
    expect(session.getSnapshot().conflict).toBe(true);
    expect(session.getSnapshot().source).toBe("baoriginal");
    session.dispose();
  });
  it("previews drafts without touching disk and saves explicitly", async () => {
    const f = fixture();
    await f.session.open("deck.mdx");
    f.session.edit("# Draft", 1);
    await f.session.ensurePreview();
    expect(f.previews.at(-1)).toBe("# Draft");
    expect(f.disk()).toContain("# One");
    expect(await f.session.save()).toBe(true);
    expect(f.disk()).toBe("# Draft");
    expect(f.session.getSnapshot().savedSource).toBe("# Draft");
    f.session.dispose();
  });
  it("refuses to overwrite an external edit", async () => {
    const f = fixture(); await f.session.open("deck.mdx");
    f.session.edit("# Draft", 1); f.external("# External");
    expect(await f.session.save()).toBe(false);
    expect(f.disk()).toBe("# External");
    expect(f.session.getSnapshot().source).toBe("# Draft");
    expect(f.session.getSnapshot().conflict).toBe(true);
    f.session.dispose();
  });
  it("recovers preview after temporarily invalid source", async () => {
    const f = fixture(); await f.session.open("deck.mdx");
    f.session.edit("broken", 1); expect(await f.session.ensurePreview()).toBe(false);
    f.session.edit("# Fixed", 2); expect(await f.session.ensurePreview()).toBe(true);
    expect(f.session.getSnapshot().status).toBe("ready");
    f.session.dispose();
  });
  it("ignores a stale file read after switching documents", async () => {
    let finish!: (value: string) => void;
    const session = createDeckEditorSession({
      read: (path) => path === "old" ? new Promise((resolve) => { finish = resolve; }) : Promise.resolve("# New"),
      write: async () => true, preview: async () => true, invalidate() {}, opened() {},
    });
    const old = session.open("old"); await session.open("new"); finish("# Old"); await old;
    expect(session.getSnapshot().source).toBe("# New"); session.dispose();
  });
  it("keeps edits made during an in-flight save dirty", async () => {
    let finish!: (value: boolean) => void;
    const session = createDeckEditorSession({
      read: async () => "# Original",
      write: () => new Promise((resolve) => { finish = resolve; }),
      preview: async () => true, invalidate() {}, opened() {},
    });
    await session.open("deck.mdx"); session.edit("# First", 1);
    const saving = session.save(); session.edit("# Second", 2);
    finish(true); await saving;
    expect(session.getSnapshot().source).toBe("# Second");
    expect(session.getSnapshot().savedSource).toBe("# First");
    session.dispose();
  });
});

it("rechecks disk when a change arrives during the initial read", async () => {
  let finish!: (value: string) => void;
  let reads = 0;
  const previews: string[] = [];
  const session = createDeckEditorSession({
    read: async () => ++reads === 1 ? new Promise<string>((resolve) => { finish = resolve; }) : "# Latest",
    write: async () => true,
    preview: async (_path, source) => { previews.push(source); return true; },
    invalidate() {}, opened() {},
  });
  const opening = session.open("deck.mdx");
  await session.refresh();
  finish("# Stale");
  await opening;
  expect(session.getSnapshot().source).toBe("# Latest");
  expect(previews.at(-1)).toBe("# Latest");
  session.dispose();
});

it("rechecks disk after a save when its notification arrived during the write", async () => {
  let finish!: (value: boolean) => void;
  let disk = "# Original";
  const session = createDeckEditorSession({
    read: async () => disk,
    write: () => new Promise((resolve) => { finish = resolve; }),
    preview: async () => true, invalidate() {}, opened() {},
  });
  await session.open("deck.mdx");
  session.edit("# Saved", 1);
  const saving = session.save();
  disk = "# External after save";
  await session.refresh();
  finish(true);
  await saving;
  expect(session.getSnapshot().source).toBe(disk);
  expect(session.getSnapshot().dirty).toBe(false);
  session.dispose();
});
