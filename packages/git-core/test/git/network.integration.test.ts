import { chmodSync, mkdirSync, mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createProgressParser, GitIndexLockedError, GitNoUpstreamError, GitPullDivergedError, GitPushRejectedError, GitService, GitServiceError, withoutProgress, type GitProgress, type GitRunner } from "../../src/GitService";
import { fixtureGit } from "../fixtures/make-repos";
import { realRunner } from "../fixtures/realRunner";

let root: string;
beforeAll(() => { root = realpathSync(mkdtempSync(join(tmpdir(), "legend-git-network-"))); });
afterAll(() => rmSync(root, { recursive: true, force: true }));

const identity = { "user.name": "Git Test", "user.email": "git@example.test", "core.hooksPath": "/dev/null", "commit.gpgsign": "false" };
function configure(path: string) {
  for (const [key, value] of Object.entries(identity)) fixtureGit(path, "config", key, value);
}
function commitFile(path: string, file: string, content: string, message: string) {
  writeFileSync(join(path, file), content);
  fixtureGit(path, "add", "--", file);
  fixtureGit(path, "commit", "-q", "-m", message);
  return fixtureGit(path, "rev-parse", "HEAD");
}

/** A bare remote (reached over file://, so Git speaks its pack protocol and reports progress), a clone, and a second clone. */
function setup(name: string, runner: GitRunner = realRunner) {
  const base = join(root, name);
  const remote = join(base, "remote.git");
  const seed = join(base, "seed");
  mkdirSync(seed, { recursive: true });
  fixtureGit(base, "init", "-q", "--bare", "--initial-branch=main", remote);
  fixtureGit(seed, "init", "-q", "--initial-branch=main");
  configure(seed);
  commitFile(seed, "a.txt", "1\n", "First");
  fixtureGit(seed, "push", "-q", `file://${remote}`, "main");
  const clone = (folder: string) => {
    const path = join(base, folder);
    fixtureGit(base, "clone", "-q", `file://${remote}`, path);
    configure(path);
    return path;
  };
  const path = clone("repo");
  const other = clone("other");
  return { base, remote, path, other, git: new GitService(path, runner) };
}
const status = (path: string) => fixtureGit(path, "status", "--porcelain=v2", "--branch").split("\n").find(line => line.startsWith("# branch.ab")) ?? null;

it("fetches new commits, so the branch is behind, and prunes a deleted remote branch", async () => {
  const { path, other, git } = setup("fetch");
  fixtureGit(other, "push", "-q", "origin", "main:gone");
  await git.fetch({ remote: "origin" });
  expect(fixtureGit(path, "branch", "-r")).toContain("origin/gone");
  const pushed = commitFile(other, "b.txt", "2\n", "Second");
  fixtureGit(other, "push", "-q", "origin", "main", ":gone");
  const progress: GitProgress[] = [];
  await git.fetch({ remote: "origin", prune: true, onProgress: entry => progress.push(entry) });
  expect(fixtureGit(path, "rev-parse", "origin/main")).toBe(pushed);
  expect(fixtureGit(path, "branch", "-r")).not.toContain("origin/gone");
  expect((await git.status()).branch).toMatchObject({ upstream: "origin/main", ahead: 0, behind: 1 });
  expect(progress.some(entry => entry.percent === 100)).toBe(true);
  // Without a remote, every remote is fetched.
  await git.fetch();
});

it("pulls a fast-forward, and refuses a diverged pull with Git's message, leaving work intact", async () => {
  const { path, other, git } = setup("pull");
  const pushed = commitFile(other, "b.txt", "2\n", "Second");
  fixtureGit(other, "push", "-q", "origin", "main");
  writeFileSync(join(path, "untracked.txt"), "keep\n");
  await git.pull();
  expect(fixtureGit(path, "rev-parse", "HEAD")).toBe(pushed);
  expect(fixtureGit(path, "rev-parse", "ORIG_HEAD")).not.toBe(pushed);
  expect((await git.status()).branch).toMatchObject({ ahead: 0, behind: 0 });

  const remoteHead = commitFile(other, "c.txt", "3\n", "Third");
  fixtureGit(other, "push", "-q", "origin", "main");
  const local = commitFile(path, "d.txt", "4\n", "Local");
  writeFileSync(join(path, "a.txt"), "edited\n");
  const error = await git.pull().catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(GitPullDivergedError);
  expect((error as Error).message).toMatch(/fast-forward/i);
  expect(fixtureGit(path, "rev-parse", "HEAD")).toBe(local);
  expect(fixtureGit(path, "rev-parse", "origin/main")).toBe(remoteHead);
  expect(fixtureGit(path, "status", "--porcelain")).toBe(" M a.txt\n?? untracked.txt".trim());
});

