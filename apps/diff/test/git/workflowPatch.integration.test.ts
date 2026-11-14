import { spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitService, type GitRunner } from "../../src/git/GitService";
import { storyHash } from "../../src/story/storyHash";
import { applyWorkflowPatch, canApplyWorkflowPatch } from "../../src/workflows/workflowPatch";
import type { WorkflowPatch } from "../../src/workflows/workflowContract";
import { fixtureGit } from "../fixtures/make-repos";

const runner: GitRunner = options => new Promise((resolve, reject) => {
  const command = options.target.type === "executable" ? options.target.path : options.target.name;
  const child = spawn(command, [...(options.args ?? [])], { cwd: options.cwd, env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", ...options.env }, signal: options.signal, stdio: ["pipe", "pipe", "pipe"] });
  const stdout: Buffer[] = [], stderr: Buffer[] = [];
  child.stdout.on("data", bytes => stdout.push(bytes)); child.stderr.on("data", bytes => stderr.push(bytes));
  child.on("error", reject);
  child.on("close", code => resolve({ exit: { type: "exited", code: code! }, stdout: new Uint8Array(Buffer.concat(stdout)), stderr: new Uint8Array(Buffer.concat(stderr)), timedOut: false, aborted: false, outputTruncated: false }));
  child.stdin.end(options.input);
});
let root: string, git: GitService, patch: WorkflowPatch;
const currentHash = () => `sha256:${storyHash(fixtureGit(root, "diff", "--no-ext-diff", "--no-color", "HEAD", "--"))}`;
beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "diff-workflow-patch-"));
  fixtureGit(root, "init", "-b", "main"); fixtureGit(root, "config", "user.email", "test@example.invalid"); fixtureGit(root, "config", "user.name", "Fixture");
  writeFileSync(join(root, "word.txt"), "original\n"); writeFileSync(join(root, "staged.txt"), "original\n");
  fixtureGit(root, "add", "word.txt", "staged.txt"); fixtureGit(root, "commit", "-m", "Fixture");
  writeFileSync(join(root, "staged.txt"), "staged change\n"); fixtureGit(root, "add", "staged.txt");
  writeFileSync(join(root, "word.txt"), "tyop\n");
  git = new GitService(root, runner);
  patch = { contractVersion: 1, kind: "patch", summary: "Fix spelling", description: "Correct one word", baseDiffHash: currentHash(),
    patch: "diff --git a/word.txt b/word.txt\n--- a/word.txt\n+++ b/word.txt\n@@ -1 +1 @@\n-tyop\n+typo\n" };
});
afterEach(() => rmSync(root, { recursive: true, force: true }));
function apply(output = patch, reload = async () => ({ diffHash: currentHash() })) {
  return applyWorkflowPatch(output, { source: { kind: "folder", value: root, label: "repo" }, repoRoot: root,
    reloadInput: reload as Parameters<typeof applyWorkflowPatch>[1]["reloadInput"] }, git);
}
it("applies only after check and fresh base validation, preserving index bytes and staged diff", async () => {
  const index = readFileSync(join(root, ".git/index")), staged = fixtureGit(root, "diff", "--cached");
  await apply();
  expect(readFileSync(join(root, "word.txt"), "utf8")).toBe("typo\n");
  expect(readFileSync(join(root, ".git/index"))).toEqual(index);
  expect(fixtureGit(root, "diff", "--cached")).toBe(staged);
  expect(git.getOperationLog().filter(entry => entry.args.includes("apply")).map(entry => entry.args)).toEqual([
    ["-c", "core.quotepath=off", "apply", "--check", "-"], ["-c", "core.quotepath=off", "apply", "-"],
  ]);
});
it("refuses base drift before checking or writing a still-applicable patch", async () => {
  writeFileSync(join(root, "staged.txt"), "new drift\n");
  await expect(apply()).rejects.toMatchObject({ code: "base-drift" });
  expect(git.getOperationLog().some(entry => entry.args.includes("apply"))).toBe(false);
  expect(readFileSync(join(root, "word.txt"), "utf8")).toBe("tyop\n");
});
it("surfaces git apply --check failure and leaves worktree/index intact", async () => {
  const index = readFileSync(join(root, ".git/index"));
  await expect(apply({ ...patch, patch: patch.patch.replace("-tyop", "-not present") })).rejects.toMatchObject({ code: "command-failed", message: expect.stringMatching(/patch failed|does not apply/) });
  expect(readFileSync(join(root, "word.txt"), "utf8")).toBe("tyop\n");
  expect(readFileSync(join(root, ".git/index"))).toEqual(index);
  expect(git.getOperationLog().filter(entry => entry.args.includes("apply"))).toHaveLength(1);
});
it("checks base again after applicability, refusing changes during the check", async () => {
  let reads = 0;
  await expect(apply(patch, async () => {
    if (++reads === 2) writeFileSync(join(root, "staged.txt"), "drift after check\n");
    return { diffHash: currentHash() };
  })).rejects.toMatchObject({ code: "base-drift" });
  expect(git.getOperationLog().filter(entry => entry.args.includes("apply"))).toHaveLength(1);
  expect(readFileSync(join(root, "word.txt"), "utf8")).toBe("tyop\n");
});
it("rejects non-repository sources and empty proposals without invoking Git", async () => {
  for (const source of [{ kind: "diffFile" as const, label: "patch", value: "/tmp/change.patch" }, { kind: "github" as const, label: "PR", value: "https://github.com/example/repo/pull/1", diffUrl: "https://github.com/example/repo/pull/1.diff" }, { kind: "filePair" as const, label: "pair", value: "pair", oldPath: "/old", newPath: "/new" }]) {
    expect(canApplyWorkflowPatch(source, root)).toBe(false);
    await expect(applyWorkflowPatch(patch, { source, repoRoot: root, reloadInput: jest.fn() }, git)).rejects.toThrow("Copy the patch");
  }
  await expect(apply({ ...patch, patch: "" })).rejects.toThrow("no proposed changes");
  expect(git.getOperationLog()).toEqual([]);
});
it("serializes the complete guard/check/apply transaction before other repository operations", async () => {
  let release!: () => void, started!: () => void;
  const waiting = new Promise<void>(resolve => { started = resolve; });
  const held = new Promise<void>(resolve => { release = resolve; });
  let reads = 0;
  const pending = apply(patch, async () => { if (++reads === 1) { started(); await held; } return { diffHash: currentHash() }; });
  await waiting;
  const next = git.diff(["--", "word.txt"]);
  await new Promise<void>(resolve => setImmediate(resolve));
  expect(git.getOperationLog().some(entry => entry.args.includes("diff"))).toBe(false);
  release(); await pending;
  expect(await next).toContain("+typo");
});

it("lets the write finish and keeps the repository queue held when the caller aborts during apply", async () => {
  const controller = new AbortController();
  let writeSignal: AbortSignal | undefined;
  const service = new GitService(root, async options => {
    if (options.args?.includes("apply") && !options.args.includes("--check")) {
      writeSignal = options.signal;
      controller.abort();
    }
    return runner(options);
  });
  const pending = service.applyPatch(patch.patch, { signal: controller.signal, baseDiffHash: patch.baseDiffHash, readCurrentDiffHash: async () => currentHash() });
  await pending;
  expect(writeSignal).toBeUndefined();
  expect(readFileSync(join(root, "word.txt"), "utf8")).toBe("typo\n");
});
