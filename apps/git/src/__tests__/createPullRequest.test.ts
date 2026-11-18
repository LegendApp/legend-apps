import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { GitService, type GitRefList } from "@legend-apps/git-core";
import { fixtureGit } from "../../../../packages/git-core/test/fixtures/make-repos";
import { realRunner } from "../../../../packages/git-core/test/fixtures/realRunner";
import { createGitHubClient, GitHubError, type GitHubPullRequest, type MergedPullRequest } from "../github";
import { createPullRequests, mergedBranches, pullRequestBases, pullRequestHead, pullRequestTitle, pushedAs, type PullRequestsState } from "../gitPullRequests";

const token = "github_pat_SECRET123";
const repo = { owner: "LegendApp", name: "app" };
const api = "https://api.github.com";

function fakeFetch(reply: (url: string, method: string, body: any) => { status: number; body?: unknown }) {
  const calls: { url: string; method: string; body: any }[] = [];
  const fetch = jest.fn(async (url: string, init: { method?: string; headers: Record<string, string>; body?: string }) => {
    const call = { url, method: init.method ?? "GET", body: init.body ? JSON.parse(init.body) : undefined };
    calls.push(call);
    const answer = reply(call.url, call.method, call.body);
    return { status: answer.status, headers: { get: () => null }, json: async () => answer.body, text: async () => JSON.stringify(answer.body ?? "") };
  });
  return { fetch, calls };
}
const rawPull = (number: number, head: string, label = `LegendApp:${head}`, fullName = "LegendApp/app") =>
  ({ number, title: `PR ${number}`, user: { login: "ana" }, state: "open", draft: false, base: { ref: "main" }, head: { ref: head, sha: `sha${number}`, label, repo: { full_name: fullName } }, html_url: `https://github.com/LegendApp/app/pull/${number}` });

describe("the client", () => {
  it("posts head, base, title, body and draft, and returns the new pull request", async () => {
    const { fetch, calls } = fakeFetch(() => ({ status: 201, body: rawPull(7, "feature", "me:feature", "me/app") }));
    const pull = await createGitHubClient({ token, fetch }).createPullRequest(repo, { head: "me:feature", base: "main", title: " Add it ", body: "Why", draft: true });
    expect(calls).toEqual([{ url: `${api}/repos/LegendApp/app/pulls`, method: "POST", body: { head: "me:feature", base: "main", title: "Add it", body: "Why", draft: true } }]);
    expect(pull).toMatchObject({ number: 7, head: "me:feature", url: "https://github.com/LegendApp/app/pull/7" });
  });

  it("shows GitHub's 422 messages without doubling the period, and never the token", async () => {
    const answers = [
      { message: "Validation Failed", errors: [{ resource: "PullRequest", code: "custom", message: `A pull request already exists for me:feature.` }] },
      { message: "Validation Failed", errors: [{ resource: "PullRequest", code: "custom", message: "No commits between main and feature" }] },
      { message: "Validation Failed", errors: [{ resource: "PullRequest", field: "base", code: "invalid" }] },
      { message: `Bad credentials for ${token}` },
    ];
    const { fetch } = fakeFetch(() => { const body = answers.shift()!; return { status: "errors" in body ? 422 : 401, body }; });
    const client = createGitHubClient({ token, fetch });
    const input = { head: "feature", base: "main", title: "T", body: "", draft: false };
    await expect(client.createPullRequest(repo, input)).rejects.toThrow("GitHub answered 422: Validation Failed: A pull request already exists for me:feature.");
    await expect(client.createPullRequest(repo, input)).rejects.toThrow("GitHub answered 422: Validation Failed: No commits between main and feature.");
    await expect(client.createPullRequest(repo, input)).rejects.toThrow("GitHub answered 422: Validation Failed: base invalid.");
    const error = await client.createPullRequest(repo, input).catch((failed: unknown) => failed) as GitHubError;
    expect(error).toMatchObject({ kind: "unauthorized", message: "GitHub didn’t accept the token: Bad credentials for •••." });
  });

  it("reads merged pull requests in one query a page, newest first, and stops at the page cap", async () => {
    const node = (number: number) => ({ number, headRefName: `b${number}`, headRefOid: `sha${number}`, headRepositoryOwner: { login: "me" } });
    const { fetch, calls } = fakeFetch((_url, _method, body) => {
      const page = Number(body.variables.after ?? 0);
      return { status: 200, body: { data: { repository: { pullRequests: { nodes: [node(page * 10 + 1), node(page * 10 + 2)], pageInfo: { hasNextPage: true, endCursor: String(page + 1) } } } } } };
    });
    const merged = await createGitHubClient({ token, fetch, mergedPages: 2 }).mergedPullRequests(repo);
    expect(merged.map(pull => pull.number)).toEqual([1, 2, 11, 12]);
    expect(merged[0]).toEqual({ number: 1, headRef: "b1", headOwner: "me", headSha: "sha1" });
    expect(calls).toHaveLength(2);
    expect(calls[0]!.body.query).toContain("pullRequests(states: MERGED, first: 100, after: $after, orderBy: { field: UPDATED_AT, direction: DESC })");
    expect(calls.map(call => call.body.variables)).toEqual([{ owner: "LegendApp", name: "app", after: null }, { owner: "LegendApp", name: "app", after: "1" }]);
  });
});

