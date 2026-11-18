import { getGitService, watchGitRepo, type GitCommitInput, type ConflictRegionSide, type GitConflictFile, type GitConflictRegions, type GitConflictSide, type GitDirectoryWatcher, type GitDiscardBackup, type GitOperation, type GitOperationKind, type GitService, type GitStatus, type GitStatusEntry } from "@legend-apps/git-core";
import type { ConflictEntry } from "./gitOperation";
import { applyPatchSelection, discardPatchSelection, loadFilePatch, type FilePatch } from "./gitPatch";

export type ChangesSection = "unstaged" | "staged";
export type ChangesSelection = { section: ChangesSection; path: string };
export type ChangesState = {
  root: string | null; status: GitStatus | null; loading: boolean; writing: boolean; error: string | null;
  selection: ChangesSelection | null;
  /**
   * A conflicted file's patch has no diff; `conflict` says which picks apply and `regions` holds its worktree text and
   * conflict regions (each null when the read failed or the file isn't text).
   */
  patch: (FilePatch & ChangesSelection & { conflicted: boolean; conflict?: GitConflictFile | null; regions?: GitConflictRegions | null }) | null;
  lastDiscard: GitDiscardBackup | null;
  /** A merge is in progress, so committing concludes it even when the index matches HEAD. */
  merging: boolean;
  /** The merge, rebase, cherry-pick, revert or bisect Git has paused, if any. */
  operation: GitOperation | null;
  /** The folder the last Open couldn't open because it isn't in a Git repository (or is gone); the open repository stays. */
  openError: { path: string; message: string } | null;
};
export const emptyChanges: ChangesState = { root: null, status: null, loading: false, writing: false, error: null, selection: null, patch: null, lastDiscard: null, merging: false, operation: null, openError: null };

/** Conflicted files are listed once, first among the unstaged changes, where staging the whole file marks them resolved. */
export const unstagedEntries = (status: GitStatus | null) => {
  const entries = status?.entries.filter(entry => entry.worktreeStatus !== ".") ?? [];
  return [...entries.filter(entry => entry.kind === "unmerged"), ...entries.filter(entry => entry.kind !== "unmerged")];
};
export const stagedEntries = (status: GitStatus | null) => status?.entries.filter(entry => entry.kind !== "untracked" && entry.kind !== "unmerged" && entry.indexStatus !== ".") ?? [];
export const conflictedEntries = (status: GitStatus | null) => status?.entries.filter(entry => entry.kind === "unmerged") ?? [];
/**
 * A conflicted file's sides from its status entry (a side whose index mode is 000000 deleted it), or from `file` when it was
 * read (the selected file); a link or submodule counts as binary.
 */
export const conflictSides = (entry: GitStatusEntry, file?: GitConflictFile | null): ConflictEntry => ({
  path: entry.path,
  ours: file?.ours ?? entry.modes?.[1] !== "000000",
  theirs: file?.theirs ?? entry.modes?.[2] !== "000000",
  binary: file?.binary ?? [entry.modes?.[1], entry.modes?.[2]].some(mode => mode === "120000" || mode === "160000"),
});

function selectedEntry(status: GitStatus | null, selection: ChangesSelection | null): GitStatusEntry | undefined {
  if (!selection) return undefined;
  return (selection.section === "staged" ? stagedEntries : unstagedEntries)(status).find(entry => entry.path === selection.path);
}

