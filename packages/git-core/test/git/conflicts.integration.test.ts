import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { GitService } from "../../src/GitService";
import { fixtureGit } from "../fixtures/make-repos";
import { realRunner } from "../fixtures/realRunner";

let root: string;
beforeAll(() => { root = realpathSync(mkdtempSync(join(tmpdir(), "legend-git-conflicts-"))); });
afterAll(() => rmSync(root, { recursive: true, force: true }));

const identity = { "user.name": "Git Test", "user.email": "git@example.test", "core.hooksPath": "/dev/null", "commit.gpgsign": "false" };
const lines = (...values: string[]) => values.map(value => `${value}\n`).join("");
const base = lines("1", "2", "3", "4", "5", "6", "7", "8", "9");

/** Commits `files` (path → content, null deletes) on the current branch. */
function commit(path: string, files: Record<string, string | Buffer | null>, message: string) {
  for (const [file, content] of Object.entries(files)) {
    if (content === null) { fixtureGit(path, "rm", "-q", "--", file); continue; }
    mkdirSync(dirname(join(path, file)), { recursive: true });
    writeFileSync(join(path, file), content);
    fixtureGit(path, "add", "--", file);
  }
  fixtureGit(path, "commit", "-q", "-m", message);
}

/** A repository where `main` and `feature` both change `files` from `start`; returns once `main` is checked out. */
function setup(name: string, start: Record<string, string | Buffer | null>, main: Record<string, string | Buffer | null>, feature: Record<string, string | Buffer | null>) {
  const path = join(root, name);
  mkdirSync(path, { recursive: true });
  fixtureGit(path, "init", "-q", "--initial-branch=main");
  for (const [key, value] of Object.entries(identity)) fixtureGit(path, "config", key, value);
  commit(path, { "README.md": "readme\n", ...start }, "Base");
  fixtureGit(path, "switch", "-q", "-c", "feature");
  commit(path, feature, "Feature");
  fixtureGit(path, "switch", "-q", "main");
  commit(path, main, "Main");
  return { path, git: new GitService(path, realRunner) };
}
const read = (path: string, file: string) => readFileSync(join(path, file), "utf8");
const status = (path: string) => fixtureGit(path, "status", "--porcelain");
const conflictOf = (path: string, operation: "merge" | "rebase") => {
  if (operation === "merge") expect(() => fixtureGit(path, "merge", "--no-edit", "feature")).toThrow();
  else { fixtureGit(path, "switch", "-q", "feature"); expect(() => fixtureGit(path, "rebase", "main")).toThrow(); }
};

