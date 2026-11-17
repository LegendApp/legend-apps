import { githubRepository } from "@legend-apps/git-core";
import { apiUrlOverride, createGitHubClient, GitHubError, pullFilePatch } from "../github";

const token = "github_pat_SECRET123";
type Reply = { status: number; body?: unknown; headers?: Record<string, string> };
function fakeFetch(replies: Record<string, Reply | ((headers: Record<string, string>) => Reply)>) {
  const calls: { url: string; headers: Record<string, string> }[] = [];
  const fetch = jest.fn(async (url: string, init: { headers: Record<string, string> }) => {
    calls.push({ url, headers: init.headers });
    const entry = replies[url];
    if (!entry) throw new TypeError(`Network request failed for ${url} with ${init.headers.Authorization}`);
    const reply = typeof entry === "function" ? entry(init.headers) : entry;
    const headers = new Map(Object.entries(reply.headers ?? {}).map(([key, value]) => [key.toLowerCase(), value]));
    return { status: reply.status, headers: { get: (name: string) => headers.get(name.toLowerCase()) ?? null }, json: async () => reply.body, text: async () => JSON.stringify(reply.body ?? "") };
  });
  return { fetch, calls };
}
const pull = (number: number, extra: object = {}) => ({ number, title: `PR ${number}`, user: { login: "ana" }, state: "open", draft: false, merged_at: null, base: { ref: "main" }, head: { ref: "feature", label: "ana:feature", repo: { full_name: "LegendApp/legend-apps" } }, html_url: `https://github.com/LegendApp/legend-apps/pull/${number}`, ...extra });
const repo = { owner: "LegendApp", name: "legend-apps" };
const api = "https://api.github.com";
const pullsUrl = `${api}/repos/LegendApp/legend-apps/pulls?state=open&per_page=100`;

describe("remote URLs", () => {
  it.each([
    ["https://github.com/LegendApp/legend-apps.git", repo],
    ["https://user@github.com/LegendApp/legend-apps/", repo],
    ["git@github.com:LegendApp/legend-apps.git", repo],
    ["ssh://git@github.com:22/LegendApp/legend-apps", repo],
    ["git://github.com/LegendApp/legend-apps.git", repo],
    ["https://github.example.com/LegendApp/legend-apps.git", null],
    ["git@github.example.com:LegendApp/legend-apps.git", null],
    ["https://gitlab.com/LegendApp/legend-apps.git", null],
    ["/tmp/remote.git", null],
    [null, null],
  ])("%s", (url, expected) => { expect(githubRepository(url)).toEqual(expected); });

  it("accepts only loopback API overrides", () => {
    expect(apiUrlOverride("http://127.0.0.1:8123/")).toBe("http://127.0.0.1:8123");
    expect(apiUrlOverride("http://localhost:9000/api")).toBe("http://localhost:9000/api");
    expect(apiUrlOverride("https://evil.example.com")).toBeNull();
    expect(apiUrlOverride("http://127.0.0.1.evil.com")).toBeNull();
    expect(apiUrlOverride(null)).toBeNull();
  });
});

