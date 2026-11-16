import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitService, type GitDirectoryChangeEvent } from "@legend-apps/git-core";
import type { GitHistoryCommit, GitHistoryReader } from "@legend-apps/diff-parser";
import { fixtureGit } from "../../../../packages/git-core/test/fixtures/make-repos";
import { realRunner } from "../../../../packages/git-core/test/fixtures/realRunner";
import { createGitHistory, relativeDate, splitCommitPatch, type HistoryState } from "../gitHistory";

jest.mock("@legend-apps/diff-parser", () => ({ gitHistoryPageSize: 500, openGitHistory: jest.fn() }));

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
  return async (_path: string): Promise<GitHistoryReader> => {
    const headOid = (() => { try { return fixtureGit(path, "rev-parse", "--verify", "-q", "HEAD"); } catch { return ""; } })();
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
          return { oid, parents: parents.split(" ").filter(Boolean), authorName, authorEmail, time: Number(time), summary };
        }) : [];
        return { offset, commits, done: commits.length < count };
      },
      close() { closed = true; },
    };
    opened.push(reader);
    return reader;
  };
}

function setup(path: string) {
  let state!: HistoryState, notify: ((event: GitDirectoryChangeEvent) => void) | undefined;
  const opened: GitHistoryReader[] = [];
  const remove = jest.fn();
  const watch = jest.fn((_paths: string[], listener: (event: GitDirectoryChangeEvent) => void) => { notify = listener; return { remove }; });
  const controller = createGitHistory(next => { state = next; }, watch, { serviceFor: p => new GitService(p, realRunner), open: gitReader(path, opened) });
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
