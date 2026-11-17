import type { GitService } from "@legend-apps/git-core";
import { canSubmitReview, createGitHubClient, GitHubError, reviewSummary, type GitHubPullRequest, type GitHubReview, type ReviewThread } from "../github";
import { createPullRequests, pullRequestBranch, type PullRequestsState } from "../gitPullRequests";
import { createGitRefs } from "../gitRefs";

const token = "github_pat_SECRET123";
const repo = { owner: "me", name: "app" };
const api = "https://api.github.com";
type Call = { url: string; method: string; body: unknown };

/** A fetch that answers by "METHOD url" and records every call's method and JSON body. */
function fakeFetch(replies: Record<string, { status: number; body?: unknown; link?: string }>) {
  const calls: Call[] = [];
  const fetch = jest.fn(async (url: string, init: { method?: string; headers: Record<string, string>; body?: string }) => {
    const method = init.method ?? "GET";
    calls.push({ url, method, body: init.body ? JSON.parse(init.body) : undefined });
    const reply = replies[`${method} ${url}`];
    if (!reply) throw new TypeError(`Network request failed for ${url} with ${init.headers.Authorization}`);
    return { status: reply.status, headers: { get: (name: string) => name.toLowerCase() === "link" ? reply.link ?? null : null }, json: async () => reply.body, text: async () => JSON.stringify(reply.body ?? "") };
  });
  return { fetch, calls };
}
const reviewsUrl = `${api}/repos/me/app/pulls/4/reviews`;

describe("submitting a review", () => {
  it("posts the event, the head commit and the summary; Approve may go without one, Comment and Request Changes may not", async () => {
    const { fetch, calls } = fakeFetch({ [`POST ${reviewsUrl}`]: { status: 200, body: { id: 1 } } });
    const client = createGitHubClient({ token, fetch });
    await client.submitReview(repo, 4, { commitId: "abc", event: "APPROVE", body: "  " });
    await client.submitReview(repo, 4, { commitId: "abc", event: "APPROVE", body: " Ship it \n" });
    await client.submitReview(repo, 4, { commitId: "abc", event: "REQUEST_CHANGES", body: "Rename x" });
    await client.submitReview(repo, 4, { commitId: "abc", event: "COMMENT", body: "Looks fine" });
    expect(calls.map(call => [call.method, call.url, call.body])).toEqual([
      ["POST", reviewsUrl, { commit_id: "abc", event: "APPROVE" }],
      ["POST", reviewsUrl, { commit_id: "abc", event: "APPROVE", body: "Ship it" }],
      ["POST", reviewsUrl, { commit_id: "abc", event: "REQUEST_CHANGES", body: "Rename x" }],
      ["POST", reviewsUrl, { commit_id: "abc", event: "COMMENT", body: "Looks fine" }],
    ]);
    await expect(client.submitReview(repo, 4, { commitId: "abc", event: "REQUEST_CHANGES", body: " " })).rejects.toThrow("Say what needs to change.");
    await expect(client.submitReview(repo, 4, { commitId: "abc", event: "COMMENT", body: "" })).rejects.toThrow("Write a comment to submit.");
    expect(calls).toHaveLength(4);
    expect([canSubmitReview("APPROVE", ""), canSubmitReview("COMMENT", " "), canSubmitReview("REQUEST_CHANGES", ""), canSubmitReview("REQUEST_CHANGES", "x")]).toEqual([true, false, false, true]);
  });

  it("shows GitHub's 422 for your own pull request, a 401 as unauthorized, and never the token", async () => {
    const own = fakeFetch({ [`POST ${reviewsUrl}`]: { status: 422, body: { message: "Unprocessable Entity", errors: ["Review Can not approve your own pull request"] } } });
    const error = await createGitHubClient({ token, fetch: own.fetch }).submitReview(repo, 4, { commitId: "abc", event: "APPROVE", body: "" }).catch((failed: unknown) => failed);
    expect(error).toBeInstanceOf(GitHubError);
    expect((error as GitHubError).message).toBe("GitHub answered 422: Unprocessable Entity: Review Can not approve your own pull request.");
    const refused = fakeFetch({ [`POST ${reviewsUrl}`]: { status: 401, body: { message: `Bad credentials ${token}` } } });
    const unauthorized = await createGitHubClient({ token, fetch: refused.fetch }).submitReview(repo, 4, { commitId: "abc", event: "COMMENT", body: "x" }).catch((failed: unknown) => failed as GitHubError);
    expect(unauthorized).toMatchObject({ kind: "unauthorized" });
    const offline = await createGitHubClient({ token, fetch: fakeFetch({}).fetch }).submitReview(repo, 5, { commitId: "abc", event: "COMMENT", body: "x" }).catch((failed: unknown) => failed as GitHubError);
    expect(offline).toMatchObject({ kind: "network" });
    for (const failed of [error, unauthorized, offline]) expect(JSON.stringify([String(failed), (failed as Error).message])).not.toContain(token);
  });
});

