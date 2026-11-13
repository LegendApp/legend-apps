import { execFileSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const env = {
  ...process.env,
  GIT_CONFIG_NOSYSTEM: "1",
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_AUTHOR_DATE: "2020-01-01T00:00:00Z",
  GIT_COMMITTER_DATE: "2020-01-01T00:00:00Z",
  GIT_TERMINAL_PROMPT: "0",
  GIT_EDITOR: "true",
  GIT_SEQUENCE_EDITOR: "true",
  LC_ALL: "C",
};

export function fixtureGit(cwd: string, ...args: string[]) {
  return execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function write(repo: string, path: string, content: string | Uint8Array) {
  writeFileSync(join(repo, path), content);
}

function commit(repo: string, message: string) {
  fixtureGit(repo, "add", "-A");
  fixtureGit(repo, "commit", "-m", message);
  return fixtureGit(repo, "rev-parse", "HEAD");
}

function init(root: string, name: string) {
  const repo = join(root, name);
  mkdirSync(repo);
  fixtureGit(repo, "init", "--initial-branch=main", "--template=");
  for (const [key, value] of Object.entries({ "user.name": "Diff Fixture", "user.email": "diff@example.test", "commit.gpgsign": "false", "core.autocrlf": "false", "core.filemode": "true", "core.hooksPath": "/dev/null" })) {
    fixtureGit(repo, "config", key, value);
  }
  return repo;
}

function conflictRepo(root: string, name: string) {
  const repo = init(root, name);
  write(repo, "conflict.txt", "base\n");
  commit(repo, "Base");
  fixtureGit(repo, "checkout", "-b", "topic");
  write(repo, "conflict.txt", "theirs\n");
  commit(repo, "Theirs");
  fixtureGit(repo, "checkout", "main");
  write(repo, "conflict.txt", "ours\n");
  commit(repo, "Ours");
  return { repo };
}

function conflict(repo: string, ...args: string[]) {
  try {
    fixtureGit(repo, ...args);
  } catch (error) {
    if ((error as { status?: number }).status === 1) return;
    throw error;
  }
  throw new Error(`Expected a conflict from git ${args.join(" ")}`);
}

export function makeGitRepos() {
  const root = mkdtempSync(join(tmpdir(), "legend-diff-git-"));
  try {
    const changes = init(root, "changes");
    for (const [path, content] of Object.entries({
      ".gitignore": "ignored.txt\n",
      "old name.txt": "rename me\n",
      "crlf.txt": "before\r\n",
      "no-eol.txt": "before",
      "mode.sh": "#!/bin/sh\necho mode\n",
      "staged.txt": "base\n",
      "worktree.txt": "base\n",
      "stash.txt": "base\n",
    })) write(changes, path, content);
    write(changes, "binary.bin", new Uint8Array([0, 1, 2, 3]));
    const first = commit(changes, "Initial files");
    write(changes, "main-only.txt", "main\n");
    const second = commit(changes, "Main change");
    fixtureGit(changes, "checkout", "-b", "topic", first);
    write(changes, "topic-only.txt", "topic\n");
    commit(changes, "Topic change");
    fixtureGit(changes, "checkout", "main");
    write(changes, "stash.txt", "stashed\n");
    fixtureGit(changes, "stash", "push", "-m", "Fixture stash");
    const worktree = join(root, "linked");
    fixtureGit(changes, "worktree", "add", "-b", "linked", worktree, "HEAD");
    fixtureGit(changes, "mv", "old name.txt", "renamed name.txt");
    write(changes, "staged.txt", "staged\n");
    fixtureGit(changes, "add", "staged.txt");
    write(changes, "staged.txt", "staged then unstaged\n");
    write(changes, "worktree.txt", "unstaged\n");
    write(changes, "binary.bin", new Uint8Array([0, 4, 5, 6]));
    write(changes, "crlf.txt", "after\r\n");
    write(changes, "no-eol.txt", "after");
    chmodSync(join(changes, "mode.sh"), 0o755);
    write(changes, "untracked\nü.txt", "untracked\n");
    write(changes, "ignored.txt", "ignored\n");

    const { repo: merging } = conflictRepo(root, "merging");
    conflict(merging, "merge", "topic");
    const { repo: rebasing } = conflictRepo(root, "rebasing");
    fixtureGit(rebasing, "checkout", "topic");
    conflict(rebasing, "rebase", "--merge", "main");
    const { repo: rebaseApply } = conflictRepo(root, "rebase-apply");
    fixtureGit(rebaseApply, "checkout", "topic");
    conflict(rebaseApply, "rebase", "--apply", "main");
    const { repo: cherryPicking } = conflictRepo(root, "cherry-picking");
    conflict(cherryPicking, "cherry-pick", "topic");
    const { repo: reverting } = conflictRepo(root, "reverting");
    conflict(reverting, "revert", "--no-edit", "topic");
    const detached = init(root, "detached");
    write(detached, "file.txt", "detached\n");
    commit(detached, "Detached base");
    fixtureGit(detached, "checkout", "--detach");
    const bisecting = init(root, "bisecting");
    write(bisecting, "file.txt", "one\n");
    const good = commit(bisecting, "Good");
    write(bisecting, "file.txt", "two\n");
    commit(bisecting, "Middle");
    write(bisecting, "file.txt", "three\n");
    commit(bisecting, "Bad");
    fixtureGit(bisecting, "bisect", "start", "HEAD", good);
    const merged = init(root, "merged");
    write(merged, "base.txt", "base\n");
    commit(merged, "Base");
    fixtureGit(merged, "checkout", "-b", "topic");
    write(merged, "topic.txt", "topic\n");
    commit(merged, "Topic");
    fixtureGit(merged, "checkout", "main");
    write(merged, "main.txt", "main\n");
    commit(merged, "Main");
    fixtureGit(merged, "merge", "--no-ff", "topic", "-m", "Merge topic");
    return { root, changes, first, second, worktree, merged, merging, rebasing, rebaseApply, cherryPicking, reverting, detached, bisecting };
  } catch (error) {
    rmSync(root, { recursive: true, force: true });
    throw error;
  }
}
