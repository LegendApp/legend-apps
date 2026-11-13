import { spawn } from "node:child_process";
import { mkdirSync, readFileSync, realpathSync, rmSync, unlinkSync, watch as watchFS, writeFileSync } from "node:fs";
import { join } from "node:path";
import { runCommand } from "@legendapp/spark/processes";
import { createDiffGitSource } from "../../src/diffFiles";
import { loadDiffCompareRepoState } from "../../src/diffCompareTargets";
import { loadDiffMergeState } from "../../src/diffMerge";
import { readDiffGitSource } from "../../src/git/diffGitSource";
import { watchDiffRepo } from "../../src/git/diffRepoWatcher";
import { getDiffRepoStateBanner } from "../../src/git/diffRepoStateBanner";
import { GitService, type GitRunner } from "../../src/git/GitService";
import { fixtureGit, makeGitRepos } from "../fixtures/make-repos";

const realRunner: GitRunner = (options) => new Promise((resolve, reject) => {
  const command = options.target.type === "executable" ? options.target.path : options.target.name;
  const child = spawn(command, [...(options.args ?? [])], { cwd: options.cwd, env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", ...options.env }, signal: options.signal, stdio: ["ignore", "pipe", "pipe"] });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdout.on("data", (bytes: Buffer) => stdout.push(bytes));
  child.stderr.on("data", (bytes: Buffer) => stderr.push(bytes));
  child.on("error", (error) => {
    if (error.name !== "AbortError") reject(error);
  });
  child.on("close", (code, signal) => resolve({
    exit: signal ? { type: "terminated", signal: 15 } : { type: "exited", code: code! },
    stdout: new Uint8Array(Buffer.concat(stdout)),
    stderr: new Uint8Array(Buffer.concat(stderr)),
    timedOut: false,
    aborted: options.signal?.aborted ?? false,
    outputTruncated: false,
  }));
});

let repos: ReturnType<typeof makeGitRepos>;
beforeAll(() => { repos = makeGitRepos(); }, 20_000);
afterAll(() => { if (repos) rmSync(repos.root, { recursive: true, force: true }); });
const service = (path: string) => new GitService(path, realRunner);

it("reads staged/unstaged renames, binary, CRLF, missing-newline, modes and untracked names without changing the index", async () => {
  const before = readFileSync(join(repos.changes, ".git/index"));
  const status = await service(repos.changes).status();
  expect(status.branch).toMatchObject({ head: "main", oid: repos.second });
  expect(status.entries).toEqual(expect.arrayContaining([
    expect.objectContaining({ kind: "renamed", path: "renamed name.txt", originalPath: "old name.txt", indexStatus: "R" }),
    expect.objectContaining({ path: "staged.txt", indexStatus: "M", worktreeStatus: "M" }),
    expect.objectContaining({ path: "worktree.txt", indexStatus: ".", worktreeStatus: "M" }),
    expect.objectContaining({ path: "binary.bin", worktreeStatus: "M" }),
    expect.objectContaining({ path: "crlf.txt", worktreeStatus: "M" }),
    expect.objectContaining({ path: "no-eol.txt", worktreeStatus: "M" }),
    expect.objectContaining({ path: "mode.sh", modes: ["100644", "100644", "100755"] }),
    expect.objectContaining({ kind: "untracked", path: "untracked\nü.txt" }),
  ]));
  expect(status.entries.some((entry) => entry.path === "ignored.txt")).toBe(false);
  expect(readFileSync(join(repos.changes, ".git/index"))).toEqual(before);
  expect(fixtureGit(repos.changes, "stash", "list")).toContain("Fixture stash");
});

it("reads the three stages of a real content conflict", async () => {
  expect((await service(repos.merging).status()).entries).toContainEqual(expect.objectContaining({ kind: "unmerged", path: "conflict.txt", indexStatus: "U", worktreeStatus: "U" }));
  const records = (await service(repos.merging).unmerged()).split("\0").filter(Boolean);
  expect(records).toHaveLength(3);
  expect(records.map((record) => record.split("\t")[0]!.at(-1))).toEqual(["1", "2", "3"]);
});

it.each([
  ["changes", { branch: "main", detached: false, merging: false, rebasing: null, cherryPicking: false, reverting: false, bisecting: false }],
  ["merging", { merging: true, rebasing: null }],
  ["rebasing", { rebasing: "merge", detached: true }],
  ["rebaseApply", { rebasing: "apply", detached: true }],
  ["cherryPicking", { cherryPicking: true }],
  ["reverting", { reverting: true }],
  ["detached", { detached: true, branch: null }],
  ["bisecting", { bisecting: true, detached: true }],
  ["worktree", { branch: "linked", detached: false, merging: false, rebasing: null }],
] as const)("reads repository state for %s", async (key, expected) => {
  expect(await service(repos[key]).repoState()).toMatchObject(expected);
});

it("resolves linked worktree gitdir files and detects that worktree's own index lock", async () => {
  const git = service(repos.worktree);
  const state = await git.repoState();
  expect(state.gitDir).toContain("/.git/worktrees/linked");
  expect(await git.revParse("HEAD")).toBe(repos.second);
  const lock = join(state.gitDir, "index.lock");
  writeFileSync(lock, "fixture lock");
  try {
    await expect(git.status()).rejects.toMatchObject({ code: "index-locked", lockPath: lock });
    await expect(service(repos.changes).status()).resolves.toMatchObject({ branch: { head: "main" } });
  } finally {
    unlinkSync(lock);
  }
  expect((await git.status()).entries).toEqual([]);
});

it("resolves revisions and merge bases and shows root commits against the empty tree", async () => {
  const git = service(repos.changes);
  expect(await git.revParse("HEAD")).toBe(repos.second);
  expect(await git.mergeBase("main", "topic")).toBe(repos.first);
  expect(await git.showCommit(repos.first)).toContain("new file mode 100644");
  expect(await git.showCommit(repos.second)).toContain("+++ b/main-only.txt");
  await expect(git.revParse("--help")).rejects.toMatchObject({ code: "command-failed" });
});

it("loads index/workdir and HEAD/index as distinct comparisons with the expected files and hunks", async () => {
  const git = service(repos.changes);
  const unstaged = await readDiffGitSource(createDiffGitSource(repos.changes, { kind: "index-vs-workdir" }), {}, git);
  expect(unstaged).toContain("+++ b/worktree.txt");
  expect(unstaged).toContain("-staged\n+staged then unstaged");
  expect(unstaged).toContain("Binary files a/binary.bin and b/binary.bin differ");
  expect(unstaged).toContain("-before\r\n+after\r\n");
  expect(unstaged).toContain("\\ No newline at end of file");
  expect(unstaged).toContain("old mode 100644\nnew mode 100755");
  expect(unstaged).toContain("@@ -1 +1 @@");
  expect(unstaged).not.toContain("rename from");
  const staged = await readDiffGitSource(createDiffGitSource(repos.changes, { kind: "head-vs-index" }), {}, git);
  expect(staged).toContain("rename from old name.txt\nrename to renamed name.txt");
  expect(staged).toContain("-base\n+staged");
  expect(staged).not.toContain("staged then unstaged");
  expect(staged).not.toContain("+++ b/worktree.txt");
});

it("loads commits against their first parent and root commits against the empty tree", async () => {
  const git = service(repos.changes);
  const patch = await readDiffGitSource(createDiffGitSource(repos.changes, { kind: "commit", sha: repos.second }), {}, git);
  expect(patch).toContain("+++ b/main-only.txt\n@@ -0,0 +1 @@\n+main");
  expect(patch).not.toContain("staged.txt");
  const root = await readDiffGitSource(createDiffGitSource(repos.changes, { kind: "commit", sha: repos.first }), {}, git);
  expect(root).toContain("new file mode 100644");
  expect(root).toContain("+++ b/staged.txt\n@@ -0,0 +1 @@\n+base");
  const merge = await readDiffGitSource(createDiffGitSource(repos.merged, { kind: "commit", sha: "HEAD" }), {}, service(repos.merged));
  expect(merge).toContain("+++ b/topic.txt\n@@ -0,0 +1 @@\n+topic");
  expect(merge).not.toContain("main.txt");
});

it("distinguishes two-dot and three-dot ranges on diverged branches", async () => {
  const git = service(repos.changes);
  const two = await readDiffGitSource(createDiffGitSource(repos.changes, { kind: "range", range: "main..topic" }), {}, git);
  const three = await readDiffGitSource(createDiffGitSource(repos.changes, { kind: "range", range: "main...topic" }), {}, git);
  expect(two).toContain("--- a/main-only.txt\n+++ /dev/null\n@@ -1 +0,0 @@\n-main");
  expect(two).toContain("+++ b/topic-only.txt\n@@ -0,0 +1 @@\n+topic");
  expect(three).not.toContain("main-only.txt");
  expect(three).toContain("+++ b/topic-only.txt\n@@ -0,0 +1 @@\n+topic");
});

it("terminates a running child on cancellation and drains it before the next repository read", async () => {
  let started!: () => void;
  const ready = new Promise<void>((resolve) => { started = resolve; });
  let terminated = false;
  const runner: GitRunner = (options) => {
    if (!options.args?.includes("diff")) return realRunner(options);
    const child = realRunner({ ...options, target: { type: "command", name: "sh" }, args: ["-c", "exec sleep 30"] });
    started();
    return child.then((result) => {
      terminated = result.exit.type === "terminated";
      return result;
    });
  };
  const git = new GitService(repos.worktree, runner);
  const controller = new AbortController();
  const pending = git.diff([], { signal: controller.signal });
  await ready;
  controller.abort();
  await expect(pending).rejects.toMatchObject({ code: "aborted" });
  await git.status();
  expect(terminated).toBe(true);
});

it("loads compare refs and conflict contents through the migrated GitService paths", async () => {
  fixtureGit(repos.changes, "remote", "add", "origin", "https://example.test/repo.git");
  fixtureGit(repos.changes, "update-ref", "refs/remotes/origin/main", repos.second);
  fixtureGit(repos.changes, "symbolic-ref", "refs/remotes/origin/HEAD", "refs/remotes/origin/main");
  jest.mocked(runCommand).mockImplementation(realRunner);
  try {
    expect(await loadDiffCompareRepoState(repos.changes)).toMatchObject({
      currentBranch: "main", defaultBranch: "origin/main", localBranches: ["linked", "main", "topic"],
      remoteBranches: ["origin/HEAD", "origin/main"], remoteNames: ["origin"], repoPath: repos.changes,
    });
  } finally {
    jest.mocked(runCommand).mockReset();
  }
  expect(await loadDiffMergeState(repos.merging, { runCommand: realRunner })).toMatchObject({ status: "ready", conflictFileCount: 1, conflictBlockCount: 1, files: [expect.objectContaining({ path: "conflict.txt" })] });
});


it("reloads a changed fixture once through filesystem events and Git reads", async () => {
  const git = service(repos.changes);
  const locations = await git.watchLocations();
  expect(locations.root).toBe(realpathSync(repos.changes));
  expect(locations.ignoredPaths).toContain("ignored.txt");
  const reload = jest.fn(async () => {
    await git.repoState();
    expect(await git.diff(["--no-ext-diff", "--no-color", "--", "worktree.txt"])).toContain("watcher update");
  });
  const errors: unknown[] = [];
  const watcher = watchDiffRepo({
    locations,
    watch: (_directories, listener) => {
      const subscription = watchFS(locations.root, { recursive: true }, (_type, filename) => {
        if (filename) listener({ path: locations.root, filePath: join(locations.root, filename.toString()), type: "change", contentChanged: true });
      });
      return { remove: () => subscription.close() };
    },
    reload,
    onError: (error) => errors.push(error),
  });
  try {
    writeFileSync(join(repos.changes, "worktree.txt"), "watcher update\n");
    writeFileSync(join(repos.changes, "worktree.txt"), "watcher update coalesced\n");
    await new Promise((resolve) => setTimeout(resolve, 1400));
    expect(errors).toEqual([]);
    expect(reload).toHaveBeenCalledTimes(1);
  } finally {
    watcher.remove();
  }
});

it("discovers worktree/common watch roots from a subdirectory and renders real detached state", async () => {
  const nested = join(repos.worktree, "nested");
  mkdirSync(nested);
  writeFileSync(join(repos.worktree, "ignored.txt"), "ignored fixture\n");
  const locations = await service(nested).watchLocations();
  expect(locations.root).toBe(realpathSync(repos.worktree));
  expect(locations.ignoredPaths).toContain("ignored.txt");
  expect(locations.gitDir).toContain("/.git/worktrees/linked");
  expect(locations.commonDir).not.toBe(locations.gitDir);
  const detached = await service(repos.detached).repoState();
  expect(getDiffRepoStateBanner(detached)).toBe(`Detached HEAD — ${detached.detachedCommit!.slice(0, 8)}`);
});
