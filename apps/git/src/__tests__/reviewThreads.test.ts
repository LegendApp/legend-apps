import type { GitService } from "@legend-apps/git-core";
import { findUnifiedPatchFile, parseUnifiedPatch } from "@legend-apps/diff-parser/src/unifiedPatch";
import { createGitHubClient, GitHubError, pullFilePatch, type GitHubPullRequest, type ReviewThread } from "../github";
import { createPullRequests, type PullRequestsState } from "../gitPullRequests";
import { commentCounts, commentRange, placeThreads, rowAnchorKeys, threadLines } from "../reviewThreads";
import { lineRange, diffPaneItems, rangeBounds } from "../DiffPane";

jest.mock("@legend-apps/diff-parser", () => ({}));
jest.mock("@legendapp/spark/ui", () => ({ Button: "Button" }));
jest.mock("@legendapp/spark/ui/symbol", () => ({ SFSymbol: "SFSymbol" }));
jest.mock("react-native", () => ({ PlatformColor: (name: string) => name, StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1, absoluteFillObject: {} } }));

const token = "github_pat_SECRET123";
const repo = { owner: "LegendApp", name: "legend-apps" };
type Call = { url: string; method: string; headers: Record<string, string>; body: any };
/** A fetch that answers each call from `answer(call)`. */
function fakeFetch(answer: (call: Call) => { status: number; body?: unknown }) {
  const calls: Call[] = [];
  const fetch = jest.fn(async (url: string, init: { method?: string; headers: Record<string, string>; body?: string }) => {
    const call = { url, method: init.method ?? "GET", headers: init.headers, body: init.body ? JSON.parse(init.body) : null };
    calls.push(call);
    const reply = answer(call);
    return { status: reply.status, headers: { get: () => null }, json: async () => reply.body, text: async () => JSON.stringify(reply.body ?? "") };
  });
  return { fetch, calls };
}
const rawComment = (n: number) => ({ id: `C${n}`, databaseId: n, author: { login: "ana" }, body: `comment ${n}`, createdAt: "2026-11-17T10:00:00Z" });
const rawThread = (id: string, extra: object = {}, comments = [rawComment(1)], hasNextPage = false) => ({
  id, path: "src/a.ts", line: 2, originalLine: 2, startLine: null, diffSide: "RIGHT", startDiffSide: null, isResolved: false, isOutdated: false,
  comments: { nodes: comments, pageInfo: { hasNextPage, endCursor: hasNextPage ? `${id}-c` : null } }, ...extra,
});
const thread = (id: string, extra: Partial<ReviewThread> = {}): ReviewThread => ({
  id, path: "src/a.ts", line: 2, originalLine: 2, startLine: null, side: "RIGHT", startSide: null, resolved: false, outdated: false,
  comments: [{ id: `${id}c`, databaseId: 7, author: "ana", body: "hi", createdAt: "2026-11-17T10:00:00Z" }], ...extra,
});

