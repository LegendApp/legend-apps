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
