import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitService, type GitDirectoryChangeEvent, type GitHistoryQuery } from "@legend-apps/git-core";
import type { GitHistoryCommit, GitHistoryReader } from "@legend-apps/diff-parser";
import { fixtureGit } from "../../../../packages/git-core/test/fixtures/make-repos";
import { realRunner } from "../../../../packages/git-core/test/fixtures/realRunner";
import { createGitHistory, relativeDate, splitCommitPatch, type HistoryState } from "../gitHistory";

jest.mock("@legend-apps/diff-parser", () => ({ gitHistoryPageSize: 500, openGitHistory: jest.fn(), blameLine: jest.fn() }));

let root: string;
beforeAll(() => { root = mkdtempSync(join(tmpdir(), "legend-git-history-ui-")); });
afterAll(() => rmSync(root, { recursive: true, force: true }));

function repo(name: string, commits = true) {
  const path = join(root, name);
  fixtureGit(root, "init", "-q", "--initial-branch=main", "--template=", path);
  for (const [key, value] of Object.entries({ "user.name": "Git Test", "user.email": "git@example.test", "core.hooksPath": "/dev/null", "commit.gpgsign": "false" })) fixtureGit(path, "config", key, value);
  if (commits) {
    const stream = execFileSync("python3", [join(__dirname, "../../../../packages/diff-parser/tests/history-fixture.py")]);
    execFileSync("git", ["fast-import", "--quiet"], { cwd: path, input: stream });
    fixtureGit(path, "checkout", "-q", "main");
  }
  return path;
}

/** Stands in for the native walk: the same order as `git log --topo-order`, read lazily per page. */
function gitReader(path: string, opened: GitHistoryReader[]) {
  return async (_path: string, _signal?: AbortSignal, startRef = ""): Promise<GitHistoryReader> => {
    const headOid = (() => { try { return fixtureGit(path, "rev-parse", "--verify", "-q", startRef ? `${startRef}^{commit}` : "HEAD"); } catch { return ""; } })();
    let closed = false;
    const reader: GitHistoryReader & { closed(): boolean; pages: number[] } = {
      head: { handle: opened.length + 1, headOid, unborn: !headOid, detached: false },
      pages: [],
      closed: () => closed,
      async page(offset, count = 500) {
        if (closed) throw Object.assign(new Error("History read was cancelled."), { name: "GitHistoryCancelledError" });
        reader.pages.push(offset);
        const out = fixtureGit(path, "log", "--topo-order", `--skip=${offset}`, `-n${count}`, "--format=%H%x00%P%x00%an%x00%ae%x00%at%x00%s", headOid);
        const commits: GitHistoryCommit[] = out ? out.split("\n").map(line => {
          const [oid = "", parents = "", authorName = "", authorEmail = "", time = "", summary = ""] = line.split("\0");
          return { oid, parents: parents.split(" ").filter(Boolean), authorName, authorEmail, time: Number(time), summary, lane: 0, color: 0, edges: [] };
        }) : [];
        return { offset, commits, done: commits.length < count };
      },
      close() { closed = true; },
    };
    opened.push(reader);
    return reader;
  };
}

function setup(path: string, options: Partial<Parameters<typeof createGitHistory>[2]> = {}) {
  let state!: HistoryState, notify: ((event: GitDirectoryChangeEvent) => void) | undefined;
  const opened: GitHistoryReader[] = [];
  const remove = jest.fn();
  const watch = jest.fn((_paths: string[], listener: (event: GitDirectoryChangeEvent) => void) => { notify = listener; return { remove }; });
  const controller = createGitHistory(next => { state = next; }, watch, { serviceFor: p => new GitService(p, realRunner), open: gitReader(path, opened), searchDelay: 0, ...options });
  controller.setRoot(path);
  return { controller, opened, remove, watch, state: () => state, notify: (filePath: string) => notify?.({ path, filePath, type: "change" }) };
}

const oids = (state: HistoryState) => state.commits.map(commit => commit.oid);

