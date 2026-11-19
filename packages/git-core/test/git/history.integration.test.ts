import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitService, githubCommitUrl, type GitHistoryQuery } from "../../src/GitService";
import { fixtureGit } from "../fixtures/make-repos";
import { realRunner } from "../fixtures/realRunner";

let root: string;
beforeAll(() => { root = mkdtempSync(join(tmpdir(), "legend-git-history-")); });
afterAll(() => rmSync(root, { recursive: true, force: true }));

function repo(name: string) {
  const path = join(root, name);
  mkdirSync(path);
  fixtureGit(path, "init", "--initial-branch=main", "--template=");
  for (const [key, value] of Object.entries({ "user.name": "Git Test", "user.email": "git@example.test", "core.hooksPath": "/dev/null", "commit.gpgsign": "false", "tag.gpgsign": "false", "diff.noprefix": "true", "color.diff": "always", "diff.external": "false" })) fixtureGit(path, "config", key, value);
  return { path, git: new GitService(path, realRunner) };
}
function commit(path: string, file: string, content: string, message: string) {
  writeFileSync(join(path, file), content);
  fixtureGit(path, "add", "--", file);
  fixtureGit(path, "commit", "-q", "-m", message);
  return fixtureGit(path, "rev-parse", "HEAD");
}

it("reads a commit's message, people, dates and parents, for root, merge and unicode multi-line commits", async () => {
  const { path, git } = repo("details");
  const rootOid = commit(path, "a.txt", "one\n", "Root commit");
  fixtureGit(path, "switch", "-q", "-c", "side");
  const sideOid = commit(path, "b.txt", "side\n", "Side work");
  fixtureGit(path, "switch", "-q", "main");
  const mainOid = commit(path, "a.txt", "two\n", "Ünïcode ✓ subject\nsecond line\n\nBody paragraph.\n\n  indented");
  fixtureGit(path, "merge", "-q", "--no-ff", "-m", "Merge side", "side");
  const mergeOid = fixtureGit(path, "rev-parse", "HEAD");

  const root = await git.commitDetails(rootOid);
  expect(root).toMatchObject({ oid: rootOid, parents: [], message: "Root commit", author: { name: "Git Test", email: "git@example.test" } });
  expect(root.author.time).toBe(Number(fixtureGit(path, "log", "-1", "--format=%at", rootOid)));
  expect((await git.commitDetails(mainOid)).message).toBe("Ünïcode ✓ subject\nsecond line\n\nBody paragraph.\n\n  indented");
  expect((await git.commitDetails(mergeOid)).parents).toEqual([mainOid, sideOid]);

  // The root commit's patch adds its files; a merge is compared with its first parent only. The user's
  // noprefix and color settings do not leak into the format.
  const rootPatch = await git.commitPatch(rootOid);
  expect(rootPatch).toContain("diff --git a/a.txt b/a.txt\nnew file mode 100644");
  expect(rootPatch).toContain("+one\n");
  const mergePatch = await git.commitPatch(mergeOid);
  expect(mergePatch).toContain("diff --git a/b.txt b/b.txt");
  expect(mergePatch).not.toContain("a.txt");
  expect(mergePatch).not.toContain("\x1b[");
  await expect(git.commitPatch("--output=/tmp/x")).rejects.toThrow("Expected a commit id.");
});