describe("client", () => {
  it("lists open pull requests across pages, with fork heads labelled by owner", async () => {
    const page2 = `${api}/repositories/1/pulls?state=open&per_page=100&page=2`;
    const { fetch, calls } = fakeFetch({
      [pullsUrl]: { status: 200, body: [pull(3), pull(2, { draft: true, head: { ref: "fix", label: "bo:fix", repo: { full_name: "bo/legend-apps" } } })], headers: { Link: `<${page2}>; rel="next", <${page2}>; rel="last"` } },
      [page2]: { status: 200, body: [pull(1, { user: null })] },
    });
    const pulls = await createGitHubClient({ token, fetch }).pullRequests(repo);
    expect(pulls.map(entry => [entry.number, entry.author, entry.head, entry.draft])).toEqual([[3, "ana", "feature", false], [2, "ana", "bo:fix", true], [1, "ghost", "feature", false]]);
    expect(calls).toHaveLength(2);
    expect(calls[0]!.headers).toMatchObject({ Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json", "Cache-Control": "no-cache" });
  });

  it("stops after maxPages", async () => {
    const { fetch } = fakeFetch({ [pullsUrl]: { status: 200, body: [pull(1)], headers: { Link: `<${pullsUrl}>; rel="next"` } } });
    expect(await createGitHubClient({ token, fetch, maxPages: 3 }).pullRequests(repo)).toHaveLength(3);
    expect(fetch).toHaveBeenCalledTimes(3);
  });

  it("sends the ETag back and keeps the list on 304", async () => {
    const { fetch, calls } = fakeFetch({ [pullsUrl]: headers => headers["If-None-Match"] === "\"v1\"" ? { status: 304 } : { status: 200, body: [pull(7)], headers: { ETag: "\"v1\"" } } });
    const client = createGitHubClient({ token, fetch });
    const first = await client.pullRequests(repo);
    const second = await client.pullRequests(repo);
    expect(calls[0]!.headers["If-None-Match"]).toBeUndefined();
    expect(calls[1]!.headers["If-None-Match"]).toBe("\"v1\"");
    expect(second).toEqual(first);
    expect(second[0]!.number).toBe(7);
  });

  it("reports 401, rate limits, 404 and network failures with GitHub's message and never the token", async () => {
    const cases: [Reply | null, GitHubError["kind"], RegExp][] = [
      [{ status: 401, body: { message: "Bad credentials" } }, "unauthorized", /didn’t accept the token: Bad credentials\.$/],
      [{ status: 403, body: { message: "API rate limit exceeded for user" }, headers: { "x-ratelimit-remaining": "0", "x-ratelimit-reset": "1800000000" } }, "rate-limit", /rate limit is used up\. It resets at .*API rate limit exceeded/],
      [{ status: 404, body: { message: "Not Found" } }, "not-found", /couldn’t find the repository/],
      [{ status: 500, body: { message: `echo ${token}` } }, "other", /answered 500: echo •••/],
      [null, "network", /Couldn’t reach GitHub: Network request failed .* Bearer •••/],
    ];
    for (const [reply, kind, message] of cases) {
      const { fetch } = fakeFetch(reply ? { [`${api}/user`]: reply } : {});
      const error = await createGitHubClient({ token, fetch }).user().catch((failure: unknown) => failure) as GitHubError;
      expect(error).toBeInstanceOf(GitHubError);
      expect(error.kind).toBe(kind);
      expect(error.message).toMatch(message);
      expect(`${error.message} ${error.stack} ${JSON.stringify(error)}`).not.toContain(token);
    }
  });

  it("reads a pull request's files and turns GitHub's hunks into git patches", async () => {
    const url = `${api}/repos/LegendApp/legend-apps/pulls/7/files?per_page=100`;
    const { fetch } = fakeFetch({ [url]: { status: 200, body: [
      { filename: "src/a.ts", status: "modified", additions: 1, deletions: 1, patch: "@@ -1 +1 @@\n-old\n+new" },
      { filename: "img.png", status: "added", additions: 0, deletions: 0 },
      { filename: "b.ts", previous_filename: "a.ts", status: "renamed", additions: 0, deletions: 0, patch: "@@ -1 +1 @@\n-x\n+y\n" },
    ] } });
    const files = await createGitHubClient({ token, fetch }).pullRequestFiles(repo, 7);
    expect(files.map(file => [file.path, file.previousPath, file.patch === null])).toEqual([["src/a.ts", null, false], ["img.png", null, true], ["b.ts", "a.ts", false]]);
    expect(pullFilePatch(files[0]!)).toBe("diff --git a/src/a.ts b/src/a.ts\n--- a/src/a.ts\n+++ b/src/a.ts\n@@ -1 +1 @@\n-old\n+new\n");
    expect(pullFilePatch(files[1]!)).toBeNull();
    expect(pullFilePatch(files[2]!)).toContain("rename from a.ts\nrename to b.ts\n--- a/a.ts\n+++ b/b.ts\n");
    expect(pullFilePatch({ ...files[0]!, status: "added" })).toContain("new file mode 100644\n--- /dev/null\n+++ b/src/a.ts");
  });
});