describe("defaults", () => {
  it("names a fork's branch owner:branch, and a same-repository branch by itself", () => {
    expect(pullRequestHead(repo, { owner: "me", name: "app" }, "feature")).toBe("me:feature");
    expect(pullRequestHead(repo, { owner: "legendapp", name: "APP" }, "feature")).toBe("feature");
    expect(pullRequestHead(repo, null, "feature")).toBe("feature");
  });

  it("pushes a branch as itself only: one tracking another name or a gone upstream is published first", () => {
    const refs: GitRefList = { branches: [], tags: [], defaultBranch: null, remotes: [{ name: "origin", branches: [] }, { name: "my/fork", branches: [] }] };
    expect(pushedAs(refs, { name: "feature", upstream: "origin/feature", gone: false })).toEqual({ remote: "origin", branch: "feature" });
    expect(pushedAs(refs, { name: "feature", upstream: "my/fork/feature", gone: false })).toEqual({ remote: "my/fork", branch: "feature" });
    // "New Branch from origin/main" tracks origin/main: pushing it would land on main.
    expect(pushedAs(refs, { name: "feature", upstream: "origin/main", gone: false })).toBeNull();
    expect(pushedAs(refs, { name: "feature", upstream: "origin/feature", gone: true })).toBeNull();
    expect(pushedAs(refs, { name: "feature", upstream: null, gone: false })).toBeNull();
  });

  it("titles a one-commit branch after its commit, any other after the branch", () => {
    expect(pullRequestTitle("fix-gutter", ["Fix the gutter in dark mode"])).toBe("Fix the gutter in dark mode");
    expect(pullRequestTitle("fix-gutter", ["One", "Two"])).toBe("fix-gutter");
    expect(pullRequestTitle("fix-gutter", [])).toBe("fix-gutter");
  });

  it("offers the remote's branches with its HEAD, else main or master, preselected", () => {
    const refs = (remote: string, names: string[], defaultBranch: string | null): GitRefList => ({
      branches: [], tags: [], defaultBranch, remotes: [{ name: remote, branches: names.map(branch => ({ name: `${remote}/${branch}`, ref: `refs/remotes/${remote}/${branch}`, oid: "x", remote, branch })) }],
    });
    expect(pullRequestBases(refs("upstream", ["develop", "main", "release"], "refs/remotes/upstream/develop"), "upstream")).toEqual({ bases: ["develop", "main", "release"], base: "develop" });
    expect(pullRequestBases(refs("upstream", ["feature", "master"], "refs/remotes/origin/main"), "upstream")).toEqual({ bases: ["feature", "master"], base: "master" });
    expect(pullRequestBases(refs("origin", [], null), "origin")).toEqual({ bases: ["main"], base: "main" });
  });
});