it("decorates commits with branches, remote branches and peeled annotated and lightweight tags, and reads the branch and remote", async () => {
  const { path, git } = repo("refs");
  const first = commit(path, "a.txt", "1\n", "First");
  const second = commit(path, "a.txt", "2\n", "Second");
  fixtureGit(path, "branch", "feature", first);
  fixtureGit(path, "update-ref", "refs/remotes/origin/main", second);
  fixtureGit(path, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
  fixtureGit(path, "tag", "-a", "-m", "Release", "v1.0", first);
  fixtureGit(path, "tag", "light", second);

  const refs = await git.refDecorations();
  expect(refs.get(second)).toEqual([{ kind: "branch", name: "main" }, { kind: "remote", name: "origin/main" }, { kind: "tag", name: "light" }]);
  expect(refs.get(first)).toEqual([{ kind: "branch", name: "feature" }, { kind: "tag", name: "v1.0" }]);
  expect([...refs.keys()].sort()).toEqual([first, second].sort());
  expect(await git.currentBranch()).toBe("main");
  expect(await git.remoteUrl("origin")).toBeNull();

  fixtureGit(path, "remote", "add", "origin", "git@github.com:LegendApp/legend-apps.git");
  expect(await git.remoteUrl("origin")).toBe("git@github.com:LegendApp/legend-apps.git");
  fixtureGit(path, "switch", "-q", "--detach", first);
  expect(await git.currentBranch()).toBeNull();
});

it("builds github.com commit URLs from remote URLs and ignores other hosts", () => {
  const oid = "0123456789abcdef0123456789abcdef01234567";
  for (const url of ["git@github.com:LegendApp/legend-apps.git", "https://github.com/LegendApp/legend-apps", "https://github.com/LegendApp/legend-apps.git/", "ssh://git@github.com/LegendApp/legend-apps.git", "https://jay@github.com/LegendApp/legend-apps.git"]) {
    expect(githubCommitUrl(url, oid)).toBe(`https://github.com/LegendApp/legend-apps/commit/${oid}`);
  }
  for (const url of [null, "git@gitlab.com:LegendApp/legend-apps.git", "https://github.com.evil.example/LegendApp/legend-apps", "/local/path/repo", "https://github.com/LegendApp"]) {
    expect(githubCommitUrl(url, oid)).toBeNull();
  }
});

it("follows one file's history across a rename, a delete and re-add, and a path with spaces and unicode, paged", async () => {
  const { path, git } = repo("file-history");
  mkdirSync(join(path, "dir é"));
  const added = commit(path, "dir é/old name.txt", "line\n", "Add the file");
  commit(path, "other.txt", "x\n", "Unrelated");
  const edited = commit(path, "dir é/old name.txt", "line\nmore\n", "Edit the file");
  fixtureGit(path, "mv", "dir é/old name.txt", "new ü.txt");
  fixtureGit(path, "commit", "-q", "-m", "Rename the file");
  const renamed = fixtureGit(path, "rev-parse", "HEAD");
  fixtureGit(path, "rm", "-q", "new ü.txt");
  fixtureGit(path, "commit", "-q", "-m", "Delete the file");
  const deleted = fixtureGit(path, "rev-parse", "HEAD");
  const readded = commit(path, "new ü.txt", "back\n", "Re-add the file");
  commit(path, "other.txt", "y\n", "Unrelated again");

  const expected = fixtureGit(path, "log", "--follow", "--format=%H", "--", "new ü.txt").split("\n");
  const page = await git.fileHistory("new ü.txt");
  expect(page.done).toBe(true);
  expect(page.commits.map(commit => commit.oid)).toEqual(expected);
  expect(expected).toEqual([readded, deleted, renamed, edited, added]);
  expect(page.commits.map(({ status, path, oldPath }) => [status, path, oldPath])).toEqual([
    ["A", "new ü.txt", null],
    ["D", "new ü.txt", null],
    ["R", "new ü.txt", "dir é/old name.txt"],
    ["M", "dir é/old name.txt", null],
    ["A", "dir é/old name.txt", null],
  ]);
  expect(page.commits[2]).toMatchObject({ summary: "Rename the file", authorName: "Git Test", parents: [edited] });

  const first = await git.fileHistory("new ü.txt", { offset: 0, count: 2 });
  const second = await git.fileHistory("new ü.txt", { offset: 2, count: 2 });
  const third = await git.fileHistory("new ü.txt", { offset: 4, count: 2 });
  expect([first.done, second.done, third.done]).toEqual([false, false, true]);
  expect([...first.commits, ...second.commits, ...third.commits].map(commit => commit.oid)).toEqual(expected);
  // A page boundary right after the rename keeps following the old path.
  expect(third.commits[0]!.path).toBe("dir é/old name.txt");

  await expect(git.fileHistory("../outside")).rejects.toThrow("Expected a repository path");
  expect(await git.fileHistory("*")).toEqual({ commits: [], done: true });
});

it("has no file history on an unborn HEAD", async () => {
  const { git } = repo("file-history-unborn");
  expect(await git.fileHistory("a.txt")).toEqual({ commits: [], done: true });
});

it("searches history with git filters and a commit test, paged across 500/501 with no duplicates, matching git log", async () => {
  const { path, git } = repo("search");
  // 1,002 commits; the even ones match every scope, so each search finds 501.
  let stream = "";
  for (let index = 0; index < 1002; index++) {
    const match = index % 2 === 0;
    const file = match ? `src/Parser/p${index}.ts` : `docs/d${index}.md`;
    const content = match ? `NEEDLE ${index}\n` : `plain ${index}\n`;
    const message = match ? `Fix parser (#${index})\n` : `chore ${index}\n`;
    const who = match ? "Ann Match <ann@example.test>" : "Bob <bob@example.test>";
    stream += `commit refs/heads/main\nauthor ${who} ${1_700_000_000 + index} +0000\ncommitter ${who} ${1_700_000_000 + index} +0000\n`;
    stream += `data ${Buffer.byteLength(message)}\n${message}M 644 inline ${file}\ndata ${Buffer.byteLength(content)}\n${content}\n`;
  }
  execFileSync("git", ["fast-import", "--quiet"], { cwd: path, input: stream });
  fixtureGit(path, "reset", "-q", "--hard", "main");
  const head = fixtureGit(path, "rev-parse", "HEAD");
  const grep = (...args: string[]) => fixtureGit(path, "log", "--topo-order", "--format=%H", ...args.filter(arg => arg !== "--" && !arg.startsWith(":")), head, ...args.filter(arg => arg === "--" || arg.startsWith(":"))).split("\n");
  const fixed = ["--regexp-ignore-case", "--fixed-strings"];
  const queries: [GitHistoryQuery, string[]][] = [
    [{ revisions: [head], options: [...fixed, "--grep=PARSER (#"], paths: [] }, [...fixed, "--grep=PARSER (#"]],
    [{ revisions: [head], options: [...fixed, "--author=ann match"], paths: [] }, [...fixed, "--author=ann match"]],
    [{ revisions: [head], options: [], paths: [":(icase)*parser/*"] }, ["--", ":(icase)*parser/*"]],
    [{ revisions: [head], options: ["-SNEEDLE"], paths: [] }, ["-SNEEDLE"]],
    // A test git can't make reads the history in batches of 2,000 and keeps what passes.
    [{ revisions: [head], options: [], paths: [], match: commit => commit.message.includes("Fix parser") && commit.committerEmail === "ann@example.test" }, ["--grep=Fix parser"]],
  ];
  for (const [query, args] of queries) {
    const expected = grep(...args);
    expect(expected).toHaveLength(501);
    const first = await git.searchHistory(query);
    expect(first.done).toBe(false);
    expect(first.commits).toHaveLength(500);
    const second = await git.searchHistory(query, { offset: 500 });
    expect(second).toMatchObject({ done: true });
    const oids = [...first.commits, ...second.commits].map(commit => commit.oid);
    expect(new Set(oids).size).toBe(501);
    expect(oids).toEqual(expected);
    expect(first.commits[0]).toMatchObject({ oid: fixtureGit(path, "rev-parse", "HEAD~1"), summary: "Fix parser (#1000)", authorName: "Ann Match", committerName: "Ann Match", message: "Fix parser (#1000)" });
  }
  // Ref names come with each commit; a revision can leave a branch's commits out.
  fixtureGit(path, "tag", "v-old", "HEAD~1000");
  const tagged = await git.searchHistory({ revisions: [head, `^${fixtureGit(path, "rev-parse", "HEAD~999")}`], options: [], paths: [] }, { count: 2000 });
  expect(tagged.commits).toHaveLength(999);
  expect((await git.searchHistory({ revisions: [head], options: [], paths: [], match: commit => commit.refs.includes("v-old") })).commits.map(commit => commit.refs)).toEqual([["v-old"]]);
  expect((await git.searchHistory({ revisions: [head], options: [], paths: [] }, { count: 1 })).commits[0]!.refs).toEqual(["main"]);
  // A regex metacharacter is plain text; ids and options are checked.
  expect((await git.searchHistory({ revisions: [head], options: [...fixed, "--grep=(#100"], paths: [] })).commits.map(commit => commit.summary)).toEqual(["Fix parser (#1000)", "Fix parser (#100)"]);
  await expect(git.searchHistory({ revisions: ["HEAD"], options: [], paths: [] })).rejects.toThrow("Expected a commit id.");
  await expect(git.searchHistory({ revisions: [head], options: ["--output=/tmp/x"], paths: [] })).rejects.toThrow("Unsupported search option.");
});

it("compares two commits in either order, a merge with its second parent, and a root commit", async () => {
  const { path, git } = repo("compare");
  const rootOid = commit(path, "a.txt", "one\n", "Root");
  fixtureGit(path, "switch", "-q", "-c", "side");
  const sideOid = commit(path, "b.txt", "side\n", "Side");
  fixtureGit(path, "switch", "-q", "main");
  const mainOid = commit(path, "a.txt", "two\n", "Main");
  fixtureGit(path, "merge", "-q", "--no-ff", "-m", "Merge side", "side");
  const mergeOid = fixtureGit(path, "rev-parse", "HEAD");

  const forward = await git.compareCommits(rootOid, mainOid);
  expect(forward).toContain("-one\n+two\n");
  const backward = await git.compareCommits(mainOid, rootOid);
  expect(backward).toContain("-two\n+one\n");
  // The merge against its second parent shows main's change, not side's file.
  const merge = await git.compareCommits(sideOid, mergeOid);
  expect(merge).toContain("diff --git a/a.txt b/a.txt");
  expect(merge).not.toContain("b.txt");
  expect(fixtureGit(path, "diff", "--stat", sideOid, mergeOid)).toContain("a.txt");
  const fromRoot = await git.compareCommits(rootOid, mergeOid);
  expect(fromRoot).toContain("diff --git a/b.txt b/b.txt\nnew file mode 100644");
  expect(await git.compareCommits(mergeOid, mergeOid)).toBe("");
  await expect(git.compareCommits("--output=/tmp/x", mergeOid)).rejects.toThrow("Expected a commit id.");
});
