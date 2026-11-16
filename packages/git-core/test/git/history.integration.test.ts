import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitService, githubCommitUrl } from "../../src/GitService";
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