describe("the controller", () => {
  function setup(remotes: Record<string, string>, lagging = false, now = () => 0) {
    let state!: PullRequestsState;
    let listed: GitHubPullRequest[] = [];
    const client = {
      pullRequests: jest.fn(async () => listed), pullRequestFiles: jest.fn(async () => []), reviewThreads: jest.fn(async () => ({ headSha: "", threads: [] })),
      reviews: jest.fn(async () => []), addReviewComment: jest.fn(), replyToReviewComment: jest.fn(), submitReview: jest.fn(),
      createPullRequest: jest.fn(async (_repo: unknown, input: { head: string; title: string; draft: boolean }) => {
        const pull: GitHubPullRequest = { number: 9, title: input.title, author: "me", state: "open", draft: input.draft, merged: false, base: "main", head: input.head, headSha: "s", url: "u" };
        if (!lagging) listed = [pull, ...listed];
        return pull;
      }),
      mergedPullRequests: jest.fn(async (): Promise<MergedPullRequest[]> => [{ number: 3, headRef: "done", headOwner: "me", headSha: "tip" }]),
    };
    const git = {
      remoteUrl: async (name: string) => remotes[name] ?? null, configValue: async () => null,
      listRefs: async (): Promise<GitRefList> => ({ branches: [{ name: "done", ref: "refs/heads/done", oid: "tip", current: false, upstream: null, time: 0, ahead: 0, behind: 0, gone: false }], remotes: [], tags: [], defaultBranch: null }),
      mergeBase: async () => { throw new Error("not here"); },
    };
    const owner = createPullRequests(next => { state = next; }, { serviceFor: () => git as unknown as GitService, clientFor: () => client, now });
    return { owner, client, state: () => state };
  }
  const input = { root: "/repo", remote: "origin", remoteBranch: "feature", base: "main", title: "T", body: "", draft: false };

  it("opens a fork branch's pull request as owner:branch, lists and returns it, and a same-repository branch's as the branch", async () => {
    const fork = setup({ origin: "git@github.com:me/app.git", upstream: "https://github.com/LegendApp/app.git" });
    fork.owner.setToken("t");
    await fork.owner.setRoot("/repo");
    const number = await fork.owner.createPullRequest({ root: "/repo", remote: "origin", remoteBranch: "feature", base: "main", title: "Add it", body: "", draft: true });
    expect(fork.client.createPullRequest).toHaveBeenCalledWith(repo, { head: "me:feature", base: "main", title: "Add it", body: "", draft: true });
    expect(number).toBe(9);
    expect(fork.state()).toMatchObject({ writing: false });
    expect(fork.state().pulls?.map(pull => pull.number)).toEqual([9]);

    // GitHub's list may not have it yet; it's listed anyway.
    const same = setup({ origin: "git@github.com:LegendApp/app.git" }, true);
    same.owner.setToken("t");
    await same.owner.setRoot("/repo");
    await same.owner.createPullRequest({ root: "/repo", remote: "origin", remoteBranch: "feature", base: "main", title: "Add it", body: "Body", draft: false });
    expect(same.client.createPullRequest).toHaveBeenCalledWith(repo, expect.objectContaining({ head: "feature", draft: false }));
    expect(same.state().pulls?.map(pull => pull.number)).toEqual([9]);
  });

  it("throws GitHub's error and stops writing; a second create while one is out does nothing", async () => {
    const { owner, client, state } = setup({ origin: "git@github.com:LegendApp/app.git" });
    owner.setToken("t");
    await owner.setRoot("/repo");
    let fail!: (error: unknown) => void;
    client.createPullRequest.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
    const first = owner.createPullRequest(input);
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(await owner.createPullRequest(input)).toBeNull();
    fail(new GitHubError("other", "GitHub answered 422: Validation Failed: A pull request already exists for LegendApp:feature.", 422));
    await expect(first).rejects.toThrow("A pull request already exists");
    expect(state().writing).toBe(false);
    expect(client.createPullRequest).toHaveBeenCalledTimes(1);
  });

  it("refuses a remote that isn't on GitHub and a repository that isn't open any more, without posting", async () => {
    const { owner, client, state } = setup({ origin: "git@github.com:LegendApp/app.git", gitlab: "git@gitlab.com:me/app.git" });
    owner.setToken("t");
    await owner.setRoot("/repo");
    await expect(owner.createPullRequest({ ...input, remote: "gitlab" })).rejects.toThrow("“gitlab” isn’t a GitHub remote, so a pull request can’t come from it. Publish the branch to a GitHub remote first.");
    expect(state().writing).toBe(false);
    await expect(owner.createPullRequest({ ...input, root: "/other" })).resolves.toBeNull();
    // Another repository opens while the remote is read.
    const opening = owner.createPullRequest(input);
    void owner.setRoot("/other");
    await expect(opening).resolves.toBeNull();
    expect(client.createPullRequest).not.toHaveBeenCalled();
  });

  it("returns a pull request created just before a sign-out, without listing it", async () => {
    const { owner, client, state } = setup({ origin: "git@github.com:LegendApp/app.git" });
    owner.setToken("t");
    await owner.setRoot("/repo");
    client.createPullRequest.mockImplementationOnce(async () => { owner.setToken(null); return { number: 9, title: "T", author: "me", state: "open", draft: false, merged: false, base: "main", head: "feature", headSha: "s", url: "u" }; });
    await expect(owner.createPullRequest(input)).resolves.toBe(9);
    expect(state().pulls).toBeNull();
  });

  it("re-reads merged pull requests on ⌘R, and on focus only once a minute", async () => {
    let time = 0;
    const { owner, client } = setup({ origin: "git@github.com:me/app.git" }, false, () => time);
    owner.setToken("t");
    await owner.setRoot("/repo");
    expect(client.mergedPullRequests).toHaveBeenCalledTimes(1);
    await owner.refresh({ focus: true });
    time = 59_000;
    await owner.refresh({ focus: true });
    expect(client.mergedPullRequests).toHaveBeenCalledTimes(1);
    await owner.refresh();
    expect(client.mergedPullRequests).toHaveBeenCalledTimes(2);
    time = 120_000;
    await owner.refresh({ focus: true });
    expect(client.mergedPullRequests).toHaveBeenCalledTimes(3);
  });

  it("reads merged pull requests with the list, marks the branch at its tip, and clears the marks on sign-out", async () => {
    const { owner, client, state } = setup({ origin: "git@github.com:me/app.git" });
    owner.setToken("t");
    await owner.setRoot("/repo");
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(client.mergedPullRequests).toHaveBeenCalledTimes(1);
    expect(state().merged).toEqual({ done: { number: 3, oid: "tip" } });
    await owner.refresh();
    expect(client.mergedPullRequests).toHaveBeenCalledTimes(2);
    owner.setToken(null);
    expect(state().merged).toEqual({});
  });
});