it("loads 500 commits at a time until the end, with no duplicates or gaps, and badges refs", async () => {
  const path = repo("paged");
  const t = setup(path);
  expect(t.opened).toHaveLength(0);
  await t.controller.activate();
  expect(t.state().commits).toHaveLength(500);
  expect(t.state()).toMatchObject({ done: false, loading: false, error: null, currentBranch: "main", head: { unborn: false } });
  await Promise.all([t.controller.loadMore(), t.controller.loadMore()]);
  expect((t.opened[0] as unknown as { pages: number[] }).pages).toEqual([0, 500]);
  while (!t.state().done) await t.controller.loadMore();
  const expected = fixtureGit(path, "log", "--topo-order", "--format=%H").split("\n");
  expect(expected.length).toBeGreaterThan(2000);
  expect(oids(t.state())).toEqual(expected);
  expect(new Set(oids(t.state())).size).toBe(expected.length);
  const head = expected[0]!;
  expect(t.state().refs.get(head)).toEqual([{ kind: "branch", name: "main" }, { kind: "remote", name: "origin/main" }, { kind: "tag", name: "v1.0" }]);
  expect(t.state().refs.get(expected[1]!)).toEqual([{ kind: "tag", name: "light" }]);
  t.controller.dispose();
  expect(t.remove).toHaveBeenCalledTimes(1);
  expect((t.opened[0] as unknown as { closed(): boolean }).closed()).toBe(true);
});

it("shows a merge's details against its first parent, a root commit's files, and parent selection", async () => {
  const path = repo("details");
  const t = setup(path);
  await t.controller.activate();
  const merge = t.state().commits.find(commit => commit.parents.length === 2 && commit.summary.startsWith("Merge side"))!;
  await t.controller.select(merge.oid);
  expect(t.state().details).toMatchObject({ oid: merge.oid, loading: false, error: null, commit: { parents: merge.parents, message: expect.stringMatching(/^Merge side \d+\n\nMerges the side branch\.$/) } });
  expect(t.state().details!.files.map(file => file.path)).toEqual(["file.txt"]);
  await t.controller.select(merge.parents[1]!);
  expect(t.state().selectedOid).toBe(merge.parents[1]);
  expect(t.state().details?.commit?.message).toMatch(/^Side \d+ step 2$/);
  const rootOid = fixtureGit(path, "rev-list", "--max-parents=0", "HEAD");
  await t.controller.select(rootOid);
  expect(t.state().details).toMatchObject({ commit: { parents: [], message: "Root commit" }, selectedPath: "file.txt" });
  expect(t.state().details!.files[0]!.file.oldPath).toBeNull();
  t.controller.dispose();
});

it("re-reads what was loaded when HEAD moves, keeps the selection by oid, and only re-reads refs when HEAD stays", async () => {
  const path = repo("moving");
  const t = setup(path);
  await t.controller.activate();
  await t.controller.loadMore();
  const selected = t.state().commits[700]!.oid;
  await t.controller.select(selected);
  writeFileSync(join(path, "new.txt"), "new\n");
  fixtureGit(path, "add", "new.txt");
  fixtureGit(path, "commit", "-q", "-m", "New work");
  t.notify(join(path, ".git/refs/heads/main"));
  await new Promise(resolve => setTimeout(resolve, 600));
  expect(t.opened).toHaveLength(2);
  expect((t.opened[0] as unknown as { closed(): boolean }).closed()).toBe(true);
  expect(t.state().commits[0]!.summary).toBe("New work");
  expect(t.state().commits).toHaveLength(1000);
  expect(t.state().selectedOid).toBe(selected);
  expect(t.state().details?.oid).toBe(selected);
  expect(t.state().refs.get(t.state().commits[0]!.oid)).toEqual([{ kind: "branch", name: "main" }]);

  fixtureGit(path, "tag", "later", t.state().commits[0]!.oid);
  await t.controller.refresh();
  expect(t.opened).toHaveLength(2);
  expect(t.state().refs.get(t.state().commits[0]!.oid)).toContainEqual({ kind: "tag", name: "later" });

  // A detached HEAD reports no current branch; a history rewrite drops a selection that no longer exists.
  fixtureGit(path, "switch", "-q", "--detach", "HEAD~3");
  await t.controller.refresh();
  expect(t.state()).toMatchObject({ currentBranch: null, selectedOid: selected });
  fixtureGit(path, "switch", "-q", "--orphan", "fresh");
  fixtureGit(path, "commit", "-q", "--allow-empty", "-m", "Fresh start");
  await t.controller.refresh();
  expect(t.state()).toMatchObject({ selectedOid: null, details: null, done: true });
  expect(t.state().commits.map(commit => commit.summary)).toEqual(["Fresh start"]);
  t.controller.dispose();
});

