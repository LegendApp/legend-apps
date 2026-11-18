import { parseConflictRegions } from "@legend-apps/git-core";

/**
 * The Result editor's text for one conflicted file. `base` is the worktree text the edit began from (what Save checks the
 * file still holds); `stale` means the file changed on disk under unsaved edits, which are kept. A new `version` remounts
 * the editor with `text`.
 */
export type ResultDraft = { path: string; base: string; text: string; version: number; stale: boolean };

/** A UTF-16 range edit, as the source editor reports it. */
export type TextEdit = { offset: number; removedLength: number; insertedText: string };

export const applyTextEdit = (text: string, edit: TextEdit) =>
  text.slice(0, edit.offset) + edit.insertedText + text.slice(edit.offset + edit.removedLength);

export const draftDirty = (draft: ResultDraft | null | undefined) => !!draft && draft.text !== draft.base;

/**
 * The draft after the worktree file of `path` was read as `disk`. Another file, or the same one without edits, starts over
 * from the disk text. Edits survive a reread of unchanged text (the watcher's refreshes) and a save that wrote `saving`; a
 * file that changed under them keeps them and is marked stale, so Save refuses until Revert.
 */
export function syncDraft(draft: ResultDraft | null, path: string, disk: string, saving: string | null = null): ResultDraft {
  const version = (draft?.version ?? 0) + 1;
  if (!draft || draft.path !== path) return { path, base: disk, text: disk, version, stale: false };
  if (disk === draft.base) return draft.stale ? { ...draft, stale: false } : draft;
  if (disk === draft.text || disk === saving) return { ...draft, base: disk, stale: false };
  if (!draftDirty(draft)) return { path, base: disk, text: disk, version, stale: false };
  return draft.stale ? draft : { ...draft, stale: true };
}

export type ResultLineKind = "marker" | "ours" | "base" | "theirs";

/** Each line's place in the conflict regions of `text` (undefined outside them); none when the markers are malformed. */
export function resultLineKinds(text: string, size = 7): (ResultLineKind | undefined)[] {
  const kinds: (ResultLineKind | undefined)[] = [];
  for (const region of parseConflictRegions(text, size) ?? []) {
    let line = region.start;
    const mark = (kind: ResultLineKind, count: number) => { for (let end = line + count; line < end; line += 1) kinds[line] = kind; };
    mark("marker", 1); mark("ours", region.ours.length);
    if (region.base) { mark("marker", 1); mark("base", region.base.length); }
    mark("marker", 1); mark("theirs", region.theirs.length); mark("marker", 1);
  }
  return kinds;
}

/** A small store for the window's draft: App reads it when guarding actions, the Result view subscribes to it. */
export function createResultDraftStore() {
  let draft: ResultDraft | null = null, saving: string | null = null;
  const listeners = new Set<() => void>();
  const set = (next: ResultDraft | null) => { if (next !== draft) { draft = next; for (const listener of listeners) listener(); } };
  return {
    get: () => draft,
    subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
    sync(path: string, disk: string) { set(syncDraft(draft, path, disk, saving)); },
    edit(version: number, edit: TextEdit) { if (draft && draft.version === version) set({ ...draft, text: applyTextEdit(draft.text, edit) }); },
    /** Drops unsaved edits; the editor shows the text the edit began from (or `disk`, the file as it is now). */
    revert(disk?: string) { if (draft) set({ ...draft, base: disk ?? draft.base, text: disk ?? draft.base, version: draft.version + 1, stale: false }); },
    clear() { set(null); },
    /** Runs `save` for the current text; a reread that returns that text while it runs counts as saved. */
    async save(write: (draft: ResultDraft) => Promise<boolean>) {
      const current = draft;
      if (!current) return false;
      saving = current.text;
      try {
        const saved = await write(current);
        if (saved && draft?.path === current.path) set({ ...draft, base: current.text, stale: false });
        return saved;
      } finally { saving = null; }
    },
  };
}
export type ResultDraftStore = ReturnType<typeof createResultDraftStore>;
