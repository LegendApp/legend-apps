import { openGitHistory, gitHistoryPageSize, type GitHistoryCommit, type GitHistoryReader } from "@legend-apps/diff-parser";
import { parseUnifiedPatch, type UnifiedPatchFile } from "@legend-apps/diff-parser/src/unifiedPatch";
import { getGitService, githubCommitUrl, watchGitRepo, type GitCommitDetails, type GitDirectoryWatcher, type GitRefDecoration, type GitService } from "@legend-apps/git-core";

export type CommitFile = { path: string; text: string; file: UnifiedPatchFile };
export type CommitDetailsState = { oid: string; commit: GitCommitDetails | null; files: CommitFile[]; selectedPath: string | null; loading: boolean; error: string | null };
export type HistoryState = {
  root: string | null;
  /** HEAD as read when the loaded pages were walked; null until History first loads. */
  head: { oid: string; unborn: boolean; detached: boolean } | null;
  commits: GitHistoryCommit[];
  done: boolean;
  loading: boolean;
  error: string | null;
  refs: ReadonlyMap<string, GitRefDecoration[]>;
  currentBranch: string | null;
  remoteUrl: string | null;
  selectedOid: string | null;
  details: CommitDetailsState | null;
};
export const emptyHistory: HistoryState = { root: null, head: null, commits: [], done: false, loading: false, error: null, refs: new Map(), currentBranch: null, remoteUrl: null, selectedOid: null, details: null };

export const shortOid = (oid: string) => oid.slice(0, 7);
export const commitGitHubUrl = (state: HistoryState, oid: string) => githubCommitUrl(state.remoteUrl, oid);

/** Splits `git show` patch output into one patch per file, each parseable on its own. */
export function splitCommitPatch(text: string): CommitFile[] {
  const starts: number[] = [];
  const pattern = /^diff --git /gm;
  for (let match = pattern.exec(text); match; match = pattern.exec(text)) starts.push(match.index);
  return starts.flatMap((start, index) => {
    const chunk = text.slice(start, starts[index + 1] ?? text.length).replace(/\0+$/, "");
    const file = parseUnifiedPatch(chunk)[0];
    const path = file?.newPath ?? file?.oldPath;
    return file && path ? [{ path, text: chunk, file }] : [];
  });
}