it("shows an empty state for an unborn HEAD, and switching repositories closes the walk", async () => {
  const path = repo("unborn", false);
  const t = setup(path);
  await t.controller.activate();
  expect(t.state()).toMatchObject({ head: { unborn: true }, commits: [], done: true, error: null, currentBranch: "main" });
  t.controller.setRoot(null);
  expect((t.opened[0] as unknown as { closed(): boolean }).closed()).toBe(true);
  expect(t.remove).toHaveBeenCalledTimes(1);
  expect(t.state()).toMatchObject({ root: null, head: null, commits: [] });
  t.controller.dispose();
});

it("splits a commit patch per file and formats relative dates", () => {
  const patch = "diff --git a/a.txt b/a.txt\nindex 1..2 100644\n--- a/a.txt\n+++ b/a.txt\n@@ -1 +1 @@\n-a\n+b\ndiff --git a/old.txt b/new.txt\nsimilarity index 100%\nrename from old.txt\nrename to new.txt\n";
  const files = splitCommitPatch(patch);
  expect(files.map(file => [file.path, file.file.hunks.length])).toEqual([["a.txt", 1], ["new.txt", 0]]);
  expect(files[0]!.text.startsWith("diff --git a/a.txt")).toBe(true);
  expect(files[1]!.file.oldPath).toBe("old.txt");
  const now = 1_700_000_000_000;
  expect(relativeDate(now / 1000 - 10, now)).toBe("just now");
  expect(relativeDate(now / 1000 - 60 * 5, now)).toBe("5 minutes ago");
  expect(relativeDate(now / 1000 - 3600, now)).toBe("1 hour ago");
  expect(relativeDate(now / 1000 - 86400 * 3, now)).toBe("3 days ago");
  expect(relativeDate(now / 1000 - 86400 * 400, now)).toMatch(/2022/);
});

it("runs overlapping reloads one at a time so the newest HEAD always lands last, and keeps pages loaded meanwhile", async () => {
  const path = repo("overlap");
  const t = setup(path);
  await Promise.all([t.controller.activate(), t.controller.refresh(), t.controller.refresh()]);
  // The first load walks once; the queued refreshes see HEAD unchanged and only re-read refs.
  expect(t.opened).toHaveLength(1);
  await t.controller.loadMore();
  writeFileSync(join(path, "a.txt"), "a\n");
  fixtureGit(path, "add", "a.txt");
  fixtureGit(path, "commit", "-q", "-m", "First move");
  const first = t.controller.refresh();
  writeFileSync(join(path, "b.txt"), "b\n");
  fixtureGit(path, "add", "b.txt");
  fixtureGit(path, "commit", "-q", "-m", "Second move");
  await Promise.all([first, t.controller.refresh()]);
  expect(t.state().commits[0]!.summary).toBe("Second move");
  expect(t.state().head?.oid).toBe(fixtureGit(path, "rev-parse", "HEAD"));
  expect(t.state().commits).toHaveLength(1000);
  expect(t.opened.slice(0, -1).every(reader => (reader as unknown as { closed(): boolean }).closed())).toBe(true);
  t.controller.dispose();
});

