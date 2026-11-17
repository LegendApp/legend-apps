import { blameLine, openGitHistory, gitHistoryPageSize, type GitBlameHunk, type GitBlameSource, type GitHistoryCommit, type GitHistoryReader } from "@legend-apps/diff-parser";
import { parseUnifiedPatch, type UnifiedPatchFile } from "@legend-apps/diff-parser/src/unifiedPatch";
import { getGitService, githubCommitUrl, watchGitRepo, type GitCommitDetails, type GitDirectoryWatcher, type GitFileHistoryCommit, type GitHistorySearchScope, type GitRefDecoration, type GitService } from "@legend-apps/git-core";

export type CommitFile = { path: string; text: string; file: UnifiedPatchFile };
export type CommitDetailsState = { oid: string; commit: GitCommitDetails | null; files: CommitFile[]; selectedPath: string | null; loading: boolean; error: string | null };
/** One file's history (`git log --follow`), shown in place of the full history while set. */
export type FileHistoryState = { path: string; commits: GitFileHistoryCommit[]; done: boolean; loading: boolean; error: string | null };
export type SearchScope = GitHistorySearchScope;
export const searchScopes: readonly { scope: SearchScope; label: string }[] = [
  { scope: "message", label: "Message" }, { scope: "author", label: "Author" }, { scope: "path", label: "Path" }, { scope: "content", label: "Content" },
];
/** A history search's results (`git log --grep/--author/-S/<path>`), shown in place of the full history while set. */
export type SearchState = { scope: SearchScope; text: string; commits: GitFileHistoryCommit[]; done: boolean; loading: boolean; error: string | null };
/** The commits the listed ref has that `base` doesn't (`git log base..ref`, a branch's outgoing commits), shown in place of the full history while set. */
export type RangeState = { base: string; commits: GitFileHistoryCommit[]; done: boolean; loading: boolean; error: string | null };
/** Two commits compared (`git diff base target`), shown in the content column while set. */
export type CompareState = { base: string; target: string; files: CommitFile[]; selectedPath: string | null; loading: boolean; error: string | null };
export type HistoryState = {
  root: string | null;
  /** The full ref name History lists (a branch, remote branch or tag), or null for HEAD. */
  ref: string | null;
  /** The listed ref's commit (HEAD's, without a ref) as read when the loaded pages were walked; null until History first loads. */
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
  file: FileHistoryState | null;
  search: SearchState | null;
  compare: CompareState | null;
  range: RangeState | null;
};
export const emptyHistory: HistoryState = { root: null, ref: null, head: null, commits: [], done: false, loading: false, error: null, refs: new Map(), currentBranch: null, remoteUrl: null, selectedOid: null, details: null, file: null, search: null, compare: null, range: null };

/** The path a file had in a commit of its history, so selecting the commit selects that file's patch. */
function preferredPath(state: HistoryState, oid: string, files: CommitFile[]) {
  const entry = state.file?.commits.find(commit => commit.oid === oid);
  const candidates = entry ? [entry.path, entry.oldPath] : [];
  return candidates.find(path => path && files.some(file => file.path === path)) ?? files[0]?.path ?? null;
}

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
/** The commits the list shows now: search results, one file's history, or the full history. */
export const listedCommits = (state: HistoryState): readonly { oid: string }[] => state.search?.commits ?? state.file?.commits ?? state.range?.commits ?? state.commits;

