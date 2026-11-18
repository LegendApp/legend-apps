import type { GitService } from "@legend-apps/git-core";
import { createGitHubAccount } from "../gitHubAccount";
import { createPullRequests, type PullRequestsState } from "../gitPullRequests";
import { GitHubError, type GitHubPullRequest, type MergedPullRequest, type ReviewThread } from "../github";

const pr = (number: number): GitHubPullRequest => ({ number, title: `PR ${number}`, author: "ana", state: "open", draft: false, merged: false, base: "main", head: "feature", headSha: `sha${number}`, url: "" });
const service = (remotes: Record<string, string>, override: string | null = null) => ({
  remoteUrl: jest.fn(async (name: string) => remotes[name] ?? null), configValue: jest.fn(async () => override),
}) as unknown as GitService;

function setup(remotes: Record<string, string> = { origin: "git@github.com:me/app.git" }, override: string | null = null) {
  let state!: PullRequestsState;
  const client = {
    pullRequests: jest.fn(async () => [pr(2), pr(1)]),
    pullRequestFiles: jest.fn(async () => [{ path: "a.ts", previousPath: null, status: "modified", additions: 1, deletions: 1, patch: "@@ -1 +1 @@\n-a\n+b" }, { path: "b.png", previousPath: null, status: "added", additions: 0, deletions: 0, patch: null }]),
    reviewThreads: jest.fn(async () => ({ headSha: "", threads: [] as ReviewThread[] })),
    addReviewComment: jest.fn(async () => {}),
    replyToReviewComment: jest.fn(async () => {}),
    reviews: jest.fn(async () => []),
    submitReview: jest.fn(async () => {}),
    createPullRequest: jest.fn(async (_repo: unknown, input: { head: string; title: string }): Promise<GitHubPullRequest> => ({ ...pr(9), title: input.title, head: input.head })),
    mergedPullRequests: jest.fn(async (): Promise<MergedPullRequest[]> => []),
  };
  const clientFor = jest.fn((_token: string, _apiUrl: string) => client);
  const owner = createPullRequests(next => { state = next; }, { serviceFor: () => service(remotes, override), clientFor });
  return { owner, client, clientFor, state: () => state };
}

it("lists nothing and reads nothing while signed out or for a non-GitHub remote", async () => {
  const signedOut = setup();
  await signedOut.owner.setRoot("/repo");
  expect(signedOut.state()).toMatchObject({ repo: { owner: "me", name: "app" }, pulls: null });
  expect(signedOut.clientFor).not.toHaveBeenCalled();
  const other = setup({ origin: "https://github.example.com/me/app.git" });
  other.owner.setToken("t");
  await other.owner.setRoot("/repo");
  expect(other.state().repo).toBeNull();
  expect(other.client.pullRequests).not.toHaveBeenCalled();
});

it("prefers the upstream remote, honours only a loopback API override, lists, selects and clears on sign-out", async () => {
  const { owner, client, clientFor, state } = setup({ origin: "git@github.com:me/app.git", upstream: "https://github.com/LegendApp/app.git" }, "http://127.0.0.1:8123");
  owner.setToken("t");
  await owner.setRoot("/repo");
  expect(clientFor).toHaveBeenLastCalledWith("t", "http://127.0.0.1:8123");
  expect(client.pullRequests).toHaveBeenCalledWith({ owner: "LegendApp", name: "app" });
  expect(state().pulls?.map(pull => pull.number)).toEqual([2, 1]);
  owner.select(1);
  await Promise.resolve(); await Promise.resolve();
  expect(client.pullRequestFiles).toHaveBeenCalledWith({ owner: "LegendApp", name: "app" }, 1);
  expect(state()).toMatchObject({ number: 1, selectedPath: "a.ts", filesLoading: false });
  expect(state().files![0]!.file?.hunks).toHaveLength(1);
  expect(state().files![1]!.text).toBeNull();
  owner.selectFile("b.png");
  expect(state().selectedPath).toBe("b.png");
  // A refresh keeps the selection and re-reads its files.
  await owner.refresh();
  expect(state()).toMatchObject({ number: 1, selectedPath: "b.png" });
  expect(client.pullRequestFiles).toHaveBeenCalledTimes(2);
  owner.setToken(null);
  expect(state()).toMatchObject({ pulls: null, number: null, files: null, selectedPath: null, error: null });
  await owner.refresh();
  expect(client.pullRequests).toHaveBeenCalledTimes(2);
});

it("forgets one repository's API override when another opens", async () => {
  let override: string | null = "http://127.0.0.1:8123";
  const clientFor = jest.fn((_token: string, _apiUrl: string) => ({ pullRequests: jest.fn(async () => []), pullRequestFiles: jest.fn(async () => []), reviewThreads: jest.fn(async () => ({ headSha: "", threads: [] })), addReviewComment: jest.fn(), replyToReviewComment: jest.fn(), reviews: jest.fn(async () => []), submitReview: jest.fn(), createPullRequest: jest.fn(), mergedPullRequests: jest.fn(async () => []) }));
  const owner = createPullRequests(() => {}, { serviceFor: () => ({ remoteUrl: async () => "git@github.com:me/app.git", configValue: async () => override }) as unknown as GitService, clientFor });
  owner.setToken("t");
  await owner.setRoot("/a");
  expect(owner.apiUrl()).toBe("http://127.0.0.1:8123");
  override = null;
  await owner.setRoot("/b");
  expect(owner.apiUrl()).toBe("https://api.github.com");
  await owner.setRoot(null);
  expect(owner.apiUrl()).toBe("https://api.github.com");
});