it("shows one file's history across a rename, selects the file's patch in each commit, refreshes it, and returns to the full history", async () => {
  const path = repo("file-history", false);
  const commit = (file: string, content: string, message: string) => {
    writeFileSync(join(path, file), content);
    fixtureGit(path, "add", "--", file);
    fixtureGit(path, "commit", "-q", "-m", message);
  };
  commit("old name.txt", "one\n", "Add");
  commit("other.txt", "x\n", "Other");
  fixtureGit(path, "mv", "old name.txt", "new ü.txt");
  writeFileSync(join(path, "other.txt"), "y\n");
  fixtureGit(path, "add", "other.txt");
  fixtureGit(path, "commit", "-q", "-m", "Rename and touch other");
  const t = setup(path);
  await t.controller.showFileHistory("new ü.txt");
  const expected = fixtureGit(path, "log", "--follow", "--format=%H", "--", "new ü.txt").split("\n");
  expect(t.state().file).toMatchObject({ path: "new ü.txt", done: true, loading: false, error: null });
  expect(t.state().file!.commits.map(commit => commit.oid)).toEqual(expected);
  expect(t.state().commits.length).toBe(3);
  // The newest commit is selected with the file's own patch, not the other file in that commit.
  expect(t.state().selectedOid).toBe(expected[0]);
  expect(t.state().details).toMatchObject({ selectedPath: "new ü.txt" });
  expect(t.state().details!.files.map(file => file.path)).toEqual(["new ü.txt", "other.txt"].sort());
  // Before the rename the file had its old path.
  await t.controller.select(expected[1]!);
  expect(t.state().details).toMatchObject({ oid: expected[1], selectedPath: "old name.txt" });

  commit("new ü.txt", "two\n", "Edit after rename");
  t.notify(join(path, ".git/refs/heads/main"));
  await new Promise(resolve => setTimeout(resolve, 600));
  expect(t.state().file!.commits).toHaveLength(3);
  expect(t.state().selectedOid).toBe(expected[1]);

  t.controller.closeFileHistory();
  expect(t.state().file).toBeNull();
  expect(t.state().commits).toHaveLength(4);
  t.controller.dispose();
});

it("keeps a file-history selection older than the loaded full history when HEAD moves", async () => {
  const path = repo("file-history-deep");
  const t = setup(path);
  await t.controller.showFileHistory("file.txt");
  await t.controller.loadMore();
  await t.controller.loadMore();
  const expected = fixtureGit(path, "log", "--follow", "--format=%H", "--", "file.txt").split("\n");
  expect(t.state().file!.commits.map(commit => commit.oid)).toEqual(expected.slice(0, 1500));
  const deep = expected[1200]!;
  expect(t.state().commits.some(commit => commit.oid === deep)).toBe(false);
  await t.controller.select(deep);
  writeFileSync(join(path, "file.txt"), "moved\n");
  fixtureGit(path, "commit", "-q", "-am", "Move HEAD");
  t.notify(join(path, ".git/refs/heads/main"));
  await new Promise(resolve => setTimeout(resolve, 1500));
  expect(t.state().file!.commits).toHaveLength(1500);
  expect(t.state().file!.commits[0]!.summary).toBe("Move HEAD");
  expect(t.state().selectedOid).toBe(deep);
  expect(t.state().details).toMatchObject({ oid: deep, selectedPath: "file.txt" });
  t.controller.dispose();
});