describe("client", () => {
  it("pages threads and each thread's comments over GraphQL with the token, through the API override", async () => {
    const { fetch, calls } = fakeFetch(call => {
      const { variables } = call.body;
      if (variables.id) return { status: 200, body: { data: { node: { comments: { nodes: [rawComment(3)], pageInfo: { hasNextPage: false, endCursor: null } } } } } };
      return variables.after === null
        ? { status: 200, body: { data: { repository: { pullRequest: { headRefOid: "new-head", reviewThreads: { nodes: [rawThread("T1", {}, [rawComment(1), rawComment(2)], true)], pageInfo: { hasNextPage: true, endCursor: "p1" } } } } } } }
        : { status: 200, body: { data: { repository: { pullRequest: { headRefOid: "new-head", reviewThreads: { nodes: [rawThread("T2", { isOutdated: true, line: null, author: null })], pageInfo: { hasNextPage: false, endCursor: null } } } } } } };
    });
    const client = createGitHubClient({ token, apiUrl: "http://127.0.0.1:9", fetch });
    const { threads, headSha } = await client.reviewThreads(repo, 42);
    expect(headSha).toBe("new-head");
    expect(calls.map(call => [call.url, call.method, call.body.variables])).toEqual([
      ["http://127.0.0.1:9/graphql", "POST", { owner: "LegendApp", name: "legend-apps", number: 42, after: null }],
      ["http://127.0.0.1:9/graphql", "POST", { id: "T1", after: "T1-c" }],
      ["http://127.0.0.1:9/graphql", "POST", { owner: "LegendApp", name: "legend-apps", number: 42, after: "p1" }],
    ]);
    expect(calls[0]!.headers.Authorization).toBe(`Bearer ${token}`);
    expect(threads.map(entry => [entry.id, entry.comments.map(comment => comment.databaseId), entry.outdated, entry.line])).toEqual([["T1", [1, 2, 3], false, 2], ["T2", [1], true, null]]);
    expect(threads[0]!.comments[0]).toEqual({ id: "C1", databaseId: 1, author: "ana", body: "comment 1", createdAt: "2026-11-17T10:00:00Z" });
  });

  it("turns GraphQL errors and a missing pull request into GitHubErrors without the token", async () => {
    const { fetch } = fakeFetch(() => ({ status: 200, body: { errors: [{ type: "NOT_FOUND", message: `Could not resolve to a Repository (token ${token})` }] } }));
    const error = await createGitHubClient({ token, fetch }).reviewThreads(repo, 1).then(() => null, (caught: unknown) => caught as GitHubError) as GitHubError;
    expect(error).toMatchObject({ kind: "not-found" });
    expect(error.message).toContain("Could not resolve");
    expect(error.message).not.toContain(token);
    const missing = fakeFetch(() => ({ status: 200, body: { data: { repository: { pullRequest: null } } } }));
    await expect(createGitHubClient({ token, fetch: missing.fetch }).reviewThreads(repo, 5)).rejects.toMatchObject({ kind: "not-found", message: expect.stringContaining("#5") });
    const unauthorized = fakeFetch(() => ({ status: 401, body: { message: "Bad credentials" } }));
    await expect(createGitHubClient({ token, fetch: unauthorized.fetch }).reviewThreads(repo, 5)).rejects.toMatchObject({ kind: "unauthorized" });
  });

  it("posts a line comment, a range and a reply with GitHub's field names", async () => {
    const { fetch, calls } = fakeFetch(() => ({ status: 201, body: { id: 99 } }));
    const client = createGitHubClient({ token, fetch });
    await client.addReviewComment(repo, 42, { commitId: "abc", path: "src/a.ts", line: 7, side: "LEFT", body: "Why?" });
    await client.addReviewComment(repo, 42, { commitId: "abc", path: "src/a.ts", line: 12, side: "RIGHT", startLine: 10, startSide: "LEFT", body: "Range" });
    // A range from an old line to the new line with the same number keeps its start.
    await client.addReviewComment(repo, 42, { commitId: "abc", path: "src/a.ts", line: 1, side: "RIGHT", startLine: 1, startSide: "LEFT", body: "Swap" });
    await client.replyToReviewComment(repo, 42, 7, "Agreed");
    expect(calls.map(call => [call.method, call.url, call.body])).toEqual([
      ["POST", "https://api.github.com/repos/LegendApp/legend-apps/pulls/42/comments", { body: "Why?", commit_id: "abc", path: "src/a.ts", line: 7, side: "LEFT" }],
      ["POST", "https://api.github.com/repos/LegendApp/legend-apps/pulls/42/comments", { body: "Range", commit_id: "abc", path: "src/a.ts", line: 12, side: "RIGHT", start_line: 10, start_side: "LEFT" }],
      ["POST", "https://api.github.com/repos/LegendApp/legend-apps/pulls/42/comments", { body: "Swap", commit_id: "abc", path: "src/a.ts", line: 1, side: "RIGHT", start_line: 1, start_side: "LEFT" }],
      ["POST", "https://api.github.com/repos/LegendApp/legend-apps/pulls/42/comments/7/replies", { body: "Agreed" }],
    ]);
    expect(calls[0]!.headers["Content-Type"]).toBe("application/json");
  });

  it("shows a 422 with GitHub's message and its details, never the token", async () => {
    const { fetch } = fakeFetch(() => ({ status: 422, body: { message: "Validation Failed", errors: [`pull_request_review_thread.line must be part of the diff (${token})`, { field: "commit_id", code: "invalid" }] } }));
    const error = await createGitHubClient({ token, fetch }).addReviewComment(repo, 1, { commitId: "x", path: "a", line: 1, side: "RIGHT", body: "b" }).then(() => null, (caught: unknown) => caught as GitHubError) as GitHubError;
    expect(error).toBeInstanceOf(GitHubError);
    expect(error.message).toBe("GitHub answered 422: Validation Failed: pull_request_review_thread.line must be part of the diff (•••): commit_id invalid.");
    expect(error.message).not.toContain(token);
  });
});