describe("conflict picks", () => {
  it("takes ours or theirs during a merge, stages it and lowers the conflict count", async () => {
    const { path, git } = setup("merge-sides", { "a.txt": base, "b.txt": base }, { "a.txt": base.replace("2", "main 2"), "b.txt": base.replace("5", "main 5") },
      { "a.txt": base.replace("2", "feature 2"), "b.txt": base.replace("5", "feature 5") });
    conflictOf(path, "merge");
    expect(await git.conflictFile("a.txt")).toEqual({ ours: true, theirs: true, binary: false, edited: false });
    expect(await git.conflictFile("README.md")).toBeNull();
    await git.resolveConflict("a.txt", "ours");
    expect(read(path, "a.txt")).toBe(base.replace("2", "main 2"));
    expect((await git.operationState())?.conflicts).toBe(1);
    await git.resolveConflict("b.txt", "theirs");
    expect(read(path, "b.txt")).toBe(base.replace("5", "feature 5"));
    expect(status(path)).toBe("M  b.txt");
    expect((await git.operationState())?.conflicts).toBe(0);
    await expect(git.resolveConflict("a.txt", "theirs")).rejects.toThrow("“a.txt” is no longer conflicted.");
    await git.continueOperation("merge");
    expect(await git.operationState()).toBeNull();
    expect(fixtureGit(path, "log", "-1", "--format=%P").split(" ")).toHaveLength(2);
    expect(read(path, "a.txt")).toBe(base.replace("2", "main 2"));
  });

  it("swaps the sides during a rebase: ours is the branch rebased onto, theirs the commit being replayed", async () => {
    const { path, git } = setup("rebase-sides", { "a.txt": base, "b.txt": base }, { "a.txt": base.replace("2", "main 2"), "b.txt": base.replace("5", "main 5") },
      { "a.txt": base.replace("2", "feature 2"), "b.txt": base.replace("5", "feature 5") });
    conflictOf(path, "rebase");
    expect((await git.operationState())?.kind).toBe("rebase");
    await git.resolveConflict("a.txt", "ours");
    expect(read(path, "a.txt")).toBe(base.replace("2", "main 2"));
    await git.resolveConflict("b.txt", "theirs");
    expect(read(path, "b.txt")).toBe(base.replace("5", "feature 5"));
    await git.continueOperation("rebase");
    expect(await git.operationState()).toBeNull();
    expect(fixtureGit(path, "symbolic-ref", "--short", "HEAD")).toBe("feature");
    expect(fixtureGit(path, "log", "--format=%s", "main..HEAD")).toBe("Feature");
    expect(fixtureGit(path, "show", "HEAD:b.txt") + "\n").toBe(base.replace("5", "feature 5"));
  });

  it("keeps both sides of each of two conflicting regions, ours first, with no markers", async () => {
    const { path, git } = setup("both", { "a.txt": base }, { "a.txt": lines("1", "main 2", "3", "4", "5", "6", "7", "main 8", "9") },
      { "a.txt": lines("1", "feature 2", "3", "4", "5", "6", "7", "feature 8", "9") });
    conflictOf(path, "merge");
    await git.resolveConflict("a.txt", "both");
    expect(read(path, "a.txt")).toBe(lines("1", "main 2", "feature 2", "3", "4", "5", "6", "7", "main 8", "feature 8", "9"));
    expect(status(path)).toBe("M  a.txt");
    expect(fixtureGit(path, "show", ":0:a.txt") + "\n").toBe(read(path, "a.txt"));
  });

  it("calls a file edited only when its markers are gone and it matches neither side; a pick still replaces it", async () => {
    const { path, git } = setup("edited", { "a.txt": base }, { "a.txt": base.replace("2", "main 2") }, { "a.txt": base.replace("2", "feature 2") });
    conflictOf(path, "merge");
    expect((await git.conflictFile("a.txt"))?.edited).toBe(false);
    writeFileSync(join(path, "a.txt"), base.replace("2", "hand-merged 2"));
    expect((await git.conflictFile("a.txt"))?.edited).toBe(true);
    writeFileSync(join(path, "a.txt"), base.replace("2", "feature 2"));
    expect((await git.conflictFile("a.txt"))?.edited).toBe(false);
    rmSync(join(path, "a.txt"));
    expect((await git.conflictFile("a.txt"))?.edited).toBe(false);
    await git.resolveConflict("a.txt", "theirs");
    expect(read(path, "a.txt")).toBe(base.replace("2", "feature 2"));
  });

  it("keeps or deletes a file one side deleted, and refuses to combine it", async () => {
    const { path, git } = setup("delete", { "kept.txt": base, "gone.txt": base }, { "kept.txt": base.replace("2", "main 2"), "gone.txt": base.replace("2", "main 2") },
      { "kept.txt": null, "gone.txt": null });
    conflictOf(path, "merge");
    expect(await git.conflictFile("kept.txt")).toEqual({ ours: true, theirs: false, binary: false, edited: false });
    await expect(git.resolveConflict("kept.txt", "both")).rejects.toThrow("“kept.txt” was deleted on one side");
    await git.resolveConflict("kept.txt", "ours");
    expect(read(path, "kept.txt")).toBe(base.replace("2", "main 2"));
    await git.resolveConflict("gone.txt", "theirs");
    expect(existsSync(join(path, "gone.txt"))).toBe(false);
    expect(status(path)).toBe("D  gone.txt");
    await git.continueOperation("merge");
    expect(fixtureGit(path, "ls-tree", "--name-only", "HEAD")).toBe("README.md\nkept.txt");
  });

  it("resolves a file both sides added with either side or both", async () => {
    const { path, git } = setup("add-add", {}, { "new.txt": lines("main"), "two.txt": lines("main") }, { "new.txt": lines("feature"), "two.txt": lines("feature") });
    conflictOf(path, "merge");
    expect(await git.conflictFile("new.txt")).toEqual({ ours: true, theirs: true, binary: false, edited: false });
    await git.resolveConflict("new.txt", "both");
    expect(read(path, "new.txt")).toBe(lines("main", "feature"));
    await git.resolveConflict("two.txt", "theirs");
    expect(read(path, "two.txt")).toBe(lines("feature"));
    expect((await git.operationState())?.conflicts).toBe(0);
  });

  it("takes a side of a binary file but refuses to combine it", async () => {
    const bytes = (value: number) => Buffer.from([0, 1, 2, value, 0, 255]);
    const { path, git } = setup("binary", { "logo.bin": bytes(1) }, { "logo.bin": bytes(2) }, { "logo.bin": bytes(3) });
    conflictOf(path, "merge");
    expect(await git.conflictFile("logo.bin")).toEqual({ ours: true, theirs: true, binary: true, edited: false });
    await expect(git.resolveConflict("logo.bin", "both")).rejects.toThrow("“logo.bin” isn’t a text file");
    expect((await git.operationState())?.conflicts).toBe(1);
    await git.resolveConflict("logo.bin", "theirs");
    expect(readFileSync(join(path, "logo.bin"))).toEqual(bytes(3));
    expect(status(path)).toBe("M  logo.bin");
  });

  it("stages the picked side's mode and blob exactly, even when Git doesn't trust file modes", async () => {
    const { path, git } = setup("modes", { "run.sh": base }, { "run.sh": base.replace("2", "main 2") }, { "run.sh": base.replace("2", "feature 2") });
    fixtureGit(path, "config", "core.fileMode", "false");
    fixtureGit(path, "switch", "-q", "feature");
    fixtureGit(path, "update-index", "--chmod=+x", "run.sh");
    fixtureGit(path, "commit", "-q", "-m", "Make it executable");
    fixtureGit(path, "switch", "-q", "main");
    conflictOf(path, "merge");
    const theirs = fixtureGit(path, "ls-files", "-s", "--", "run.sh").split("\n").find(line => line.endsWith(" 3\trun.sh"))!.split(" ").slice(0, 2).join(" ");
    await git.resolveConflict("run.sh", "theirs");
    expect(fixtureGit(path, "ls-files", "-s", "--", "run.sh")).toBe(`${theirs} 0\trun.sh`);
    expect(theirs.startsWith("100755 ")).toBe(true);
    expect(read(path, "run.sh")).toBe(base.replace("2", "feature 2"));
  });

  it("handles paths with spaces and non-ASCII names", async () => {
    const file = "docs/größe notes.txt", other = "docs/größe*.txt";
    const { path, git } = setup("unicode", { [file]: base, [other]: base }, { [file]: base.replace("2", "main 2"), [other]: base.replace("2", "main 2") },
      { [file]: base.replace("2", "feature 2"), [other]: base.replace("2", "feature 2") });
    conflictOf(path, "merge");
    expect(await git.conflictFile(file)).toEqual({ ours: true, theirs: true, binary: false, edited: false });
    await git.resolveConflict(file, "theirs");
    expect(read(path, file)).toBe(base.replace("2", "feature 2"));
    // A glob character is a literal name: only that file is resolved.
    await git.resolveConflict(other, "both");
    expect(read(path, other)).toBe(base.replace("2", "main 2\nfeature 2"));
    expect((await git.operationState())?.conflicts).toBe(0);
    await git.continueOperation("merge");
    expect(await git.operationState()).toBeNull();
  });
});