it("shows a failed file-history page in the file list, pages full and file history independently, and keeps loaded pages on a repeat", async () => {
  const path = repo("file-history-errors");
  const real = new GitService(path, realRunner);
  let failFiles = false;
  let releaseFull!: () => void;
  const opened: GitHistoryReader[] = [];
  const open = gitReader(path, opened);
  const controller = createGitHistory(next => { state = next; }, jest.fn(() => ({ remove: jest.fn() })), {
    serviceFor: () => Object.assign(Object.create(real) as GitService, {
      fileHistory: (file: string, options: Parameters<GitService["fileHistory"]>[1]) => failFiles && options?.offset ? Promise.reject(new Error("log failed")) : real.fileHistory(file, options),
    }),
    open: async (p: string) => {
      const reader = await open(p);
      const page = reader.page.bind(reader);
      return { ...reader, page: async (offset: number, count?: number, signal?: AbortSignal) => { if (offset) await new Promise<void>(resolve => { releaseFull = resolve; }); return page(offset, count, signal); } };
    },
  });
  let state!: HistoryState;
  controller.setRoot(path);
  await controller.activate();
  const fullPage = controller.loadMore();
  await controller.showFileHistory("file.txt");
  await controller.loadMore();
  expect(state.file!.commits).toHaveLength(1000);
  releaseFull();
  await fullPage;
  expect(state.commits).toHaveLength(1000);
  await controller.showFileHistory("file.txt");
  expect(state.file!.commits).toHaveLength(1000);
  failFiles = true;
  await controller.loadMore();
  expect(state.file).toMatchObject({ error: "log failed", done: true, loading: false });
  expect(state.file!.commits).toHaveLength(1000);
  expect(state.error).toBeNull();
  controller.dispose();
});

const settle = () => new Promise(resolve => setTimeout(resolve, 30));
async function until(check: () => boolean) {
  for (let attempt = 0; attempt < 200 && !check(); attempt++) await settle();
  expect(check()).toBe(true);
}

it("searches with a message: qualifier in place of the history, pages results by 500 with no duplicates, and Show All returns", async () => {
  const path = repo("search");
  const t = setup(path);
  await t.controller.activate();
  t.controller.search("message:COMMIT");
  expect(t.state().search).toMatchObject({ text: "message:COMMIT", loading: true });
  await until(() => t.state().search?.loading === false);
  const expected = fixtureGit(path, "log", "--topo-order", "--regexp-ignore-case", "--fixed-strings", "--grep=COMMIT", "--format=%H").split("\n");
  expect(expected.length).toBeGreaterThan(1000);
  expect(t.state().search).toMatchObject({ done: false, error: null });
  expect(t.state().search!.commits).toHaveLength(500);
  // The first result is selected, as in file history.
  expect(t.state().selectedOid).toBe(expected[0]);
  await Promise.all([t.controller.loadMore(), t.controller.loadMore()]);
  await t.controller.loadMore();
  const found = t.state().search!.commits.map(commit => commit.oid);
  expect(found).toEqual(expected.slice(0, 1500));
  expect(new Set(found).size).toBe(1500);
  // Showing a file's history ends the search; an empty query does too.
  t.controller.search('author:"nobody here"');
  await until(() => t.state().search?.loading === false);
  expect(t.state().search).toMatchObject({ commits: [], done: true });
  t.controller.search("");
  expect(t.state().search).toBeNull();
  t.controller.dispose();
});

