import { getGitService, type GitService, type GitStatusEntry } from "@legend-apps/git-core";
import { findUnifiedPatchFile, parseUnifiedPatch, type UnifiedPatchFile } from "@legend-apps/diff-parser/src/unifiedPatch";

/** The selected worktree's changed files (read-only) and the selected file's diff from HEAD. */
export type WorktreePreviewState = {
  path: string | null; files: GitStatusEntry[]; selectedPath: string | null;
  patch: { path: string; text: string; file: UnifiedPatchFile | null } | null;
  loading: boolean; error: string | null;
};
export const emptyWorktreePreview: WorktreePreviewState = { path: null, files: [], selectedPath: null, patch: null, loading: false, error: null };

/** The folder name of a worktree path, for its sidebar row and window title. */
export const worktreeName = (path: string) => path.replace(/\/+$/, "").split("/").pop() || path;

/** A worktree's sidebar secondary text: its branch (or short commit, detached), then its changed-file count. */
export function worktreeDetail(entry: { branch: string | null; head: string | null; detached: boolean; bare: boolean; prunable: string | null; changes: number | null }) {
  const where = entry.bare ? "bare" : entry.prunable !== null ? "missing" : entry.branch ?? (entry.head ? entry.head.slice(0, 7) : "detached");
  return entry.changes ? `${where} · ${entry.changes}` : where;
}

/**
 * Reads one worktree's status and its selected file's diff through the open repository's GitService (`git -C <path>`).
 * `show` re-reads the files (also for the same worktree, on refresh) and keeps the selected file when it is still
 * listed; a newer `show`, a repository change or `dispose` cancels the older reads.
 */
export function createWorktreePreview(onChange: (state: WorktreePreviewState) => void, serviceFor: (path: string) => GitService = getGitService) {
  let state = emptyWorktreePreview;
  let closed = false;
  let service: GitService | undefined;
  let active: AbortController | undefined;
  let fileRead: AbortController | undefined;
  const publish = (patch: Partial<WorktreePreviewState>) => { state = { ...state, ...patch }; if (!closed) onChange(state); };
  const cancel = () => { active?.abort(); active = undefined; fileRead?.abort(); fileRead = undefined; };
  const message = (error: unknown) => error instanceof Error ? error.message : String(error);

  const loadFile = async (git: GitService, worktree: string, entry: GitStatusEntry | undefined) => {
    fileRead?.abort();
    const controller = fileRead = new AbortController();
    if (!entry) { publish({ selectedPath: null, patch: null }); return; }
    publish({ selectedPath: entry.path, patch: state.patch?.path === entry.path ? state.patch : null });
    try {
      const text = await git.worktreeFileDiff(worktree, { path: entry.path, untracked: entry.kind === "untracked" }, { signal: controller.signal });
      if (fileRead === controller) publish({ patch: { path: entry.path, text, file: findUnifiedPatchFile(parseUnifiedPatch(text), entry.path) } });
    } catch (error) {
      if (fileRead === controller && !controller.signal.aborted) publish({ patch: null, error: message(error) });
    }
  };

  return {
    setRoot(root: string | null) {
      cancel();
      service = root ? serviceFor(root) : undefined;
      publish(emptyWorktreePreview);
    },
    async show(path: string | null) {
      if (closed) return;
      cancel();
      const git = service;
      if (!path || !git) { publish(emptyWorktreePreview); return; }
      const controller = active = new AbortController();
      const same = state.path === path;
      publish(same ? { loading: true, error: null } : { ...emptyWorktreePreview, path, loading: true });
      try {
        const files = (await git.worktreeStatus(path, { signal: controller.signal })).entries;
        if (active !== controller) return;
        publish({ files, loading: false });
        const keep = files.find(entry => entry.path === state.selectedPath) ?? files[0];
        await loadFile(git, path, keep);
      } catch (error) {
        if (active === controller && !controller.signal.aborted) publish({ files: [], selectedPath: null, patch: null, loading: false, error: message(error) });
      }
    },
    selectFile(path: string) {
      const git = service, worktree = state.path, entry = state.files.find(file => file.path === path);
      if (!git || !worktree || !entry || path === state.selectedPath) return;
      void loadFile(git, worktree, entry);
    },
    dispose() { closed = true; cancel(); service = undefined; },
  };
}