describe("anchoring", () => {
  // Old 1-4 → new 1-5: line 2 removed, lines 2-3 added; a second hunk at old 20 / new 21.
  const patch = pullFilePatch({ path: "src/a.ts", previousPath: null, status: "modified", additions: 3, deletions: 1, patch: "@@ -1,4 +1,5 @@\n one\n-two\n+TWO\n+two and a half\n three\n four\n@@ -20,2 +21,3 @@\n twenty\n+new\n twenty-one" })!;
  const file = findUnifiedPatchFile(parseUnifiedPatch(patch), "src/a.ts")!;

  it("puts RIGHT threads on added or context lines and LEFT threads on removed or context lines", () => {
    const threads = [thread("added", { line: 3 }), thread("removed", { line: 2, side: "LEFT" }), thread("context-new", { line: 4 }), thread("context-old", { line: 3, side: "LEFT" }), thread("second-hunk", { line: 22 })];
    const { byKey, unplaced } = placeThreads(threads, "src/a.ts", file);
    expect([...byKey].map(([key, list]) => [key, list.map(entry => entry.id)])).toEqual([["R:3", ["added"]], ["L:2", ["removed"]], ["R:4", ["context-new"]], ["L:3", ["context-old"]], ["R:22", ["second-hunk"]]]);
    expect(unplaced).toEqual([]);
    // The context row "three" (old 3, new 4) answers to both sides; the removed row only to the left.
    expect(rowAnchorKeys({ changeType: 0, oldLineNumber: 3, newLineNumber: 4 })).toEqual(["L:3", "R:4"]);
    expect(rowAnchorKeys({ changeType: 2, oldLineNumber: 2, newLineNumber: 0 })).toEqual(["L:2"]);
    expect(rowAnchorKeys({ changeType: 1, oldLineNumber: 0, newLineNumber: 3 })).toEqual(["R:3"]);
  });

  it("anchors a range under its last line and labels it", () => {
    const range = thread("range", { startLine: 2, line: 4, startSide: "RIGHT" });
    expect([...placeThreads([range], "src/a.ts", file).byKey.keys()]).toEqual(["R:4"]);
    expect(threadLines(range)).toBe("Lines 2–4");
    expect(threadLines(thread("x", { line: 2, side: "LEFT" }))).toBe("Line 2 (old)");
  });

  it("lists threads outside the hunks, outdated and file-level threads for the file instead of losing them, and skips other files", () => {
    const threads = [thread("outside", { line: 10 }), thread("old-outside", { line: 3, side: "LEFT", path: "src/a.ts" }), thread("outdated", { line: null, originalLine: 3, outdated: true }), thread("file", { line: null, originalLine: null }), thread("other", { path: "src/b.ts" })];
    const { byKey, unplaced } = placeThreads(threads, "src/a.ts", file);
    expect([...byKey.keys()]).toEqual(["L:3"]);
    expect(unplaced.map(entry => entry.id)).toEqual(["outside", "outdated", "file"]);
    expect(threadLines(threads[2]!)).toBe("Line 3");
    expect(threadLines(threads[3]!)).toBe("File");
    expect(placeThreads(threads, "src/a.ts", null).unplaced).toHaveLength(4);
  });

  it("counts comments per file", () => {
    expect([...commentCounts([thread("a"), thread("b", { comments: [...thread("b").comments, ...thread("c").comments] }), thread("d", { path: "z" })])]).toEqual([["src/a.ts", 3], ["z", 1]]);
    expect(commentCounts(null).size).toBe(0);
  });

  it("turns a selection into GitHub's line, side, start_line and start_side", () => {
    expect(commentRange({ side: "RIGHT", line: 3 }, { side: "RIGHT", line: 3 })).toEqual({ line: 3, side: "RIGHT" });
    expect(commentRange({ side: "LEFT", line: 2 }, { side: "RIGHT", line: 4 })).toEqual({ line: 4, side: "RIGHT", startLine: 2, startSide: "LEFT" });
    // A Shift-click upward still sends the range in diff order.
    const rows = file.hunks[0]!.lines.map((line, index) => ({ index, kind: 0, fileIndex: 0, hunkIndex: 0, oldLineNumber: line.kind === "+" ? 0 : line.oldLine, newLineNumber: line.kind === "-" ? 0 : line.newLine, changeType: line.kind === "+" ? 1 : line.kind === "-" ? 2 : 0, text: line.text, tokens: [] }));
    const items = diffPaneItems(rows);
    expect(lineRange(items, 4, 2, { path: "src/a.ts", file })).toEqual({ start: { side: "old", line: 2, path: "src/a.ts" }, end: { side: "new", line: 3, path: "src/a.ts" } });
    expect(lineRange(items, null, 5, { path: "src/a.ts", file })).toEqual({ start: { side: "new", line: 4, path: "src/a.ts" }, end: { side: "new", line: 4, path: "src/a.ts" } });
    expect(lineRange(items, null, null, { path: "src/a.ts", file })).toBeNull();
    // Ending on a removed line, a range from a context line starts on the old side (context "one" is old 1).
    expect(lineRange(items, 1, 2, { path: "src/a.ts", file })).toEqual({ start: { side: "old", line: 1, path: "src/a.ts" }, end: { side: "old", line: 2, path: "src/a.ts" } });
    // Ending on an added line it stays on the new side.
    expect(lineRange(items, 1, 3, { path: "src/a.ts", file })!.start).toEqual({ side: "new", line: 1, path: "src/a.ts" });
  });

  it("keeps a Shift-click range inside the cursor's hunk", () => {
    const rows = file.hunks.flatMap((hunk, hunkIndex) => hunk.lines.map(line => ({ hunkIndex, oldLineNumber: line.kind === "+" ? 0 : line.oldLine, newLineNumber: line.kind === "-" ? 0 : line.newLine, changeType: line.kind === "+" ? 1 : line.kind === "-" ? 2 : 0 }))).map((row, index) => ({ ...row, index, kind: 0, fileIndex: 0, text: "", tokens: [] }));
    const items = diffPaneItems(rows);
    // Items: hunk 0 header, 6 lines (1-6), hunk 1 header (7), 3 lines (8-10). Anchor in hunk 0, cursor on hunk 1's "new" line.
    expect(rangeBounds(items, 2, 9)).toEqual({ from: 8, to: 9 });
    expect(lineRange(items, 2, 9, { path: "src/a.ts", file })).toEqual({ start: { side: "new", line: 21, path: "src/a.ts" }, end: { side: "new", line: 22, path: "src/a.ts" } });
    expect(rangeBounds(items, 9, 2)).toEqual({ from: 2, to: 6 });
  });
});