it("debounces typing, and a newer query cancels the running one so only its results land", async () => {
  const head = "a".repeat(40);
  const calls: { text: string; signal: AbortSignal; resolve: (page: { commits: unknown[]; done: boolean }) => void }[] = [];
  const git = {
    repoRoot: "/repo", watchLocations: async () => ({ root: "/repo", gitDir: "/repo/.git", commonDir: "/repo/.git", ignoredPaths: [] }),
    revParse: async () => head, refDecorations: async () => new Map(), remoteUrl: async () => null, currentBranch: async () => "main",
    commitDetails: () => new Promise(() => {}), commitPatch: () => new Promise(() => {}),
    searchHistory: jest.fn((query: GitHistoryQuery, { signal }: { signal: AbortSignal }) => new Promise(resolve => { calls.push({ text: query.options.join(" "), signal, resolve }); })),
  };
  let state!: HistoryState;
  const reader = { head: { handle: 1, headOid: head, unborn: false, detached: false }, page: async (offset: number) => ({ offset, commits: [], done: true }), close() {} };
  const controller = createGitHistory(next => { state = next; }, () => ({ remove() {} }), { serviceFor: () => git as unknown as GitService, open: async () => reader, searchDelay: 20 });
  controller.setRoot("/repo");
  await controller.activate();
  controller.search("message:f");
  controller.search("message:fi");
  controller.search("message:fix");
  await until(() => calls.length === 1);
  expect(calls[0]!.text).toContain("--grep=fix");
  controller.search("message:fixes");
  expect(calls[0]!.signal.aborted).toBe(true);
  await until(() => calls.length === 2);
  const row = (oid: string) => ({ oid, parents: [], authorName: "A", authorEmail: "a@x", time: 1, summary: oid, status: "", path: "", oldPath: null });
  calls[0]!.resolve({ commits: [row("old")], done: true });
  calls[1]!.resolve({ commits: [row("new")], done: true });
  await settle();
  expect(state.search).toMatchObject({ text: "message:fixes", loading: false, commits: [{ oid: "new" }] });
  expect(git.searchHistory).toHaveBeenLastCalledWith(expect.objectContaining({ revisions: [head], options: expect.arrayContaining(["--grep=fixes"]) }), expect.objectContaining({ offset: 0, count: 500 }));
  // A query that can't run says why, without running git.
  controller.search("before:soon");
  await until(() => state.search?.loading === false);
  expect(state.search).toMatchObject({ text: "before:soon", error: "before: needs a date like 2026-11-01.", commits: [] });
  expect(git.searchHistory).toHaveBeenCalledTimes(2);
  controller.dispose();
});

it("compares two selected commits older first, swaps them, and a plain selection ends the comparison", async () => {
  const path = repo("compare", false);
  const commit = (content: string, message: string) => {
    writeFileSync(join(path, "a.txt"), content);
    fixtureGit(path, "add", "a.txt");
    fixtureGit(path, "commit", "-q", "-m", message);
    return fixtureGit(path, "rev-parse", "HEAD");
  };
  const first = commit("one\n", "First");
  commit("two\n", "Second");
  const third = commit("three\n", "Third");
  const t = setup(path);
  await t.controller.activate();
  await t.controller.select(third);
  await t.controller.compare(first);
  expect(t.state().compare).toMatchObject({ base: first, target: third, loading: false, error: null, selectedPath: "a.txt" });
  expect(t.state().compare!.files[0]!.text).toContain("-one\n+three\n");
  await t.controller.swapCompare();
  expect(t.state().compare).toMatchObject({ base: third, target: first });
  expect(t.state().compare!.files[0]!.text).toContain("-three\n+one\n");
  // Selecting the other way round still puts the older commit first.
  await t.controller.select(first);
  expect(t.state().compare).toBeNull();
  await t.controller.compare(third);
  expect(t.state().compare).toMatchObject({ base: first, target: third });
  await t.controller.select(third);
  expect(t.state().compare).toBeNull();
  t.controller.dispose();
});

it("blames a line into the file's history and pages until the blamed commit is listed, selecting its file", async () => {
  const path = repo("blame", false);
  const blamed: string[] = [];
  for (let index = 0; index < 520; index++) {
    writeFileSync(join(path, index === 0 ? "old.txt" : "new.txt"), `${index}\n`);
    if (index === 1) fixtureGit(path, "rm", "-q", "--cached", "old.txt");
    fixtureGit(path, "add", "-A");
    fixtureGit(path, "commit", "-q", "-m", `Commit ${index}`);
    if (index < 2) blamed.push(fixtureGit(path, "rev-parse", "HEAD"));
  }
  const blame = jest.fn(async () => ({ oid: blamed[1]!, path: "new.txt", startLine: 1, originalStartLine: 1, lineCount: 1, authorName: "A", authorEmail: "a@x", time: 1, summary: "Commit 1" }));
  const t = setup(path, { blame });
  await expect(t.controller.blameLine("new.txt", "workdir", 1)).resolves.toMatchObject({ oid: blamed[1] });
  expect(blame).toHaveBeenCalledWith(path, "new.txt", "workdir", 1, undefined);
  await t.controller.showFileHistory("new.txt", blamed[1]);
  expect(t.state().file!.commits.length).toBeGreaterThan(500);
  expect(t.state().file!.commits.some(commit => commit.oid === blamed[1])).toBe(true);
  expect(t.state().selectedOid).toBe(blamed[1]);
  expect(t.state().details).toMatchObject({ oid: blamed[1], selectedPath: "new.txt" });
  t.controller.dispose();
}, 60_000);