describe("reading reviews", () => {
  it("reads every page", async () => {
    const page = (ids: number[]) => ids.map(id => ({ id, user: { login: `u${id}` }, state: "COMMENTED", submitted_at: "2026-11-17T10:00:00Z" }));
    const { fetch, calls } = fakeFetch({
      [`GET ${reviewsUrl}?per_page=100`]: { status: 200, body: page([1, 2]), link: `<${reviewsUrl}?per_page=100&page=2>; rel="next"` },
      [`GET ${reviewsUrl}?per_page=100&page=2`]: { status: 200, body: [...page([3]), { id: 4, user: null, state: "APPROVED" }] },
    });
    const reviews = await createGitHubClient({ token, fetch }).reviews(repo, 4);
    expect(reviews.map(review => [review.id, review.author, review.state])).toEqual([[1, "u1", "COMMENTED"], [2, "u2", "COMMENTED"], [3, "u3", "COMMENTED"], [4, "ghost", "APPROVED"]]);
    expect(calls).toHaveLength(2);
  });

  it("keeps each reviewer's latest approval or change request, drops dismissed ones, and says who only commented", () => {
    let id = 0;
    const review = (author: string, state: GitHubReview["state"]): GitHubReview => ({ id: ++id, author, state, submittedAt: null });
    const summary = reviewSummary([
      review("ana", "CHANGES_REQUESTED"), review("bo", "APPROVED"), review("ana", "APPROVED"), review("ana", "COMMENTED"),
      review("bo", "CHANGES_REQUESTED"), review("cy", "COMMENTED"), review("di", "APPROVED"), review("di", "DISMISSED"),
      review("ed", "PENDING"), review("fa", "APPROVED"), review("fa", "DISMISSED"), review("fa", "COMMENTED"),
    ]);
    expect(summary.map(entry => entry.text)).toEqual(["ana approved", "bo requested changes", "cy commented", "fa commented"]);
    expect(reviewSummary([])).toEqual([]);
  });
});

