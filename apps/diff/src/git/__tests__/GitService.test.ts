import type { ProcessOptions } from "@legendapp/spark/processes";
import { GitIndexLockedError, GitService, getGitService, type GitRunner } from "../GitService";
import { parseGitStatus } from "../gitStatus";
import { processResult } from "../../__tests__/processFixtures";

function runnerFor(run: (options: ProcessOptions) => ReturnType<GitRunner> = async () => processResult()) {
  return jest.fn<ReturnType<GitRunner>, [ProcessOptions]>(async (options) => {
    if (options.args?.includes("--absolute-git-dir")) return processResult({ stdout: `${options.cwd}/.git\n` });
    if (options.target.type === "command" && options.target.name === "sh") return processResult({ stdout: "ref: refs/heads/main\n\0" });
    return run(options);
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

it("parses recorded porcelain v2 records without splitting whitespace in paths", () => {
  const status = parseGitStatus([
    "# branch.oid aaaa",
    "# branch.head topic",
    "# branch.upstream origin/topic",
    "# branch.ab +2 -3",
    "1 .M N... 100644 100644 100644 aaaa aaaa space and\tline\nquote\".txt",
    "2 R. N... 100644 100644 100644 aaaa bbbb R100 new name.txt",
    "old\nname.txt",
    "2 C. N... 100644 100644 100644 aaaa aaaa C100 copy.txt",
    "original.txt",
    "u UU N... 100644 100644 100644 100644 aaaa bbbb cccc conflict.txt",
    "? untracked\nfile.txt",
    "! ignored.txt",
    "",
  ].join("\0"));
  expect(status.branch).toEqual({ oid: "aaaa", head: "topic", upstream: "origin/topic", ahead: 2, behind: 3 });
  expect(status.entries).toEqual([
    expect.objectContaining({ kind: "ordinary", indexStatus: ".", worktreeStatus: "M", path: "space and\tline\nquote\".txt", modes: ["100644", "100644", "100644"], oids: ["aaaa", "aaaa"] }),
    expect.objectContaining({ kind: "renamed", indexStatus: "R", path: "new name.txt", originalPath: "old\nname.txt", score: "R100" }),
    expect.objectContaining({ kind: "copied", indexStatus: "C", path: "copy.txt", originalPath: "original.txt", score: "C100" }),
    expect.objectContaining({ kind: "unmerged", path: "conflict.txt", modes: ["100644", "100644", "100644", "100644"], oids: ["aaaa", "bbbb", "cccc"] }),
    { kind: "untracked", indexStatus: "?", worktreeStatus: "?", path: "untracked\nfile.txt" },
  ]);
});

it("parses unborn/detached branch headers and rejects incomplete rename records", () => {
  expect(parseGitStatus("# branch.oid (initial)\0# branch.head main\0").branch).toMatchObject({ oid: "(initial)", head: "main" });
  expect(parseGitStatus("# branch.head (detached)\0").branch.head).toBe("(detached)");
  expect(() => parseGitStatus("2 R. N... 100644 100644 100644 a b R100 new\0")).toThrow("Missing original path");
});

it("shares a service per root and serializes operations even across injected instances", async () => {
  expect(getGitService("/repo/")).toBe(getGitService("/repo"));
  const firstStarted = deferred<void>();
  const release = deferred<ReturnType<typeof processResult>>();
  const calls: string[] = [];
  const runner = runnerFor(async (options) => {
    calls.push(options.args!.at(-1)!);
    if (calls.length === 1) {
      firstStarted.resolve();
      return release.promise;
    }
    return processResult({ stdout: "second\n" });
  });
  const service = new GitService("/serial", runner);
  const first = service.revParse("first");
  await firstStarted.promise;
  const second = new GitService("/serial/", runner).revParse("second");
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(calls).toEqual(["first"]);
  release.resolve(processResult({ stdout: "first\n" }));
  await expect(first).resolves.toBe("first");
  await expect(second).resolves.toBe("second");
  expect(calls).toEqual(["first", "second"]);
  expect(runner.mock.calls.every(([options]) => options.env?.GIT_TERMINAL_PROMPT === "0" && options.env.GIT_OPTIONAL_LOCKS === "0")).toBe(true);
  expect(runner.mock.calls.filter(([options]) => options.target.type === "command" && options.target.name === "git").every(([options]) => options.args?.slice(0, 2).join(" ") === "-c core.quotepath=off")).toBe(true);
});

it("cancels queued work immediately and waits for the running child to drain before advancing", async () => {
  const started = deferred<void>();
  const exit = deferred<ReturnType<typeof processResult>>();
  let childSignal: AbortSignal | undefined;
  const calls: string[] = [];
  const runner = runnerFor(async (options) => {
    const ref = options.args!.at(-1)!;
    calls.push(ref);
    if (ref === "running") {
      childSignal = options.signal;
      started.resolve();
      return exit.promise;
    }
    return processResult({ stdout: ref });
  });
  const service = new GitService("/cancel", runner);
  const active = new AbortController();
  const running = service.revParse("running", { signal: active.signal });
  await started.promise;
  const queued = new AbortController();
  const skipped = service.revParse("skipped", { signal: queued.signal });
  queued.abort();
  await expect(skipped).rejects.toMatchObject({ code: "aborted" });
  active.abort();
  await expect(running).rejects.toMatchObject({ code: "aborted" });
  expect(childSignal?.aborted).toBe(true);
  const next = service.revParse("next");
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(calls).toEqual(["running"]);
  exit.resolve({ ...processResult(), aborted: true, exit: { type: "terminated", signal: 15 } });
  await expect(next).resolves.toBe("next");
  expect(calls).toEqual(["running", "next"]);
});

it("rejects pre-aborted operations without launching a child", async () => {
  const runner = runnerFor();
  const controller = new AbortController();
  controller.abort();
  await expect(new GitService("/pre-abort", runner).status({ signal: controller.signal })).rejects.toMatchObject({ code: "aborted" });
  expect(runner).not.toHaveBeenCalled();
});

it("reports a linked-worktree index.lock before starting the requested command", async () => {
  const runner: GitRunner = jest.fn(async (options) => processResult({ stdout: options.args?.includes("--absolute-git-dir") ? "/main/.git/worktrees/linked\n" : "ref: refs/heads/topic\n\0index.lock\0" }));
  const service = new GitService("/linked", runner);
  await expect(service.status()).rejects.toBeInstanceOf(GitIndexLockedError);
  await expect(service.status()).rejects.toMatchObject({ code: "index-locked", lockPath: "/main/.git/worktrees/linked/index.lock" });
  expect(jest.mocked(runner).mock.calls.some(([options]) => options.args?.includes("status"))).toBe(false);
});

it("records failures with a bounded stderr tail, recovers the queue, and caps the operation log", async () => {
  const runner = runnerFor(async (options) => options.args?.includes("bad")
    ? processResult({ exitCode: 128, stderr: "x".repeat(5000) })
    : processResult({ stdout: "good" }));
  const service = new GitService("/log", runner);
  await expect(service.revParse("bad")).rejects.toMatchObject({ code: "command-failed" });
  const failure = service.getOperationLog().at(-1)!;
  expect(failure).toMatchObject({ command: "git", exit: { type: "exited", code: 128 } });
  expect(failure.stderrTail.length).toBe(4096);
  expect(failure.endedAt).toBeGreaterThanOrEqual(failure.startedAt);
  await expect(service.revParse("good")).resolves.toBe("good");
  for (let i = 0; i < 101; i += 1) await service.repoState();
  expect(service.getOperationLog()).toHaveLength(100);
});

it.each([
  [{ ...processResult(), timedOut: true }, "timed-out"],
  [{ ...processResult(), outputTruncated: true }, "output-truncated"],
] as const)("rejects incomplete command output", async (result, code) => {
  await expect(new GitService(`/error-${code}`, runnerFor(async () => result)).diff([])).rejects.toMatchObject({ code });
});

it("allows independent repositories to read concurrently", async () => {
  const started = deferred<void>();
  const release = deferred<ReturnType<typeof processResult>>();
  const one = new GitService("/independent-one", runnerFor(async () => {
    started.resolve();
    return release.promise;
  })).diff([]);
  await started.promise;
  await expect(new GitService("/independent-two", runnerFor(async () => processResult({ stdout: "other repo" }))).diff([])).resolves.toBe("other repo");
  release.resolve(processResult());
  await one;
});

it("serializes root and subdirectory callers using the same resolved Git directory", async () => {
  const started = deferred<void>();
  const release = deferred<ReturnType<typeof processResult>>();
  const calls: string[] = [];
  const runner: GitRunner = async (options) => {
    if (options.args?.includes("--absolute-git-dir")) return processResult({ stdout: "/shared/.git\n" });
    if (options.target.type === "command" && options.target.name === "sh") return processResult({ stdout: "ref: refs/heads/main\n\0" });
    calls.push(options.cwd!);
    if (options.cwd === "/shared") {
      started.resolve();
      return release.promise;
    }
    return processResult();
  };
  const first = new GitService("/shared", runner).diff([]);
  await started.promise;
  const second = new GitService("/shared/src", runner).diff([]);
  await new Promise<void>((resolve) => setImmediate(resolve));
  expect(calls).toEqual(["/shared"]);
  release.resolve(processResult());
  await Promise.all([first, second]);
  expect(calls).toEqual(["/shared", "/shared/src"]);
});