describe("controller", () => {
  const pr = (number: number): GitHubPullRequest => ({ number, title: `PR ${number}`, author: "ana", state: "open", draft: false, merged: false, base: "main", head: "feature", headSha: `head${number}`, url: "" });
  function setup() {
    let state!: PullRequestsState;
    const client = {
      pullRequests: jest.fn(async () => [pr(2)]),
      pullRequestFiles: jest.fn(async () => [{ path: "src/a.ts", previousPath: null, status: "modified", additions: 1, deletions: 1, patch: "@@ -1 +1 @@\n-a\n+b" }]),
      reviewThreads: jest.fn(async () => ({ headSha: "", threads: [thread("T1")] })),
      addReviewComment: jest.fn(async () => {}),
      replyToReviewComment: jest.fn(async () => {}),
    };
    const owner = createPullRequests(next => { state = next; }, { serviceFor: () => ({ remoteUrl: async () => "git@github.com:me/app.git", configValue: async () => null }) as unknown as GitService, clientFor: () => client });
    return { owner, client, state: () => state };
  }
  const settle = async () => { for (let index = 0; index < 6; index += 1) await Promise.resolve(); };

  it("reads threads with the files on selection and refresh, and clears them on sign-out", async () => {
    const { owner, client, state } = setup();
    owner.setToken("t");
    await owner.setRoot("/repo");
    owner.select(2);
    await settle();
    expect(client.reviewThreads).toHaveBeenCalledWith({ owner: "me", name: "app" }, 2);
    expect(state().threads?.map(entry => entry.id)).toEqual(["T1"]);
    await owner.refresh();
    await settle();
    expect(client.reviewThreads).toHaveBeenCalledTimes(2);
    owner.setToken(null);
    expect(state()).toMatchObject({ threads: null, threadsError: null, files: null });
  });

  it("keeps the files when the threads can't be read, and shows GitHub's message", async () => {
    const { owner, client, state } = setup();
    client.reviewThreads.mockRejectedValueOnce(new GitHubError("rate-limit", "GitHub’s API rate limit is used up.", 403));
    owner.setToken("t");
    await owner.setRoot("/repo");
    owner.select(2);
    await settle();
    expect(state()).toMatchObject({ threads: null, threadsError: { kind: "rate-limit" }, filesError: null });
    expect(state().files).toHaveLength(1);
  });

  it("posts on the head commit and the selected file, re-reads threads after a write, and throws GitHub's error", async () => {
    const { owner, client, state } = setup();
    owner.setToken("t");
    await owner.setRoot("/repo");
    owner.select(2);
    await settle();
    client.reviewThreads.mockResolvedValueOnce({ headSha: "", threads: [thread("T1"), thread("T2")] });
    await owner.addComment({ line: 1, side: "RIGHT", body: "Nice" });
    expect(client.addReviewComment).toHaveBeenCalledWith({ owner: "me", name: "app" }, 2, { line: 1, side: "RIGHT", body: "Nice", path: "src/a.ts", commitId: "head2" });
    expect(state()).toMatchObject({ writing: false });
    expect(state().threads?.map(entry => entry.id)).toEqual(["T1", "T2"]);
    await owner.reply(7, "Thanks");
    expect(client.replyToReviewComment).toHaveBeenCalledWith({ owner: "me", name: "app" }, 2, 7, "Thanks");
    client.addReviewComment.mockRejectedValueOnce(new GitHubError("other", "GitHub answered 422: Validation Failed: line must be part of the diff.", 422));
    await expect(owner.addComment({ line: 9, side: "RIGHT", body: "x" })).rejects.toThrow("line must be part of the diff");
    expect(state().writing).toBe(false);
    expect(client.reviewThreads).toHaveBeenCalledTimes(4);
  });

  it("comments on the head commit read with the threads when someone pushed after the list was read", async () => {
    const { owner, client } = setup();
    client.reviewThreads.mockResolvedValue({ headSha: "pushed", threads: [] });
    owner.setToken("t");
    await owner.setRoot("/repo");
    owner.select(2);
    await settle();
    await owner.addComment({ line: 1, side: "RIGHT", body: "x" });
    expect(client.addReviewComment).toHaveBeenLastCalledWith({ owner: "me", name: "app" }, 2, expect.objectContaining({ commitId: "pushed" }));
  });

  it("allows one write at a time, even when the repository changes while a post is out", async () => {
    const { owner, client } = setup();
    owner.setToken("t");
    await owner.setRoot("/repo");
    owner.select(2);
    await settle();
    let release!: () => void;
    client.addReviewComment.mockImplementationOnce(() => new Promise<void>(resolve => { release = resolve; }));
    const first = owner.addComment({ line: 1, side: "RIGHT", body: "one" });
    await owner.setRoot("/repo");
    owner.select(2);
    await settle();
    await owner.addComment({ line: 1, side: "RIGHT", body: "two" });
    expect(client.addReviewComment).toHaveBeenCalledTimes(1);
    release();
    await first;
    await owner.addComment({ line: 1, side: "RIGHT", body: "three" });
    expect(client.addReviewComment).toHaveBeenCalledTimes(2);
  });

  it("drops a slow thread read once another pull request is selected", async () => {
    const { owner, client, state } = setup();
    client.pullRequests.mockResolvedValue([pr(2), pr(3)]);
    owner.setToken("t");
    await owner.setRoot("/repo");
    let release!: (result: { headSha: string; threads: ReviewThread[] }) => void;
    client.reviewThreads.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
    owner.select(2);
    owner.select(3);
    await settle();
    release({ headSha: "", threads: [thread("stale")] });
    await settle();
    expect(state().number).toBe(3);
    expect(state().threads?.map(entry => entry.id)).toEqual(["T1"]);
  });
});