it("stops paging toward a blamed commit when Show All and another file history replace it", async () => {
  const head = "a".repeat(40);
  const row = (index: number) => ({ oid: `c${index}`, parents: [], authorName: "A", authorEmail: "a@x", time: 1, summary: `${index}`, status: "M", path: "f.txt", oldPath: null });
  const pending: { offset: number; resolve: (page: { commits: unknown[]; done: boolean }) => void }[] = [];
  const git = {
    repoRoot: "/repo", watchLocations: async () => ({ root: "/repo", gitDir: "/repo/.git", commonDir: "/repo/.git", ignoredPaths: [] }),
    revParse: async () => head, refDecorations: async () => new Map(), remoteUrl: async () => null, currentBranch: async () => "main",
    commitDetails: async (oid: string) => ({ oid, parents: [], author: { name: "A", email: "a@x", time: 1 }, committer: { name: "A", email: "a@x", time: 1 }, message: oid }), commitPatch: async () => "",
    fileHistory: jest.fn((_path: string, { offset }: { offset: number }) => new Promise(resolve => { pending.push({ offset, resolve }); })),
  };
  const reader = { head: { handle: 1, headOid: head, unborn: false, detached: false }, page: async (offset: number) => ({ offset, commits: [], done: true }), close() {} };
  const controller = createGitHistory(() => {}, () => ({ remove() {} }), { serviceFor: () => git as unknown as GitService, open: async () => reader });
  controller.setRoot("/repo");
  await controller.activate();
  let finished = false;
  const blamed = controller.showFileHistory("f.txt", "c900").then(() => { finished = true; });
  await until(() => pending.length === 1);
  pending[0]!.resolve({ commits: Array.from({ length: 500 }, (_, index) => row(index)), done: false });
  await until(() => pending.length === 2);
  expect(pending[1]!.offset).toBe(500);
  // Show All, then the same file's history again, while the blame's page is still being read.
  controller.closeFileHistory();
  const reopened = controller.showFileHistory("f.txt");
  pending[1]!.resolve({ commits: [row(500)], done: false });
  await until(() => pending.length === 3);
  pending[2]!.resolve({ commits: [row(0)], done: true });
  await reopened;
  await until(() => finished);
  await blamed;
  expect(git.fileHistory).toHaveBeenCalledTimes(3);
  controller.dispose();
});

it("keeps search results when the same query arrives again, and re-runs the search when HEAD moves", async () => {
  const path = repo("search-repeat");
  const t = setup(path);
  await t.controller.activate();
  // A free word searches every field at once.
  t.controller.search("merge");
  await until(() => t.state().search?.loading === false);
  const first = t.state().search;
  t.controller.search("merge");
  expect(t.state().search).toBe(first);
  fixtureGit(path, "commit", "-q", "--allow-empty", "-m", "Merge-like new commit");
  t.notify(join(path, ".git/refs/heads/main"));
  await until(() => t.state().search !== first && t.state().search?.loading === false);
  expect(t.state().search!.commits[0]!.summary).toBe("Merge-like new commit");
  t.controller.dispose();
});