it("refuses a pull while index.lock exists, and pull/push without an upstream", async () => {
  const { path, git } = setup("lock");
  writeFileSync(join(path, ".git", "index.lock"), "");
  await expect(git.pull()).rejects.toBeInstanceOf(GitIndexLockedError);
  rmSync(join(path, ".git", "index.lock"));
  fixtureGit(path, "switch", "-q", "-c", "topic");
  await expect(git.pull()).rejects.toBeInstanceOf(GitNoUpstreamError);
  await expect(git.push()).rejects.toBeInstanceOf(GitNoUpstreamError);
});

it("pushes to an existing upstream, publishes a new branch with --set-upstream, and reports a rejected push", async () => {
  const { remote, path, other, git } = setup("push");
  const local = commitFile(path, "b.txt", "2\n", "Second");
  expect((await git.status()).branch.ahead).toBe(1);
  const progress: GitProgress[] = [];
  await git.push({ onProgress: entry => progress.push(entry) });
  expect(fixtureGit(remote, "rev-parse", "main")).toBe(local);
  expect((await git.status()).branch.ahead).toBe(0);
  expect(progress.map(entry => entry.phase)).toContain("Writing objects");

  fixtureGit(path, "switch", "-q", "-c", "topic ü".replace(" ", "-"));
  const topic = commitFile(path, "t.txt", "t\n", "Topic");
  expect(await git.publishRemote()).toBe("origin");
  await git.push({ setUpstream: "origin" });
  expect(fixtureGit(path, "rev-parse", "--abbrev-ref", "@{u}")).toBe("origin/topic-ü");
  expect(fixtureGit(remote, "rev-parse", "topic-ü")).toBe(topic);

  // A branch tracking an upstream of another name pushes there, whatever push.default says.
  fixtureGit(path, "config", "push.default", "simple");
  fixtureGit(path, "switch", "-q", "-c", "local-name", "--track", "origin/topic-ü");
  const renamed = commitFile(path, "r.txt", "r\n", "Renamed");
  await git.push();
  expect(fixtureGit(remote, "rev-parse", "topic-ü")).toBe(renamed);
  expect(fixtureGit(remote, "branch", "--list", "local-name")).toBe("");

  fixtureGit(path, "switch", "-q", "main");
  fixtureGit(other, "pull", "-q", "--ff-only");
  commitFile(other, "c.txt", "3\n", "Remote");
  fixtureGit(other, "push", "-q", "origin", "main");
  commitFile(path, "d.txt", "4\n", "Diverged");
  const error = await git.push().catch((caught: unknown) => caught);
  expect(error).toBeInstanceOf(GitPushRejectedError);
  expect((error as Error).message).toMatch(/\[rejected\]/);
  expect((error as Error).message).not.toMatch(/Enumerating objects|\r/);
  expect(fixtureGit(remote, "rev-parse", "main")).toBe(fixtureGit(other, "rev-parse", "HEAD"));
  await expect(git.push({ setUpstream: "--force" })).rejects.toThrow(/isn’t a remote name/);
});

