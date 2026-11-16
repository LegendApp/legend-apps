import { getGitService, watchGitRepo, type GitDirectoryWatcher, type GitService, type GitStatus, type GitStatusEntry } from "@legend-apps/git-core";
import { applyPatchSelection, loadFilePatch, type FilePatch } from "./gitPatch";

export type ChangesSection = "unstaged" | "staged";
export type ChangesSelection = { section: ChangesSection; path: string };
export type ChangesState = {
  root: string | null; status: GitStatus | null; loading: boolean; writing: boolean; error: string | null;
  selection: ChangesSelection | null; patch: (FilePatch & ChangesSelection) | null;
};
export const emptyChanges: ChangesState = { root: null, status: null, loading: false, writing: false, error: null, selection: null, patch: null };

export const unstagedEntries = (status: GitStatus | null) => status?.entries.filter(entry => entry.worktreeStatus !== ".") ?? [];
export const stagedEntries = (status: GitStatus | null) => status?.entries.filter(entry => entry.kind !== "untracked" && entry.indexStatus !== ".") ?? [];

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
    const status = await git.status({ signal: controller.signal });
    const selection = state.selection;
    const entry = selectedEntry(status, selection);
    const patch = entry && selection ? { ...selection, ...await loadFilePatch(git, entry, selection.section === "staged", controller.signal) } : null;
    if (current(controller) && run === generation && selection === state.selection) publish({ status, error: null, patch, selection: entry ? selection : null });
  };
  const write = async (operation: (git: GitService, signal: AbortSignal) => Promise<void>) => {
    const git = service, controller = active;
    if (!git || !controller || state.writing || !current(controller)) return;
    publish({ writing: true, error: null });
    try {
      await operation(git, controller.signal);
      await refresh(git, controller);
    } catch (error) {
      await refresh(git, controller).catch(() => {});
      report(error, controller);
    } finally {
      if (current(controller)) { suppressedUntil = Date.now() + 300; publish({ writing: false }); }
    }
  };
  return {
    async open(path: string) {
      cancel();
      if (closed) return;
      const controller = active = new AbortController();
      publish({ ...emptyChanges, loading: true });
      try {
        const root = await serviceFor(path).resolveRoot({ signal: controller.signal });
        if (!current(controller)) return;
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
      const patch = state.patch;
      if (!patch?.file) return Promise.resolve();
      // Line keys are only meaningful against the patch they were selected from.
      if (patch.text !== expectedText) { publish({ error: "The diff changed. Review it and select the lines again." }); return Promise.resolve(); }
      return write((git, signal) => applyPatchSelection(git, patch.file!, patch.section === "staged", keys, signal));
    },
    async refresh() {
      const git = service, controller = active;
      if (git && controller) try { await refresh(git, controller); } catch (error) { report(error, controller); }
    },
    dispose() { closed = true; cancel(); },
  };
}