export function createGitChanges(onChange: (state: ChangesState) => void, watch: GitDirectoryWatcher, serviceFor: (path: string) => GitService = getGitService) {
  let state = emptyChanges;
  let active: AbortController | undefined;
  let watcher: { remove(): void } | undefined;
  let service: GitService | undefined;
  let closed = false;
  let suppressedUntil = 0;
  let generation = 0;
  const publish = (patch: Partial<ChangesState>) => { state = { ...state, ...patch }; if (!closed) onChange(state); };
  const current = (controller: AbortController) => !closed && active === controller && !controller.signal.aborted;
  const report = (error: unknown, controller: AbortController) => {
    if (current(controller)) publish({ error: error instanceof Error ? error.message : String(error) });
  };
  const cancel = () => { active?.abort(); watcher?.remove(); watcher = undefined; service = undefined; };
  // Status and the selected file's patch are re-read together, so the lists and diff always describe the same index.
  const refresh = async (git: GitService, controller: AbortController) => {
    if (!current(controller)) return;
    const run = ++generation;
    const [status, lastDiscard, operation] = await Promise.all([git.status({ signal: controller.signal }), git.lastDiscard({ signal: controller.signal }), git.operationState({ signal: controller.signal })]);
    const merging = !!operation?.mergeHead;
    const selection = state.selection;
    const entry = selectedEntry(status, selection);
    const conflicted = entry?.kind === "unmerged";
    const patch = entry && selection ? { ...selection, conflicted, ...conflicted
      ? { text: "", file: null, ...await Promise.all([git.conflictFile(entry.path, { signal: controller.signal }).catch(() => null), git.conflictRegions(entry.path, { signal: controller.signal }).catch(() => null)])
        .then(([conflict, regions]) => ({ conflict, regions })) }
      : await loadFilePatch(git, entry, selection.section === "staged", controller.signal) } : null;
    if (current(controller) && run === generation && selection === state.selection) publish({ status, lastDiscard, merging, operation, error: null, patch, selection: entry ? selection : null });
  };
  /** Runs one write, then re-reads status; resolves true when the write succeeded. */
  const write = async (operation: (git: GitService, signal: AbortSignal) => Promise<unknown>) => {
    const git = service, controller = active;
    if (!git || !controller || state.writing || !current(controller)) return false;
    publish({ writing: true, error: null });
    try {
      await operation(git, controller.signal);
      await refresh(git, controller);
      return true;
    } catch (error) {
      await refresh(git, controller).catch(() => {});
      report(error, controller);
      return false;
    } finally {
      if (current(controller)) { suppressedUntil = Date.now() + 300; publish({ writing: false }); }
    }
  };
  const currentPatch = (expectedText: string) => {
    const patch = state.patch;
    if (!patch?.file) return null;
    // Line keys are only meaningful against the patch they were selected from.
    if (patch.text !== expectedText) { publish({ error: "The diff changed. Review it and select the lines again." }); return null; }
    return patch;
  };
  let opening: AbortController | undefined;
  return {
    /** Opens the repository containing `path`; when there's none, sets `openError` and keeps the open repository. */
    async open(path: string) {
      if (closed) return;
      opening?.abort();
      const attempt = opening = new AbortController();
      let root: string;
      try {
        root = await serviceFor(path).resolveRoot({ signal: attempt.signal });
      } catch (error) {
        if (!closed && opening === attempt) publish({ openError: { path, message: error instanceof Error ? error.message : String(error) } });
        return;
      }
      if (closed || opening !== attempt) return;
      cancel();
      const controller = active = new AbortController();
      publish({ ...emptyChanges, loading: true });
      try {
        const git = service = serviceFor(root);
        const locations = await git.watchLocations({ signal: controller.signal });
        if (!current(controller)) return;
        publish({ root });
        watcher = watchGitRepo({ locations, watch, reload: () => refresh(git, controller), onError: error => report(error, controller), suppressedUntil: () => state.writing ? Date.now() + 300 : suppressedUntil });
        await refresh(git, controller);
      } catch (error) { report(error, controller); }
      finally { if (current(controller)) publish({ loading: false }); }
    },
    async select(selection: ChangesSelection | null) {
      if (selection?.section === state.selection?.section && selection?.path === state.selection?.path) return;
      publish({ selection, patch: null });
      const git = service, controller = active;
      if (git && controller && selection) try { await refresh(git, controller); } catch (error) { report(error, controller); }
    },
    changeFile(path: string, stage: boolean) {
      return write((git, signal) => stage ? git.stageFile(path, { signal }) : git.unstageFile(path, { signal }));
    },
    /** Stages lines from the unstaged diff, or unstages lines from the staged diff, of the selected file. */
    changeLines(keys: ReadonlySet<string>, expectedText: string) {
      const patch = currentPatch(expectedText);
      return patch ? write((git, signal) => applyPatchSelection(git, patch.file!, patch.section === "staged", keys, signal)) : Promise.resolve(false);
    },
    /** Discards a whole file's unstaged changes; Git saves a backup ref first. */
    discardFile(path: string) {
      return write((git, signal) => git.discardFiles([path], { signal }));
    },
    /** Discards lines of the selected file's unstaged diff from the worktree; Git saves a backup ref first. */
    discardLines(keys: ReadonlySet<string>, expectedText: string) {
      const patch = currentPatch(expectedText);
      if (patch && patch.section !== "unstaged") { publish({ error: "Only unstaged changes can be discarded." }); return Promise.resolve(false); }
      return patch ? write((git, signal) => discardPatchSelection(git, patch.path, patch.file!, keys, signal)) : Promise.resolve(false);
    },
    restoreLastDiscard() {
      const ref = state.lastDiscard?.ref;
      return ref ? write((git, signal) => git.restoreDiscard(ref, { signal })) : Promise.resolve(false);
    },
    dismissOpenError() { if (state.openError) publish({ openError: null }); },
    /** Aborts (`git <op> --abort`, `git bisect reset`) or continues the paused operation; Git's refusal shows as the error. */
    abortOperation(kind: GitOperationKind) {
      return write((git, signal) => git.abortOperation(kind, { signal }));
    },
    continueOperation(kind: Exclude<GitOperationKind, "bisect">) {
      return write((git, signal) => git.continueOperation(kind, { signal }));
    },
    commit(input: GitCommitInput) {
      return write((git, signal) => git.commit(input, { signal }));
    },
    /** HEAD's message for an amend, or null when HEAD is unborn or the read fails. */
    async headMessage() {
      const git = service, controller = active;
      if (!git || !controller || state.status?.branch.oid === "(initial)") return null;
      try { return await git.headMessage({ signal: controller.signal }); } catch (error) { report(error, controller); return null; }
    },
    /** The merge message Git prepared, or null (none, or the read failed: the fields just stay empty). */
    async mergeMessage() {
      const git = service, controller = active;
      if (!git || !controller) return null;
      try { return await git.mergeMessage({ signal: controller.signal }); } catch { return null; }
    },
    /** Whether a conflicted file still has conflict markers; rejects when the read fails. */
    hasConflictMarkers(path: string) {
      const git = service, controller = active;
      if (!git || !controller) return Promise.reject(new Error("Open a repository first."));
      return git.hasConflictMarkers(path, { signal: controller.signal });
    },
    /** What a conflict pick can do with `path` (null when it isn't conflicted); rejects when the read fails. */
    conflictFile(path: string) {
      const git = service, controller = active;
      if (!git || !controller) return Promise.reject(new Error("Open a repository first."));
      return git.conflictFile(path, { signal: controller.signal });
    },
    /** Resolves a conflicted file with Git's "ours" or "theirs" side, or both, and stages it. */
    resolveConflict(path: string, side: GitConflictSide) {
      return write((git, signal) => git.resolveConflict(path, side, { signal }));
    },
    /** Resolves conflict region `index` of `path` in the worktree file; refused when the file no longer matches `shown`. */
    resolveConflictRegion(path: string, index: number, side: ConflictRegionSide, shown: string) {
      return write((git, signal) => git.resolveConflictRegion(path, index, side, shown, { signal }));
    },
    /** The open repository's staged diff; aborted by `signal` or by opening another repository. */
    async stagedDiff(signal: AbortSignal) {
      const git = service, controller = active, root = state.root;
      if (!git || !controller || !root || !current(controller)) throw new Error("Open a repository first.");
      const linked = new AbortController();
      const abort = () => linked.abort();
      for (const source of [signal, controller.signal]) { source.addEventListener("abort", abort, { once: true }); if (source.aborted) abort(); }
      try { return { root, staged: await git.stagedDiff({ signal: linked.signal }) }; }
      finally { for (const source of [signal, controller.signal]) source.removeEventListener("abort", abort); }
    },
    async refresh() {
      const git = service, controller = active;
      if (git && controller) try { await refresh(git, controller); } catch (error) { report(error, controller); }
    },
    dispose() { closed = true; opening?.abort(); cancel(); },
  };
}
