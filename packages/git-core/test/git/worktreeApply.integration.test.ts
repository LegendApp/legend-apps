import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitService, type GitRunner } from "../../src/GitService";
import { fixtureGit } from "../fixtures/make-repos";
import { realRunner } from "../fixtures/realRunner";

let root: string;
beforeAll(() => { root = mkdtempSync(join(tmpdir(), "legend-git-worktree-apply-")); });
afterAll(() => rmSync(root, { recursive: true, force: true }));

let count = 0;
function repo(runner: GitRunner = realRunner) {
  const path = join(root, `repo-${count++}`);
  mkdirSync(path);
  fixtureGit(path, "init", "--initial-branch=main", "--template=");
  for (const [key, value] of Object.entries({ "user.name": "Git Test", "user.email": "git@example.test", "core.hooksPath": "/dev/null", "commit.gpgsign": "false", "core.autocrlf": "false" })) fixtureGit(path, "config", key, value);
  mkdirSync(join(path, "src"));
  writeFileSync(join(path, "src/a.txt"), "one\ntwo\nthree\n");
  fixtureGit(path, "add", "-A");
  fixtureGit(path, "commit", "-m", "Base");
  writeFileSync(join(path, "src/a.txt"), "one\nTWO\nthree\n");
  const patch = `${fixtureGit(path, "diff", "--no-color")}\n`;
  fixtureGit(path, "checkout", "--", "src/a.txt");
  return { path, git: new GitService(join(path, "src"), runner), patch, read: () => readFileSync(join(path, "src/a.txt"), "utf8") };
}

const base = "one\ntwo\nthree\n";
const applied = "one\nTWO\nthree\n";

it("applies to the worktree from a subdirectory service, leaving the index alone, verifying twice around the check", async () => {
  const { path, git, patch, read } = repo();
  const calls: string[] = [];
  await git.applyPatch(patch, { target: "worktree", verify: async () => { calls.push(read()); } });
  expect(calls).toEqual([base, base]);
  expect(read()).toBe(applied);
  expect(fixtureGit(path, "diff", "--cached", "--name-only")).toBe("");
});

it.each([1, 2])("writes nothing when verify fails on call %i", async (failOn) => {
  const { git, patch, read } = repo();
  let call = 0;
  await expect(git.applyPatch(patch, { target: "worktree", verify: async () => { if (++call === failOn) throw new Error("base changed"); } })).rejects.toThrow("base changed");
  expect(read()).toBe(base);
});

it("rejects a patch whose base changed without writing", async () => {
  const { path, git, patch, read } = repo();
  writeFileSync(join(path, "src/a.txt"), "one\nchanged\nthree\n");
  await expect(git.applyPatch(patch, { target: "worktree" })).rejects.toMatchObject({ code: "command-failed" });
  expect(read()).toBe("one\nchanged\nthree\n");
});

it("writes nothing when aborted before the apply starts", async () => {
  const { git, patch, read } = repo();
  const controller = new AbortController();
  await expect(git.applyPatch(patch, { target: "worktree", signal: controller.signal, verify: async () => controller.abort() })).rejects.toMatchObject({ code: "aborted" });
  await git.revParse("HEAD");
  expect(read()).toBe(base);
});

it("finishes the apply when the caller aborts after it starts", async () => {
  const controller = new AbortController();
  const { git, patch, read } = repo(async (options) => {
    const args = options.args ?? [];
    if (args.includes("apply") && !args.includes("--check")) controller.abort();
    return realRunner(options);
  });
  await expect(git.applyPatch(patch, { target: "worktree", signal: controller.signal })).resolves.toBeUndefined();
  expect(read()).toBe(applied);
});

it("keeps the default index apply", async () => {
  const { path, git, patch, read } = repo();
  await git.applyPatch(patch);
  expect(read()).toBe(base);
  expect(fixtureGit(path, "diff", "--cached", "--name-only")).toBe("src/a.txt");
});

it("loads GitService in plain Node with type stripping and an injected runner", () => {
  const { path } = repo();
  const script = `
    import { spawnSync } from "node:child_process";
    const { GitService } = await import(process.argv[1]);
    const runner = async (options) => {
      const result = spawnSync(options.target.name, options.args, { cwd: options.cwd, input: options.input ?? "" });
      return { exit: { type: "exited", code: result.status }, stdout: result.stdout, stderr: result.stderr, timedOut: false, aborted: false, outputTruncated: false };
    };
    const git = new GitService(process.argv[2], runner);
    process.stdout.write(JSON.stringify({ head: await git.revParse("HEAD"), branch: (await git.status()).branch.head }));
  `;
  const output = execFileSync(process.execPath, ["--experimental-strip-types", "--no-warnings", "--input-type=module", "-e", script, join(__dirname, "../../src/GitService.ts"), path], {
    env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null" },
  }).toString();
  expect(JSON.parse(output)).toEqual({ head: fixtureGit(path, "rev-parse", "HEAD").trim(), branch: "main" });
});