it("lists a ref's history, keeps the selection by oid, follows the ref when it moves, and a newer ref wins over a walk still running", async () => {
  const path = repo("ref-scoped");
  fixtureGit(path, "branch", "feature/ünï", "main~5");
  fixtureGit(path, "tag", "-a", "-m", "Annotated", "v-old", "main~8");
  const t = setup(path);
  await t.controller.activate();
  const shared = fixtureGit(path, "rev-parse", "main~6");
  await t.controller.showFileHistory("a.txt");
  await t.controller.select(shared);
  t.controller.setRef("refs/heads/feature/ünï");
  expect(t.state()).toMatchObject({ ref: "refs/heads/feature/ünï", commits: [], loading: true, file: null });
  await t.controller.refresh();
  expect(t.state().head?.oid).toBe(fixtureGit(path, "rev-parse", "main~5"));
  expect(oids(t.state()).slice(0, 3)).toEqual(fixtureGit(path, "rev-list", "--topo-order", "-n3", "feature/ünï").split("\n"));
  expect(t.state()).toMatchObject({ loading: false, selectedOid: shared });

  // The branch moving re-walks it; the selection stays when listed.
  fixtureGit(path, "update-ref", "refs/heads/feature/ünï", "main~4");
  await t.controller.refresh();
  expect(oids(t.state())[0]).toBe(fixtureGit(path, "rev-parse", "main~4"));
  expect(t.state().selectedOid).toBe(shared);

  // An annotated tag lists its commit's history; a commit outside it is deselected.
  await t.controller.select(fixtureGit(path, "rev-parse", "main"));
  t.controller.setRef("refs/tags/v-old");
  await t.controller.refresh();
  expect(oids(t.state())[0]).toBe(fixtureGit(path, "rev-parse", "main~8"));
  expect(t.state().selectedOid).toBeNull();

  // Switching again before the walk lands: only the newest ref's walk is kept.
  t.controller.setRef("refs/heads/feature/ünï");
  t.controller.setRef(null);
  await t.controller.refresh();
  expect(t.state()).toMatchObject({ ref: null, loading: false });
  expect(oids(t.state())[0]).toBe(fixtureGit(path, "rev-parse", "HEAD"));
  expect(t.state().commits).toHaveLength(500);
  expect(t.opened.slice(0, -1).every(reader => (reader as unknown as { closed(): boolean }).closed())).toBe(true);
  t.controller.dispose();
});

it("lists a branch's outgoing commits as a range, re-reads it when the base moves, and closes a file history on the same ref", async () => {
  const path = repo("range", false);
  const commit = (file: string, message: string) => {
    writeFileSync(join(path, file), `${message}\n`);
    fixtureGit(path, "add", "--", file);
    fixtureGit(path, "commit", "-q", "-m", message);
    return fixtureGit(path, "rev-parse", "HEAD");
  };
  commit("a.txt", "Base");
  fixtureGit(path, "switch", "-q", "-c", "feature");
  const first = commit("b.txt", "One");
  const second = commit("b.txt", "Two");
  fixtureGit(path, "switch", "-q", "main");
  const t = setup(path);
  t.controller.setRef("refs/heads/feature");
  await t.controller.activate();
  await t.controller.showFileHistory("b.txt");
  expect(t.state().file).not.toBeNull();
  // The same ref: the file history closes and only the outgoing commits are listed, newest selected.
  t.controller.setRange("refs/heads/feature", "refs/heads/main");
  await t.controller.refresh();
  expect(t.state().file).toBeNull();
  expect(t.state().range).toMatchObject({ base: "refs/heads/main", loading: false, error: null });
  expect(t.state().range!.commits.map(entry => entry.oid)).toEqual([second, first]);
  expect(t.state().selectedOid).toBe(second);
  // The base catches up by one commit (as after a push): the range shrinks, keeping the selection.
  fixtureGit(path, "update-ref", "refs/heads/main", first);
  await t.controller.refresh();
  expect(t.state().range!.commits.map(entry => entry.oid)).toEqual([second]);
  // Selecting the plain ref ends the range.
  t.controller.setRef("refs/heads/feature");
  expect(t.state().range).toBeNull();
  t.controller.dispose();
});