/** Seconds since the epoch → "5 minutes ago", "3 days ago", or a short date after a year. */
export function relativeDate(seconds: number, now = Date.now()) {
  const elapsed = Math.max(0, Math.round(now / 1000 - seconds));
  const units: [number, string][] = [[60, "second"], [60, "minute"], [24, "hour"], [7, "day"], [4.35, "week"], [12, "month"]];
  if (elapsed < 45) return "just now";
  let value = elapsed;
  for (const [size, name] of units) {
    if (value < size) return `${Math.round(value)} ${name}${Math.round(value) === 1 ? "" : "s"} ago`;
    value /= size;
  }
  return new Date(seconds * 1000).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

const message = (error: unknown) => error instanceof Error ? error.message : String(error);
const cancelled = (error: unknown) => error instanceof Error && (error.name === "GitHistoryCancelledError" || /cancelled/i.test(error.message));

/**
 * History for one repository at a time. Nothing is read until `activate`; pages of 500 are read on
 * demand, and ref or HEAD changes re-read only what was already loaded, keeping the selection by oid.
 */
export function createGitHistory(onChange: (state: HistoryState) => void, watch: GitDirectoryWatcher, {
  serviceFor = getGitService, open = openGitHistory,
}: { serviceFor?: (path: string) => GitService; open?: (path: string, signal?: AbortSignal) => Promise<GitHistoryReader> } = {}) {
  let state = emptyHistory;
  let closed = false;
  let active: AbortController | undefined;
  let reader: GitHistoryReader | undefined;
  let watcher: { remove(): void } | undefined;
  let paging: Promise<void> | undefined;
  let detailsRun = 0;
  const publish = (patch: Partial<HistoryState>) => { state = { ...state, ...patch }; if (!closed) onChange(state); };
  const current = (controller: AbortController) => !closed && active === controller && !controller.signal.aborted;
  const report = (error: unknown, controller: AbortController) => {
    if (current(controller) && !cancelled(error)) publish({ error: message(error), loading: false });
  };
  const reset = () => {
    active?.abort(); active = undefined;
    reader?.close(); reader = undefined;
    watcher?.remove(); watcher = undefined;
    paging = undefined;
    detailsRun++;
  };

  const readDetails = async (git: GitService, oid: string, controller: AbortController) => {
    const run = ++detailsRun;
    publish({ details: { oid, commit: null, files: [], selectedPath: null, loading: true, error: null } });
    try {
      const [commit, patch] = await Promise.all([git.commitDetails(oid, { signal: controller.signal }), git.commitPatch(oid, { signal: controller.signal })]);
      const files = splitCommitPatch(patch);
      if (current(controller) && run === detailsRun) publish({ details: { oid, commit, files, selectedPath: files[0]?.path ?? null, loading: false, error: null } });
    } catch (error) {
      if (current(controller) && run === detailsRun && !cancelled(error)) publish({ details: { oid, commit: null, files: [], selectedPath: null, loading: false, error: message(error) } });
    }
  };

  /** Reads HEAD, refs and the remote; re-walks history only when HEAD moved (or on the first load). */
  const reload = async (git: GitService, controller: AbortController, first: boolean) => {
    const signal = controller.signal;
    const [headOid, refs, remoteUrl, currentBranch] = await Promise.all([
      git.revParse("HEAD", { signal }).catch(() => null),
      git.refDecorations({ signal }),
      git.remoteUrl("origin", { signal }),
      git.currentBranch({ signal }),
    ]);
    if (!current(controller)) return;
    if (!first && state.head && headOid === (state.head.unborn ? null : state.head.oid)) {
      publish({ refs, remoteUrl, currentBranch });
      return;
    }
    const next = await open(git.repoRoot, signal);
    if (!current(controller)) { next.close(); return; }
    // Re-read at least as much as is loaded, including pages that arrive while this walk runs.
    const want = () => Math.max(gitHistoryPageSize, Math.ceil(state.commits.length / gitHistoryPageSize) * gitHistoryPageSize);
    const commits: GitHistoryCommit[] = [];
    let done = next.head.unborn;
    while (!done && commits.length < want()) {
      const page = await next.page(commits.length, gitHistoryPageSize, signal).catch(error => { next.close(); throw error; });
      commits.push(...page.commits);
      done = page.done;
    }
    if (!current(controller)) { next.close(); return; }
    reader?.close();
    reader = next;
    paging = undefined;
    const selectedOid = state.selectedOid && commits.some(commit => commit.oid === state.selectedOid) ? state.selectedOid : null;
    const { head } = next;
    publish({ head: { oid: head.headOid, unborn: head.unborn, detached: head.detached }, commits, done, refs, remoteUrl, currentBranch, loading: false, error: null, selectedOid, ...selectedOid ? {} : { details: null } });
    if (selectedOid && state.details?.oid !== selectedOid) await readDetails(git, selectedOid, controller);
  };

  // Watcher, toolbar and first-load reloads run one at a time, so an older read never lands last.
  let reloadTail: Promise<void> = Promise.resolve();
  const queueReload = (git: GitService, controller: AbortController, first: boolean) => {
    const run = reloadTail.then(() => reload(git, controller, first));
    reloadTail = run.catch(() => {});
    return run;
  };

  let service: GitService | undefined;
  let activation: Promise<void> | undefined;
  return {
    /** Points History at a repository root (or none); reading starts on `activate`. */
    setRoot(root: string | null) {
      if (root === state.root) return;
      reset();
      activation = undefined;
      service = root ? serviceFor(root) : undefined;
      publish({ ...emptyHistory, root });
    },
    /** Loads the first page and starts watching refs; later calls do nothing. */
    activate() {
      const git = service;
      if (!git || active || closed) return activation ?? Promise.resolve();
      const controller = active = new AbortController();
      publish({ loading: true, error: null });
      return activation = (async () => {
        try {
          const locations = await git.watchLocations({ signal: controller.signal });
          if (!current(controller)) return;
          watcher = watchGitRepo({ locations, watch, reload: () => queueReload(git, controller, false), onError: error => report(error, controller) });
          await queueReload(git, controller, true);
        } catch (error) { report(error, controller); }
      })();
    },
    /** Reads the next page of 500; concurrent calls share one read. */
    loadMore() {
      const git = service, controller = active, walk = reader;
      if (!git || !controller || !walk || state.done || state.loading) return Promise.resolve();
      return paging ??= (async () => {
        try {
          const page = await walk.page(state.commits.length, gitHistoryPageSize, controller.signal);
          if (current(controller) && reader === walk && page.offset === state.commits.length) publish({ commits: [...state.commits, ...page.commits], done: page.done });
        } catch (error) { report(error, controller); }
        finally { if (reader === walk) paging = undefined; }
      })();
    },
    async select(oid: string | null) {
      const git = service, controller = active;
      if (oid === state.selectedOid) return;
      publish({ selectedOid: oid, details: null });
      if (git && controller && oid) await readDetails(git, oid, controller);
    },
    selectFile(path: string) {
      if (state.details && state.details.files.some(file => file.path === path)) publish({ details: { ...state.details, selectedPath: path } });
    },
    async refresh() {
      const git = service, controller = active;
      await activation;
      if (git && controller) try { await queueReload(git, controller, false); } catch (error) { report(error, controller); }
    },
    dispose() { closed = true; reset(); },
  };
}