describe("controller", () => {
  const pr = (number: number, head = "feature"): GitHubPullRequest => ({ number, title: `PR ${number}`, author: "ana", state: "open", draft: false, merged: false, base: "main", head, headSha: `head${number}`, url: "" });
  function setup(remotes: Record<string, string> = { origin: "git@github.com:me/app.git" }) {
    let state!: PullRequestsState;
    const client = {
      pullRequests: jest.fn(async () => [pr(2)]),
      pullRequestFiles: jest.fn(async () => [{ path: "a.ts", previousPath: null, status: "modified", additions: 1, deletions: 1, patch: "@@ -1 +1 @@\n-a\n+b" }]),
      reviewThreads: jest.fn(async () => ({ headSha: "head2-pushed", threads: [] as ReviewThread[] })),
      reviews: jest.fn(async (): Promise<GitHubReview[]> => [{ id: 1, author: "bo", state: "APPROVED", submittedAt: null }]),
      addReviewComment: jest.fn(async () => {}),
      replyToReviewComment: jest.fn(async () => {}),
      submitReview: jest.fn(async () => {}),
    };
    const owner = createPullRequests(next => { state = next; }, { serviceFor: () => ({ remoteUrl: async (name: string) => remotes[name] ?? null, configValue: async () => null }) as unknown as GitService, clientFor: () => client });
    return { owner, client, state: () => state };
  }
  const settle = async () => { for (let index = 0; index < 8; index += 1) await Promise.resolve(); };

  it("reads reviews with the files on selection and refresh, submits on the newest head commit and reads again, and clears on sign-out", async () => {
    const { owner, client, state } = setup({ origin: "git@github.com:me/app.git", upstream: "https://github.com/up/app.git" });
    owner.setToken("t");
    await owner.setRoot("/repo");
    expect(state()).toMatchObject({ repo: { owner: "up", name: "app" }, remote: "upstream" });
    owner.select(2);
    await settle();
    expect(client.reviews).toHaveBeenCalledWith({ owner: "up", name: "app" }, 2);
    expect(state().reviews).toEqual([{ id: 1, author: "bo", state: "APPROVED", submittedAt: null }]);
    await owner.refresh();
    await settle();
    expect(client.reviews).toHaveBeenCalledTimes(2);

    await owner.submitReview("REQUEST_CHANGES", "Rename x");
    expect(client.submitReview).toHaveBeenCalledWith({ owner: "up", name: "app" }, 2, { commitId: "head2-pushed", event: "REQUEST_CHANGES", body: "Rename x" });
    expect(client.reviews).toHaveBeenCalledTimes(3);
    expect(client.reviewThreads).toHaveBeenCalledTimes(3);

    // A refused write still re-reads; its error goes to the caller.
    client.submitReview.mockRejectedValueOnce(new GitHubError("other", "GitHub answered 422: Unprocessable Entity: Review Can not approve your own pull request.", 422));
    await expect(owner.submitReview("APPROVE", "")).rejects.toThrow("Can not approve your own pull request");
    expect(state().writing).toBe(false);

    // A reviews read GitHub refuses keeps the files.
    client.reviews.mockRejectedValueOnce(new GitHubError("rate-limit", "GitHub’s API rate limit is used up.", 403));
    await owner.refresh();
    await settle();
    expect(state()).toMatchObject({ reviewsError: { kind: "rate-limit" }, files: [expect.objectContaining({ path: "a.ts" })] });

    owner.setToken(null);
    expect(state()).toMatchObject({ reviews: null, reviewsError: null, number: null });
  });

  it("names a pull request's branch after its head, with the fork's owner first", () => {
    expect(pullRequestBranch(pr(1, "fix-gutter"))).toBe("fix-gutter");
    expect(pullRequestBranch(pr(1, "bo:fix-gutter"))).toBe("bo/fix-gutter");
    expect(pullRequestBranch(pr(1, "bo:feature/deep"))).toBe("bo/feature/deep");
  });
});

describe("a pull request's worktree", () => {
  it("goes next to the main worktree, named after the branch, and takes the next free name when that folder exists", async () => {
    const taken = new Set(["/src/app-bo-fix", "/src/app-bo-fix-2"]);
    const addWorktree = jest.fn(async (path: string, _options: unknown) => {
      if (taken.has(path)) throw new Error(`fatal: '${path}' already exists`);
      return path;
    });
    const git = { addWorktree, listRefs: jest.fn(async () => ({ branches: [], remotes: [], tags: [], defaultBranch: null })), listStashes: jest.fn(async () => []), listWorktrees: jest.fn(async () => []) };
    const refs = createGitRefs(() => {}, () => git as unknown as GitService);
    refs.setRoot("/src/app");
    await expect(refs.addWorktreeNextTo("/src/app/", "bo/fix")).resolves.toBe("/src/app-bo-fix-3");
    expect(addWorktree.mock.calls.map(([path, options]) => [path, (options as { branch: string }).branch])).toEqual([["/src/app-bo-fix", "bo/fix"], ["/src/app-bo-fix-2", "bo/fix"], ["/src/app-bo-fix-3", "bo/fix"]]);
    // Any other refusal is Git's to show.
    addWorktree.mockRejectedValueOnce(new Error("fatal: 'bo/fix' is already used by worktree at '/src/other'"));
    await expect(refs.addWorktreeNextTo("/src/app", "bo/fix")).rejects.toThrow("already used by worktree");
    expect(addWorktree).toHaveBeenCalledTimes(4);
    refs.dispose();
  });
});
