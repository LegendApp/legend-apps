import type { GitService } from "@legend-apps/git-core";
import { createGitRefs, type RefsState } from "../gitRefs";
import { createWorktreePreview, worktreeDetail, type WorktreePreviewState } from "../gitWorktrees";

const entry = (path: string, kind: "ordinary" | "untracked" = "ordinary") => ({ kind, path, indexStatus: kind === "untracked" ? "?" : ".", worktreeStatus: kind === "untracked" ? "?" : "M" });
const status = (...paths: string[]) => ({ branch: { oid: "a", head: "x", upstream: null, ahead: 0, behind: 0 }, entries: paths.map(path => entry(path, path.startsWith("new") ? "untracked" : "ordinary")) });

it("describes a worktree by branch, short commit, missing or bare folder, and its changed-file count", () => {
  const base = { branch: "main", head: "a".repeat(40), detached: false, bare: false, prunable: null, changes: null };
  expect(worktreeDetail(base)).toBe("main");
  expect(worktreeDetail({ ...base, changes: 3 })).toBe("main · 3");
  expect(worktreeDetail({ ...base, branch: null, detached: true, changes: 0 })).toBe("aaaaaaa");
  expect(worktreeDetail({ ...base, prunable: "gitdir file points to non-existent location" })).toBe("missing");
  expect(worktreeDetail({ ...base, bare: true, head: null, branch: null })).toBe("bare");
});

it("previews a worktree's files, keeps the selected file across re-reads, and drops a stale read when another worktree is selected", async () => {
  const reads: Record<string, ((value: unknown) => void)[]> = {};
  const git = {
    worktreeStatus: jest.fn((path: string) => new Promise(resolve => (reads[path] ??= []).push(resolve))),
    worktreeFileDiff: jest.fn(async (_path: string, file: { path: string }) => `diff --git a/${file.path} b/${file.path}\n`),
  };
  let state!: WorktreePreviewState;
  const preview = createWorktreePreview(next => { state = next; }, () => git as unknown as GitService);
  preview.setRoot("/repo");
  const first = preview.show("/a");
  const second = preview.show("/b");
  reads["/a"]!.shift()!(status("old.txt"));
  reads["/b"]!.shift()!(status("x.txt", "new.txt"));
  await Promise.all([first, second]);
  expect(state).toMatchObject({ path: "/b", selectedPath: "x.txt", loading: false, error: null });
  expect(state.files.map(file => file.path)).toEqual(["x.txt", "new.txt"]);
  preview.selectFile("new.txt");
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(git.worktreeFileDiff).toHaveBeenLastCalledWith("/b", { path: "new.txt", untracked: true }, expect.anything());
  expect(state.patch?.path).toBe("new.txt");
  // A re-read of the same worktree keeps the selected file while it is still listed.
  const again = preview.show("/b");
  reads["/b"]!.shift()!(status("x.txt", "new.txt"));
  await again;
  expect(state.selectedPath).toBe("new.txt");
  const failed = preview.show("/b");
  reads["/b"]!.shift()!(Promise.reject(new Error("not a git repository")));
  await failed;
  expect(state).toMatchObject({ files: [], selectedPath: null, loading: false, error: "not a git repository" });
  preview.dispose();
});

it("reads each linked worktree's change count after listing them, leaving a missing folder uncounted", async () => {
  const worktrees = [
    { path: "/repo", head: "a", branch: "main", detached: false, bare: false, locked: null, prunable: null, main: true },
    { path: "/gone", head: "a", branch: "x", detached: false, bare: false, locked: null, prunable: "gitdir file points to non-existent location", main: false },
    { path: "/linked", head: "a", branch: "y", detached: false, bare: false, locked: null, prunable: null, main: false },
  ];
  const git = { listRefs: jest.fn(async () => ({ branches: [], remotes: [], tags: [] })), listStashes: jest.fn(async () => []), listWorktrees: jest.fn(async () => worktrees),
    worktreeChangeCount: jest.fn(async (path: string): Promise<number> => path === "/linked" ? 4 : 0) };
  const states: RefsState[] = [];
  const refs = createGitRefs(next => { states.push(next); }, () => git as unknown as GitService);
  refs.setRoot("/repo");
  await refs.refresh();
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(git.worktreeChangeCount.mock.calls.map(call => call[0])).toEqual(["/repo", "/linked"]);
  expect(states.at(-1)!.worktrees!.map(entry => entry.changes)).toEqual([0, null, 4]);
  // Until the new counts land, the previous ones stay shown.
  git.worktreeChangeCount.mockImplementation(() => new Promise(() => {}));
  void refs.refresh();
  await new Promise(resolve => setTimeout(resolve, 0));
  expect(states.at(-1)!.worktrees!.map(entry => entry.changes)).toEqual([0, null, 4]);
  refs.dispose();
});