it("parses each file's patch on its own, so a malformed one shows its error and the others still show", async () => {
  const { owner, client, state } = setup();
  client.pullRequestFiles.mockResolvedValueOnce([
    { path: "bad.ts", previousPath: null, status: "modified", additions: 1, deletions: 1, patch: "@@ -1,7 +1,9 @@\n-a\n+b" },
    { path: "good.ts", previousPath: null, status: "modified", additions: 1, deletions: 1, patch: "@@ -1 +1 @@\n-a\n+b" },
  ]);
  owner.setToken("t");
  await owner.setRoot("/repo");
  owner.select(2);
  await Promise.resolve(); await Promise.resolve();
  expect(state().filesError).toBeNull();
  expect(state().files!.map(file => [file.path, !!file.file, file.error])).toEqual([["bad.ts", false, expect.stringMatching(/ended inside a hunk/)], ["good.ts", true, null]]);
});

it("keeps an error with GitHub's message, clears it on the next good read, and drops a closed PR's selection", async () => {
  const { owner, client, state } = setup();
  owner.setToken("t");
  await owner.setRoot("/repo");
  owner.select(2);
  await Promise.resolve(); await Promise.resolve();
  client.pullRequests.mockRejectedValueOnce(new GitHubError("unauthorized", "GitHub didn’t accept the token: Bad credentials.", 401));
  await owner.refresh();
  expect(state()).toMatchObject({ error: { kind: "unauthorized", message: expect.stringContaining("Bad credentials") }, pulls: [pr(2), pr(1)], number: 2 });
  client.pullRequests.mockResolvedValueOnce([pr(1)]);
  await owner.refresh();
  expect(state()).toMatchObject({ error: null, number: null, files: null });
});

it("lets the newest read win over a slower older one", async () => {
  const { owner, client, state } = setup();
  owner.setToken("t");
  await owner.setRoot("/repo");
  let release!: (value: GitHubPullRequest[]) => void;
  client.pullRequests.mockImplementationOnce(() => new Promise(resolve => { release = resolve; }));
  const slow = owner.refresh();
  client.pullRequests.mockResolvedValueOnce([pr(9)]);
  await owner.refresh();
  release([pr(5)]);
  await slow;
  expect(state().pulls?.map(pull => pull.number)).toEqual([9]);
});

describe("account", () => {
  const storage = () => {
    const items = new Map<string, string>();
    return { items, store: { get: jest.fn(async (key: string) => items.get(key) ?? null), set: jest.fn(async (key: string, value: string) => { items.set(key, value); }), remove: jest.fn(async (key: string) => { items.delete(key); }) } };
  };

  it("checks a token with GET /user before keeping it in the keychain, and signs out", async () => {
    const { items, store } = storage();
    const user = jest.fn(async () => ({ login: "ana", name: null }));
    const account = createGitHubAccount(() => store, () => ({ user }));
    await account.load();
    expect(account.get()).toEqual({ status: "signed-out", login: null });
    await account.signIn("  tok  ", "http://127.0.0.1:1");
    expect(items.get("github.com.token")).toBe("tok");
    expect(account.get()).toEqual({ status: "signed-in", login: "ana" });
    expect(account.token()).toBe("tok");
    await account.signOut();
    expect(items.size).toBe(0);
    expect(account.token()).toBeNull();
    expect(account.get().status).toBe("signed-out");
  });

  it("keeps nothing when GitHub refuses the token, and never logs it", async () => {
    const { items, store } = storage();
    const log = jest.spyOn(console, "error").mockImplementation(() => {});
    const account = createGitHubAccount(() => store, () => ({ user: async () => { throw new GitHubError("unauthorized", "GitHub didn’t accept the token: Bad credentials.", 401); } }));
    await account.load();
    await expect(account.signIn("secret-token")).rejects.toThrow("Bad credentials");
    expect(items.size).toBe(0);
    expect(account.get().status).toBe("signed-out");
    store.get.mockRejectedValueOnce(new Error("keychain secret-token"));
    const broken = createGitHubAccount(() => store, () => ({ user: jest.fn() }));
    await broken.load();
    expect(JSON.stringify(log.mock.calls)).not.toContain("secret-token");
    log.mockRestore();
  });

  it("stays signed in when the keychain refuses to delete the token, and a sign-in that finishes after a sign-out doesn't sign back in", async () => {
    const { items, store } = storage();
    items.set("github.com.token", "saved"); items.set("github.com.login", "ana");
    let release!: (user: { login: string; name: null }) => void;
    const account = createGitHubAccount(() => store, () => ({ user: () => new Promise(resolve => { release = resolve; }) }));
    await account.load();
    store.remove.mockRejectedValueOnce(new Error("denied"));
    await expect(account.signOut()).rejects.toThrow("denied");
    expect(account.get().status).toBe("signed-in");
    const signingIn = account.signIn("new");
    await account.signOut();
    release({ login: "bo", name: null });
    await expect(signingIn).rejects.toThrow("Signed out while signing in.");
    expect(account.get().status).toBe("signed-out");
    expect(items.size).toBe(0);
  });

  it("reads a saved token at launch", async () => {
    const { items, store } = storage();
    items.set("github.com.token", "saved"); items.set("github.com.login", "ana");
    const account = createGitHubAccount(() => store);
    await account.load();
    expect(account.get()).toEqual({ status: "signed-in", login: "ana" });
    expect(account.token()).toBe("saved");
  });
});