it("cancels a slow fetch and push, leaving refs as they were", async () => {
  const { base, path, other, git } = setup("cancel");
  const slow = (name: string, command: string) => {
    const script = join(base, name);
    writeFileSync(script, `#!/bin/sh\nsleep 30\nexec ${command} "$@"\n`);
    chmodSync(script, 0o755);
    return script;
  };
  fixtureGit(path, "config", "remote.origin.uploadpack", slow("slow-upload-pack", "git-upload-pack"));
  fixtureGit(path, "config", "remote.origin.receivepack", slow("slow-receive-pack", "git-receive-pack"));
  commitFile(other, "b.txt", "2\n", "Second");
  fixtureGit(other, "push", "-q", "origin", "main");
  const before = fixtureGit(path, "for-each-ref");
  for (const operation of [(signal: AbortSignal) => git.fetch({ remote: "origin", signal }), (signal: AbortSignal) => git.push({ signal })]) {
    const controller = new AbortController();
    const started = Date.now();
    const pending = operation(controller.signal);
    setTimeout(() => controller.abort(), 300);
    await expect(pending).rejects.toMatchObject({ code: "aborted" });
    expect(Date.now() - started).toBeLessThan(5_000);
  }
  // An operation waiting for another's slot ends at once on abort.
  const first = new AbortController();
  const running = git.fetch({ remote: "origin", signal: first.signal });
  const waiting = new AbortController();
  const queued = git.fetch({ remote: "origin", signal: waiting.signal });
  const queuedAt = Date.now();
  setTimeout(() => waiting.abort(), 200);
  await expect(queued).rejects.toMatchObject({ code: "aborted" });
  expect(Date.now() - queuedAt).toBeLessThan(5_000);
  first.abort();
  await expect(running).rejects.toMatchObject({ code: "aborted" });
  expect(fixtureGit(path, "for-each-ref")).toBe(before);
  fixtureGit(path, "fsck", "--no-progress");
  // The network slot is free again.
  fixtureGit(path, "config", "--unset", "remote.origin.uploadpack");
  await git.fetch({ remote: "origin" });
  expect(status(path)).toBe("# branch.ab +0 -1");
});

it("fails fast without prompting on a missing remote, an HTTP auth challenge and an unreachable SSH host", async () => {
  const environments: Record<string, string>[] = [];
  const runner: GitRunner = options => { environments.push({ ...options.env }); return realRunner(options); };
  const { path, git } = setup("auth", runner);
  await expect(git.fetch({ remote: "nope" })).rejects.toThrow(/nope/);
  const server = createServer((_request, response) => { response.writeHead(401, { "WWW-Authenticate": 'Basic realm="test"' }); response.end(); });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  try {
    const { port } = server.address() as { port: number };
    fixtureGit(path, "remote", "add", "private", `http://127.0.0.1:${port}/repo.git`);
    const started = Date.now();
    await expect(git.fetch({ remote: "private" })).rejects.toThrow(/Username|terminal prompts disabled|Authentication/i);
    expect(Date.now() - started).toBeLessThan(10_000);
  } finally { server.close(); }
  fixtureGit(path, "remote", "add", "ssh", "ssh://git@127.0.0.1:1/repo.git");
  await expect(git.fetch({ remote: "ssh" })).rejects.toThrow(/ssh|connect/i);
  expect(environments.at(-1)).toMatchObject({ GIT_TERMINAL_PROMPT: "0", GIT_SSH_COMMAND: "ssh -o BatchMode=yes" });
  // A configured core.sshCommand is left to choose the command.
  fixtureGit(path, "config", "core.sshCommand", "ssh -o ConnectTimeout=1");
  await expect(git.fetch({ remote: "ssh" })).rejects.toThrow();
  expect(environments.at(-1)?.GIT_SSH_COMMAND).toBeUndefined();
});

it("parses --progress output split across chunks, and strips it from messages", () => {
  const seen: GitProgress[] = [];
  const parse = createProgressParser(entry => seen.push(entry));
  for (const chunk of ["remote: Enumerating objects: 5, done.\nremote: Counting objects:  20% (1/5)\rremote: Counting obj", "ects: 100% (5/5), done.\n", "Receiving objects:  45% (450/1000), 1.20 MiB | 1.00 MiB/s\r", "Receiving objects: 100% (1000/1000), 2.00 MiB | 1.00 MiB/s, done.\nResolving deltas:  50% (1/2)\r", "Writing objects:   7% (7/100)"]) parse(chunk);
  expect(seen).toEqual([
    { phase: "Counting objects", percent: 20 },
    { phase: "Counting objects", percent: 100 },
    { phase: "Receiving objects", percent: 45 },
    { phase: "Receiving objects", percent: 100 },
    { phase: "Resolving deltas", percent: 50 },
  ]);
  parse("\n");
  expect(seen.at(-1)).toEqual({ phase: "Writing objects", percent: 7 });
  parse("Получение объектов:  45% (450/1000)\r");
  expect(seen.at(-1)).toEqual({ phase: "Получение объектов", percent: 45 });
  expect(withoutProgress("Enumerating objects: 3, done.\nWriting objects:  50% (1/2)\rWriting objects: 100% (2/2), done.\nTotal 2 (delta 0)\nTo /x\n ! [rejected]        main -> main (fetch first)\nerror: failed to push some refs\n"))
    .toBe("To /x\n ! [rejected]        main -> main (fetch first)\nerror: failed to push some refs\n");
});

