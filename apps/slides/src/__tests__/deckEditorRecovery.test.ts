// @ts-nocheck Bun supplies the test API.
import { expect, test } from "bun:test";
import { createDeckEditorSession } from "../deckEditorSession";
import { saveDeckDraftCopy } from "../deckEditorRecovery";

function fixture() {
  let disk = "# Original";
  let unreadable = false;
  const session = createDeckEditorSession({
    read: async () => { if (unreadable) throw new Error("File missing"); return disk; },
    write: async (_path, expected, source) => { if (expected !== disk) return false; disk = source; return true; },
    preview: async () => true, invalidate() {}, opened() {},
  });
  return { session, changeDisk(value) { disk = value; }, failRead() { unreadable = true; } };
}

test("a conflicting incremental draft can be copied and then reloaded", async () => {
  const { session, changeDisk } = fixture();
  try {
    await session.open("/deck.mdx");
    session.applyEdit({ offset: 2, removedLength: 8, insertedText: "Local", revision: 1 });
    changeDisk("# External");
    expect(await session.save()).toBe(false);
    const writes = [];
    expect(await saveDeckDraftCopy(session, async () => "/copy.mdx", async (path, text) => writes.push([path, text]))).toBe(true);
    expect(writes).toEqual([["/copy.mdx", "# Local"]]);
    expect(session.getSnapshot().dirty).toBe(true);
    await session.reloadFromDisk();
    expect(session.getSnapshot()).toMatchObject({ source: "# External", dirty: false, conflict: false, error: "" });
  } finally { session.dispose(); }
});

test("cancelled export and selecting the original path never write", async () => {
  const { session } = fixture();
  try {
    await session.open("/deck.mdx");
    const write = async () => { throw new Error("Unexpected write"); };
    expect(await saveDeckDraftCopy(session, async () => null, write)).toBe(false);
    await expect(saveDeckDraftCopy(session, async () => "/deck.mdx", write)).rejects.toThrow("different file");
  } finally { session.dispose(); }
});

test("reload failure preserves the local draft", async () => {
  const { session, failRead } = fixture();
  try {
    await session.open("/deck.mdx");
    session.edit("# Unsaved", 1);
    failRead();
    await expect(session.reloadFromDisk()).rejects.toThrow("File missing");
    expect(session.getSnapshot()).toMatchObject({ source: "# Unsaved", dirty: true });
  } finally { session.dispose(); }
});
