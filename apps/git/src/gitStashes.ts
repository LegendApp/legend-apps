import { getGitService, type GitService } from "@legend-apps/git-core";
import { splitCommitPatch, type CommitFile } from "./gitHistory";

/** The selected stash's files (worktree changes, then untracked files) and the file whose diff is shown. */
export type StashPreviewState = { oid: string | null; files: CommitFile[]; selectedPath: string | null; loading: boolean; error: string | null };
export const emptyStashPreview: StashPreviewState = { oid: null, files: [], selectedPath: null, loading: false, error: null };

/** A stash's subject ("On main: message") without Git's "On <branch>: " prefix, for the sidebar. */
export const stashLabel = (message: string) => message.replace(/^On [^:]*: /, "") || message;

/** A short date for a sidebar row, as Mail lists messages: the time today, "Yesterday", the weekday this week, else the date. */
export function sidebarDate(seconds: number, now = new Date()) {
  const date = new Date(seconds * 1000);
  const day = (value: Date) => new Date(value.getFullYear(), value.getMonth(), value.getDate()).getTime();
  const days = Math.round((day(now) - day(date)) / 86_400_000);
  if (days <= 0) return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (days === 1) return "Yesterday";
  if (days < 7) return date.toLocaleDateString(undefined, { weekday: "long" });
  return date.toLocaleDateString(undefined, { year: "2-digit", month: "numeric", day: "numeric" });
}

/**
 * Loads one stash's patch at a time. A stash never changes, so its files are read once per selection;
 * a newer selection or repository cancels the older read.
 */
export function createStashPreview(onChange: (state: StashPreviewState) => void, serviceFor: (path: string) => GitService = getGitService) {
  let state = emptyStashPreview;
  let closed = false;
  let service: GitService | undefined;
  let active: AbortController | undefined;
  const publish = (patch: Partial<StashPreviewState>) => { state = { ...state, ...patch }; if (!closed) onChange(state); };

  return {
    setRoot(root: string | null) {
      active?.abort();
      active = undefined;
      service = root ? serviceFor(root) : undefined;
      publish(emptyStashPreview);
    },
    async show(oid: string | null) {
      if (oid === state.oid || closed) return;
      active?.abort();
      active = undefined;
      const git = service;
      if (!oid || !git) { publish({ ...emptyStashPreview, oid: git ? oid : null }); return; }
      const controller = active = new AbortController();
      publish({ oid, files: [], selectedPath: null, loading: true, error: null });
      try {
        const files = splitCommitPatch(await git.stashPatch(oid, { signal: controller.signal }));
        if (active === controller) publish({ files, selectedPath: files[0]?.path ?? null, loading: false });
      } catch (error) {
        if (active === controller && !controller.signal.aborted) publish({ loading: false, error: error instanceof Error ? error.message : String(error) });
      }
    },
    selectFile(path: string) { if (state.files.some(file => file.path === path)) publish({ selectedPath: path }); },
    dispose() { closed = true; active?.abort(); active = undefined; service = undefined; },
  };
}