export function createGitHistory(onChange: (state: HistoryState) => void, watch: GitDirectoryWatcher, {
  serviceFor = getGitService, open = openGitHistory, blame = blameLine, searchDelay = 250,
}: {
  serviceFor?: (path: string) => GitService; open?: (path: string, signal?: AbortSignal, startRef?: string) => Promise<GitHistoryReader>;
  blame?: (root: string, path: string, source: GitBlameSource, line: number, signal?: AbortSignal) => Promise<GitBlameHunk | null>;
  /** Milliseconds a search waits for typing to pause. */
  searchDelay?: number;
} = {}) {
  let state = emptyHistory;
  let closed = false;
  let active: AbortController | undefined;
  let reader: GitHistoryReader | undefined;
  let watcher: { remove(): void } | undefined;
  let paging: Promise<void> | undefined;
  let filePaging: Promise<void> | undefined;
  let detailsRun = 0;
  let fileRun = 0;
  let searchRun = 0;
  let searchTimer: ReturnType<typeof setTimeout> | undefined;
  let searchAbort: AbortController | undefined;
  let unlinkSearch: (() => void) | undefined;
  let searchPaging: Promise<void> | undefined;
  let compareRun = 0;
  let rangeRun = 0;
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
    filePaging = undefined;
    detailsRun++;
    fileRun++;
    cancelSearch();
    compareRun++;
  };
  /** Stops a waiting or running search; a newer query or Show All calls it. */
  function cancelSearch() {
    clearTimeout(searchTimer);
    searchTimer = undefined;
    searchAbort?.abort();
    searchAbort = undefined;
    unlinkSearch?.();
    unlinkSearch = undefined;
    searchPaging = undefined;
    searchRun++;
  }
  /** An abort signal for one search that also fires when History closes or changes repository. */
  const searchSignal = (controller: AbortController) => {
    const abort = searchAbort = new AbortController();
    const forward = () => abort.abort();
    controller.signal.addEventListener("abort", forward, { once: true });
    unlinkSearch = () => controller.signal.removeEventListener("abort", forward);
    return abort.signal;
  };
  /** Keeps the selection when the new list has it, otherwise selects `prefer` or the list's first commit. */
  const keepSelection = async (git: GitService, controller: AbortController, commits: readonly { oid: string }[], prefer?: string) => {
    const keep = prefer ?? (state.selectedOid && commits.some(commit => commit.oid === state.selectedOid) ? state.selectedOid : commits[0]?.oid ?? null);
    if (keep !== state.selectedOid) {
      publish({ selectedOid: keep, details: null });
      if (keep) await readDetails(git, keep, controller);
    } else if (keep && state.details?.commit) {
      publish({ details: { ...state.details, selectedPath: preferredPath(state, keep, state.details.files) } });
    }
  };

  const readDetails = async (git: GitService, oid: string, controller: AbortController) => {
    const run = ++detailsRun;
    publish({ details: { oid, commit: null, files: [], selectedPath: null, loading: true, error: null } });
    try {
      const [commit, patch] = await Promise.all([git.commitDetails(oid, { signal: controller.signal }), git.commitPatch(oid, { signal: controller.signal })]);
      const files = splitCommitPatch(patch);
      if (current(controller) && run === detailsRun) publish({ details: { oid, commit, files, selectedPath: preferredPath(state, oid, files), loading: false, error: null } });
    } catch (error) {
      if (current(controller) && run === detailsRun && !cancelled(error)) publish({ details: { oid, commit: null, files: [], selectedPath: null, loading: false, error: message(error) } });
    }
  };

  /** Reads `path`'s history from HEAD, at least `count` commits, and keeps the selection when it is listed. */
  const readFileHistory = async (git: GitService, controller: AbortController, path: string, count = gitHistoryPageSize, prefer?: string) => {
    const run = ++fileRun;
    filePaging = undefined;
    if (state.file?.path !== path) publish({ file: { path, commits: [], done: false, loading: true, error: null } });
    try {
      const page = await git.fileHistory(path, { offset: 0, count: Math.max(count, gitHistoryPageSize), signal: controller.signal });
      if (!current(controller) || run !== fileRun) return;
      publish({ file: { path, commits: page.commits, done: page.done, loading: false, error: null } });
      await keepSelection(git, controller, page.commits, prefer);
    } catch (error) {
      if (current(controller) && run === fileRun && !cancelled(error)) publish({ file: { path, commits: state.file?.commits ?? [], done: true, loading: false, error: message(error) } });
    }
  };

  const readCompare = async (git: GitService, controller: AbortController, base: string, target: string) => {
    const run = ++compareRun;
    const latest = () => current(controller) && run === compareRun;
    publish({ compare: { base, target, files: [], selectedPath: null, loading: true, error: null } });
    try {
      const files = splitCommitPatch(await git.compareCommits(base, target, { signal: controller.signal }));
      if (latest()) publish({ compare: { base, target, files, selectedPath: files[0]?.path ?? null, loading: false, error: null } });
    } catch (error) {
      if (latest() && !cancelled(error)) publish({ compare: { base, target, files: [], selectedPath: null, loading: false, error: message(error) } });
    }
  };

  /** Runs a search from HEAD, at least `count` results, and keeps the selection when it is listed. */
  const readSearch = async (git: GitService, controller: AbortController, scope: SearchScope, text: string, count = gitHistoryPageSize) => {
    cancelSearch();
    const run = searchRun;
    const signal = searchSignal(controller);
    const latest = () => current(controller) && run === searchRun;
    publish({ search: { scope, text, commits: state.search?.scope === scope && state.search.text === text ? state.search.commits : [], done: false, loading: true, error: null } });
    try {
      const head = state.head;
      const page = !head || head.unborn ? { commits: [], done: true }
        : await git.searchHistory(head.oid, scope, text, { offset: 0, count: Math.max(count, gitHistoryPageSize), signal });
      if (!latest()) return;
      publish({ search: { scope, text, commits: page.commits, done: page.done, loading: false, error: null } });
      await keepSelection(git, controller, page.commits);
    } catch (error) {
      if (latest() && !cancelled(error)) publish({ search: { scope, text, commits: [], done: true, loading: false, error: message(error) } });
    }
  };

  /** Re-reads the listed range and keeps the selection when it is listed. */
  const readRange = async (git: GitService, controller: AbortController) => {
    const range = state.range, ref = state.ref;
    if (!range || !ref) return;
    const run = ++rangeRun;
    const latest = () => current(controller) && run === rangeRun && state.range?.base === range.base && state.ref === ref;
    try {
      const page = await git.logRange(range.base, ref, { signal: controller.signal });
      if (!latest()) return;
      publish({ range: { base: range.base, commits: page.commits, done: page.done, loading: false, error: null } });
      await keepSelection(git, controller, page.commits);
    } catch (error) {
      if (latest() && !cancelled(error)) publish({ range: { ...range, loading: false, error: message(error) } });
    }
  };

  /** Reads the listed ref (or HEAD), refs and the remote; re-walks history only when its commit moved (or on the first load). */
  const reload = async (git: GitService, controller: AbortController, first: boolean) => {
    const signal = controller.signal;
    const ref = state.ref;
    const [headOid, refs, remoteUrl, currentBranch] = await Promise.all([
      git.revParse(ref ? `${ref}^{commit}` : "HEAD", { signal }).catch(() => null),
      git.refDecorations({ signal }),
      git.remoteUrl("origin", { signal }),
      git.currentBranch({ signal }),
    ]);
    // A newer reload, queued by setRef, lists the other ref.
    if (!current(controller) || state.ref !== ref) return;
    // A range's base can move while its ref stays (a push), so it is re-read on every reload.
    if (state.range) await readRange(git, controller);
    if (!first && state.head && headOid === (state.head.unborn ? null : state.head.oid)) {
      publish({ refs, remoteUrl, currentBranch });
      return;
    }
    const next = await open(git.repoRoot, signal, ref ?? "");
    if (!current(controller) || state.ref !== ref) { next.close(); return; }
    // Re-read at least as much as is loaded, including pages that arrive while this walk runs.
    const want = () => Math.max(gitHistoryPageSize, Math.ceil(state.commits.length / gitHistoryPageSize) * gitHistoryPageSize);
    const commits: GitHistoryCommit[] = [];
    let done = next.head.unborn;
    while (!done && commits.length < want()) {
      const page = await next.page(commits.length, gitHistoryPageSize, signal).catch(error => { next.close(); throw error; });
      commits.push(...page.commits);
      done = page.done;
    }
    if (!current(controller) || state.ref !== ref) { next.close(); return; }
    reader?.close();
    reader = next;
    paging = undefined;
    const listed = (oid: string) => commits.some(commit => commit.oid === oid) || !!state.file?.commits.some(commit => commit.oid === oid) || !!state.search?.commits.some(commit => commit.oid === oid);
    const selectedOid = state.selectedOid && listed(state.selectedOid) ? state.selectedOid : null;
    const { head } = next;
    publish({ head: { oid: head.headOid, unborn: head.unborn, detached: head.detached }, commits, done, refs, remoteUrl, currentBranch, loading: false, error: null, selectedOid, ...selectedOid ? {} : { details: null } });
    if (selectedOid && state.details?.oid !== selectedOid) await readDetails(git, selectedOid, controller);
    if (state.file) await readFileHistory(git, controller, state.file.path, state.file.commits.length);
    if (state.search) await readSearch(git, controller, state.search.scope, state.search.text, state.search.commits.length);
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
  const api = {
    /** Points History at a repository root (or none); reading starts on `activate`. */
    setRoot(root: string | null) {
      if (root === state.root) return;
      reset();
      activation = undefined;
      service = root ? serviceFor(root) : undefined;
      publish({ ...emptyHistory, root });
    },
    /**
     * Lists the history of `ref` (a full ref name), or of HEAD when null. File history, a search and a
     * comparison close; the selection stays when the new list has it.
     */
    setRef(ref: string | null) {
      if (ref === state.ref && !state.range) return;
      reader?.close();
      reader = undefined;
      paging = undefined;
      api.closeFileHistory();
      api.closeCompare();
      const git = service, controller = active;
      rangeRun++;
      publish({ ref, range: null, head: null, commits: [], done: false, loading: !!controller, error: null });
      if (git && controller) void queueReload(git, controller, true).catch(error => report(error, controller));
    },
    /** Lists only the commits `ref` has that `base` doesn't (both full ref names), e.g. a branch's outgoing commits. */
    setRange(ref: string, base: string) {
      if (state.ref === ref && state.range?.base === base) return;
      const reloads = ref !== state.ref || !!state.range;
      api.setRef(ref);
      // setRef returns early for the same ref, so these close here too.
      api.closeFileHistory();
      api.closeCompare();
      api.closeSearch();
      publish({ range: { base, commits: [], done: false, loading: true, error: null } });
      // A changed ref reloads (and reads the range); the same ref is read here.
      const git = service, controller = active;
      if (!reloads && git && controller) void readRange(git, controller);
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
    /**
     * Shows only the commits that touched `path`, following renames; starts History if needed. With
     * `select`, selects that commit and reads pages until the list shows it.
     */
    async showFileHistory(path: string, select?: string): Promise<void> {
      if (!service || closed) return;
      await api.activate();
      const git = service, controller = active;
      if (!git || !controller) return;
      api.closeSearch();
      api.closeCompare();
      // Showing the same file again re-reads as many commits as are loaded.
      await readFileHistory(git, controller, path, state.file?.path === path ? state.file.commits.length : undefined, select);
      const listed = () => !!state.file?.commits.some(commit => commit.oid === select);
      // Stops when another file history (or Show All) replaces this one, or a page adds nothing.
      const run = fileRun;
      while (select && current(controller) && run === fileRun && state.file?.path === path && !state.file.done && !state.file.error && !listed()) {
        const loaded = state.file.commits.length;
        await api.loadMore();
        if ((state.file?.commits.length ?? 0) <= loaded) break;
      }
      // The commit's file is known once its row is listed.
      const details = state.details;
      if (select && run === fileRun && listed() && details?.oid === select && details.commit) publish({ details: { ...details, selectedPath: preferredPath(state, select, details.files) } });
    },
    /**
     * The commit that last changed `line` of `path` as of `source` (a commit, "index" or "workdir"); its
     * oid is empty when the line is not committed yet.
     */
    async blameLine(path: string, source: GitBlameSource, line: number): Promise<GitBlameHunk | null> {
      const root = state.root;
      if (!root || closed) return null;
      return blame(root, path, source, line, active?.signal);
    },
    /** Searches History after typing pauses; a newer query cancels the older one, and an empty one ends the search. */
    search(scope: SearchScope, text: string) {
      if (!service || closed) return;
      if (!text.trim()) { api.closeSearch(); return; }
      // Return in the field, or the same text again, keeps the results.
      if (state.search?.scope === scope && state.search.text === text && !state.search.error) return;
      cancelSearch();
      if (state.file) api.closeFileHistory();
      api.closeCompare();
      publish({ search: { scope, text, commits: [], done: false, loading: true, error: null } });
      const run = searchRun;
      searchTimer = setTimeout(() => {
        void (async () => {
          await api.activate();
          const git = service, controller = active;
          if (git && controller && run === searchRun) await readSearch(git, controller, scope, text);
        })();
      }, searchDelay);
    },
    closeSearch() {
      cancelSearch();
      if (state.search) publish({ search: null });
    },
    /** Compares the selected commit with `oid`, older one first (by list position), in the content column. */
    async compare(oid: string) {
      const git = service, controller = active, selected = state.selectedOid;
      if (!git || !controller || !selected || selected === oid) return;
      const list = listedCommits(state);
      const at = (value: string) => list.findIndex(commit => commit.oid === value);
      const [base, target] = at(selected) >= 0 && at(oid) > at(selected) ? [oid, selected] : [selected, oid];
      await readCompare(git, controller, base, target);
    },
    /** Swaps the compared commits, so the diff reads the other way. */
    async swapCompare() {
      const git = service, controller = active, compare = state.compare;
      if (git && controller && compare) await readCompare(git, controller, compare.target, compare.base);
    },
    closeCompare() {
      compareRun++;
      if (state.compare) publish({ compare: null });
    },
    closeFileHistory() {
      api.closeSearch();
      if (!state.file) return;
      fileRun++;
      filePaging = undefined;
      publish({ file: null });
    },
    /** Reads the next page of 500; concurrent calls share one read. */
    loadMore() {
      const git = service, controller = active, walk = reader;
      const search = state.search;
      if (search) {
        if (!git || !controller || search.done || search.loading || !state.head) return Promise.resolve();
        const run = searchRun, head = state.head.oid;
        const latest = () => current(controller) && run === searchRun && state.search === search;
        return searchPaging ??= (async () => {
          try {
            const page = await git.searchHistory(head, search.scope, search.text, { offset: search.commits.length, count: gitHistoryPageSize, signal: searchAbort?.signal ?? controller.signal });
            if (latest()) publish({ search: { ...search, commits: [...search.commits, ...page.commits], done: page.done } });
          } catch (error) {
            if (latest() && !cancelled(error)) publish({ search: { ...search, done: true, error: message(error) } });
          } finally { if (run === searchRun) searchPaging = undefined; }
        })();
      }
      const file = state.file;
      if (file) {
        if (!git || !controller || file.done || file.loading) return Promise.resolve();
        const run = fileRun;
        const latest = () => current(controller) && run === fileRun && state.file === file;
        return filePaging ??= (async () => {
          try {
            const page = await git.fileHistory(file.path, { offset: file.commits.length, count: gitHistoryPageSize, signal: controller.signal });
            if (latest()) publish({ file: { ...file, commits: [...file.commits, ...page.commits], done: page.done } });
          } catch (error) {
            if (latest() && !cancelled(error)) publish({ file: { ...file, done: true, error: message(error) } });
          } finally { if (run === fileRun) filePaging = undefined; }
        })();
      }
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
      api.closeCompare();
      if (oid === state.selectedOid) return;
      publish({ selectedOid: oid, details: null });
      if (git && controller && oid) await readDetails(git, oid, controller);
    },
    selectFile(path: string) {
      if (state.compare) {
        if (state.compare.files.some(file => file.path === path)) publish({ compare: { ...state.compare, selectedPath: path } });
        return;
      }
      if (state.details && state.details.files.some(file => file.path === path)) publish({ details: { ...state.details, selectedPath: path } });
    },
    async refresh() {
      const git = service, controller = active;
      await activation;
      if (git && controller) try { await queueReload(git, controller, false); } catch (error) { report(error, controller); }
    },
    dispose() { closed = true; reset(); },
  };
  return api;
}
