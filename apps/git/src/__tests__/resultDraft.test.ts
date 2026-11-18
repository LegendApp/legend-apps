import { applyTextEdit, createResultDraftStore, draftDirty, resultLineKinds, syncDraft } from "../resultDraft";

const text = "<<<<<<< HEAD\r\nmain\r\n||||||| base\r\nbase\r\n=======\r\nfeature\r\n>>>>>>> feature\r\nend";

describe("syncDraft", () => {
  it("starts from the disk text, keeps edits across a reread of unchanged text, and restarts without edits", () => {
    const first = syncDraft(null, "a.ts", text);
    expect(first).toEqual({ path: "a.ts", base: text, text, version: 1, stale: false });
    const edited = { ...first, text: text.replace("main", "both") };
    expect(syncDraft(edited, "a.ts", text)).toBe(edited);
    expect(syncDraft(first, "a.ts", "outside\n")).toEqual({ path: "a.ts", base: "outside\n", text: "outside\n", version: 2, stale: false });
    expect(syncDraft(edited, "b.ts", "b\n")).toEqual({ path: "b.ts", base: "b\n", text: "b\n", version: 2, stale: false });
  });

  it("keeps edits the file changed under and marks them stale, and counts a reread of the saved text as saved", () => {
    const edited = { ...syncDraft(null, "a.ts", text), text: "mine\n" };
    const stale = syncDraft(edited, "a.ts", "outside\n");
    expect(stale).toMatchObject({ text: "mine\n", base: text, stale: true, version: 1 });
    expect(draftDirty(stale)).toBe(true);
    // The file back as the edit began: Save works again.
    expect(syncDraft(stale, "a.ts", text)).toMatchObject({ text: "mine\n", base: text, stale: false });
    expect(syncDraft(edited, "a.ts", "mine\n")).toMatchObject({ text: "mine\n", base: "mine\n", stale: false });
    // A save that wrote "mine\n" while more was typed: the reread is the saved text, the rest stays unsaved.
    const typing = { ...edited, text: "mine\nmore\n" };
    expect(syncDraft(typing, "a.ts", "mine\n", "mine\n")).toMatchObject({ text: "mine\nmore\n", base: "mine\n", stale: false });
  });
});

it("applies UTF-16 range edits without touching other line endings or a missing final newline", () => {
  const next = applyTextEdit(text, { offset: text.indexOf("main"), removedLength: 4, insertedText: "größe 👍" });
  expect(next).toBe(text.replace("main", "größe 👍"));
  expect(next.endsWith("\r\nend")).toBe(true);
  const emoji = next.indexOf("👍");
  expect(applyTextEdit(next, { offset: emoji, removedLength: 2, insertedText: "" })).toBe(text.replace("main", "größe "));
});

it("marks each line of the regions: markers, ours, the ancestor and theirs", () => {
  expect(resultLineKinds(text)).toEqual(["marker", "ours", "marker", "base", "marker", "theirs", "marker"]);
  expect(resultLineKinds("a\n<<<< x\n====\n>>>> y\n", 4)).toEqual([undefined, "marker", "marker", "marker"]);
  expect(resultLineKinds("<<<<<<< x\nunclosed\n")).toEqual([]);
});

describe("the draft store", () => {
  it("edits, reverts and saves only the current version", async () => {
    const store = createResultDraftStore();
    const changes = jest.fn();
    store.subscribe(changes);
    store.sync("a.ts", text);
    store.edit(1, { offset: 0, removedLength: 0, insertedText: "x" });
    store.edit(0, { offset: 0, removedLength: 0, insertedText: "old editor" });
    expect(store.get()?.text).toBe("x" + text);
    store.revert();
    expect(store.get()).toMatchObject({ text, version: 2 });
    store.edit(2, { offset: 0, removedLength: text.length, insertedText: "done\n" });
    const write = jest.fn(async () => { store.sync("a.ts", "done\n"); return true; });
    await expect(store.save(write)).resolves.toBe(true);
    expect(write).toHaveBeenCalledWith(expect.objectContaining({ text: "done\n", base: text }));
    expect(store.get()).toMatchObject({ text: "done\n", base: "done\n", version: 2 });
    expect(changes).toHaveBeenCalled();
  });

  it("keeps the edits when a save is refused", async () => {
    const store = createResultDraftStore();
    store.sync("a.ts", text);
    store.edit(1, { offset: 0, removedLength: 0, insertedText: "x" });
    await expect(store.save(async () => false)).resolves.toBe(false);
    expect(store.get()).toMatchObject({ text: "x" + text, base: text });
    store.revert("disk\n");
    expect(store.get()).toMatchObject({ text: "disk\n", base: "disk\n", stale: false, version: 2 });
  });
});