it("decodes progress whole when a UTF-8 character is split between stderr chunks", async () => {
  const text = new TextEncoder().encode("Réception des objets:  45% (1/2)\rRéception des objets: 100% (2/2), done.\n");
  const split = text.indexOf(0xc3) + 1;
  const runner: GitRunner = async options => {
    const args = options.args ?? [];
    if (args.includes("fetch")) { options.onOutput?.({ stream: "stderr", bytes: text.slice(0, split) }); options.onOutput?.({ stream: "stderr", bytes: text.slice(split) }); }
    const stdout = args.includes("--absolute-git-dir") || args.includes("--git-common-dir") ? "/repo/.git\n" : "";
    return { exit: { type: "exited", code: args.includes("core.sshCommand") ? 1 : 0 }, stdout: new TextEncoder().encode(stdout), stderr: text, timedOut: false, aborted: false, outputTruncated: false };
  };
  const seen: GitProgress[] = [];
  await new GitService("/repo", runner).fetch({ remote: "origin", onProgress: entry => seen.push(entry) });
  expect(seen).toEqual([{ phase: "Réception des objets", percent: 45 }, { phase: "Réception des objets", percent: 100 }]);
});

it("fetches a pull request's head into a new branch, fast-forwards it (also checked out), and refuses a diverged branch with Git's message", async () => {
  const { path, other, remote, git } = setup("pull-request");
  fixtureGit(other, "switch", "-q", "-c", "feature");
  const first = commitFile(other, "b.txt", "2\n", "Second");
  fixtureGit(other, "push", "-q", "origin", "feature:refs/pull/7/head");
  await expect(git.fetchPullRequest("origin", 7, "bo/feature")).resolves.toBe(first);
  expect(fixtureGit(path, "rev-parse", "refs/heads/bo/feature")).toBe(first);
  // Nothing is checked out by the fetch.
  expect(fixtureGit(path, "symbolic-ref", "--short", "HEAD")).toBe("main");

  // A newer head fast-forwards the branch, also while it is checked out.
  const second = commitFile(other, "c.txt", "3\n", "Third");
  fixtureGit(other, "push", "-q", "origin", "feature:refs/pull/7/head");
  fixtureGit(path, "switch", "-q", "bo/feature");
  await expect(git.fetchPullRequest("origin", 7, "bo/feature")).resolves.toBe(second);
  expect(fixtureGit(path, "rev-parse", "HEAD")).toBe(second);
  expect(fixtureGit(path, "status", "--porcelain")).toBe("");

  // A branch with its own commits isn't overwritten, checked out or not.
  const own = commitFile(path, "mine.txt", "mine\n", "Mine");
  const forced = commitFile(other, "d.txt", "4\n", "Rewritten");
  fixtureGit(other, "push", "-q", "-f", "origin", "feature:refs/pull/7/head");
  await expect(git.fetchPullRequest("origin", 7, "bo/feature")).rejects.toThrow(/Not possible to fast-forward|diverg/i);
  expect(fixtureGit(path, "rev-parse", "HEAD")).toBe(own);
  fixtureGit(path, "switch", "-q", "main");
  await expect(git.fetchPullRequest("origin", 7, "bo/feature")).rejects.toThrow(/rejected.*non-fast-forward/);
  expect(fixtureGit(path, "rev-parse", "refs/heads/bo/feature")).toBe(own);
  expect(forced).not.toBe(own);

  // A branch checked out in another worktree is Git's to refuse.
  fixtureGit(path, "worktree", "add", "-q", join(root, "pull-request-linked"), "bo/feature");
  await expect(git.fetchPullRequest("origin", 7, "bo/feature")).rejects.toThrow(/refusing to fetch into branch/);
  // A missing pull request, a bad number and a bad branch name.
  await expect(git.fetchPullRequest("origin", 8, "pr-8")).rejects.toThrow(/couldn't find remote ref refs\/pull\/8\/head/);
  await expect(git.fetchPullRequest("origin", 0, "pr-0")).rejects.toThrow("isn’t a pull request number");
  await expect(git.fetchPullRequest("origin", 7, "bad..name")).rejects.toThrow("isn’t a valid branch name");
  expect(fixtureGit(remote, "for-each-ref", "--format=%(refname)", "refs/heads")).toBe("refs/heads/main");
});