describe("merged branches in a real repository", () => {
  let root: string;
  beforeAll(() => { root = realpathSync(mkdtempSync(join(tmpdir(), "legend-git-merged-"))); });
  afterAll(() => { rmSync(root, { recursive: true, force: true }); });

  it("marks squash-merged branches, not ones with newer commits, another account's or one whose PR head isn't here", async () => {
    const path = join(root, "repo");
    fixtureGit(root, "init", "-q", "-b", "main", path);
    fixtureGit(path, "remote", "add", "origin", "git@github.com:me/app.git");
    fixtureGit(path, "remote", "add", "upstream", "https://github.com/LegendApp/app.git");
    const commit = (file: string) => { writeFileSync(join(path, file), file); fixtureGit(path, "add", file); fixtureGit(path, "commit", "-q", "-m", file); return fixtureGit(path, "rev-parse", "HEAD"); };
    commit("base");
    const branchWith = (name: string, files: string[], upstream = true) => {
      fixtureGit(path, "switch", "-q", "-c", name, "main");
      const oids = files.map(commit);
      if (upstream) { fixtureGit(path, "config", `branch.${name}.remote`, "origin"); fixtureGit(path, "config", `branch.${name}.merge`, `refs/heads/${name}`); }
      return oids;
    };
    const [, squashedTip] = branchWith("squashed", ["s1", "s2"]);
    const [extraHead, extraTip] = branchWith("extra", ["e1", "e2"]);
    const [olderTip, newerHead] = branchWith("older", ["o1", "o2"]);
    fixtureGit(path, "reset", "-q", "--hard", olderTip!);
    const [gutterTip] = branchWith("gutter", ["g1"], false);
    fixtureGit(path, "branch", "bo/gutter", gutterTip!);
    const [elsewhereTip] = branchWith("elsewhere", ["x1"]);
    // Made from origin/main, so it tracks main; a merged PR from "main" isn't about it.
    fixtureGit(path, "switch", "-q", "-c", "tracks-main", "main");
    fixtureGit(path, "config", "branch.tracks-main.remote", "origin"); fixtureGit(path, "config", "branch.tracks-main.merge", "refs/heads/main");
    fixtureGit(path, "switch", "-q", "main");
    // GitHub squashed "squashed" into main: Git's ancestry says it isn't merged.
    commit("squash");
    const git = new GitService(path, realRunner);
    await expect(git.mergeBase(squashedTip!, "main")).resolves.not.toBe(squashedTip);

    const pull = (number: number, headRef: string, headSha: string, headOwner = "me"): MergedPullRequest => ({ number, headRef, headOwner, headSha });
    const marks = await mergedBranches(git, repo, [
      pull(10, "squashed", squashedTip!),
      // Merged when it was at e1; "extra" has a newer commit since.
      pull(11, "extra", extraHead!),
      // Someone pushed o2 to the PR after this checkout stopped at o1: still all merged.
      pull(12, "older", newerHead!),
      // bo's fork had a branch with the same name.
      pull(13, "gutter", gutterTip!, "bo"),
      // Pushed from another machine: its head isn't here.
      pull(14, "elsewhere", "0123456789012345678901234567890123456789"),
      // The default branch is never called merged, nor a branch that only tracks it.
      pull(15, "main", fixtureGit(path, "rev-parse", "main")),
    ]);
    expect(marks).toEqual({
      squashed: { number: 10, oid: squashedTip },
      older: { number: 12, oid: olderTip },
      "bo/gutter": { number: 13, oid: gutterTip },
    });
    expect(extraTip).not.toBe(extraHead);
    expect(elsewhereTip).toBeTruthy();

    // The title: the branch's only commit since upstream's main, else the branch name.
    fixtureGit(path, "update-ref", "refs/remotes/upstream/main", "main~1");
    const controller = createPullRequests(() => {}, { serviceFor: () => git });
    await controller.setRoot(path);
    await expect(controller.suggestedTitle("bo/gutter", "main")).resolves.toBe("g1");
    await expect(controller.suggestedTitle("extra", "main")).resolves.toBe("extra");
    await expect(controller.suggestedTitle("extra", "gone")).resolves.toBe("extra");

    // Deleting the squash-merged branch needs force (Git calls it unmerged), which Delete uses for a marked branch.
    await expect(git.deleteBranch("squashed")).rejects.toThrow();
    await git.deleteBranch("squashed", { force: true });
    expect(fixtureGit(path, "branch", "--list", "squashed")).toBe("");
  });
});
