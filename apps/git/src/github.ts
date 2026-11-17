/** A repository on github.com (git-core's `githubRepository` reads one from a remote URL). */
export type GitHubRepo = { owner: string; name: string };

export const gitHubApiUrl = "https://api.github.com";

/**
 * Only a loopback URL may replace api.github.com (a local fake API for testing, from `git config legendgit.githubApiUrl`),
 * so a repository's config can never send the token to another host.
 */
export function apiUrlOverride(value: string | null | undefined) {
  const url = value?.trim().replace(/\/+$/, "");
  return url && /^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d+)?(?:\/[\w./-]*)?$/.test(url) ? url : null;
}

export type GitHubErrorKind = "network" | "unauthorized" | "rate-limit" | "not-found" | "other";

/** A failed GitHub request; the message is GitHub's own (or the network's) and never holds the token. */
export class GitHubError extends Error {
  constructor(readonly kind: GitHubErrorKind, message: string, readonly status: number | null = null) {
    super(message);
    this.name = "GitHubError";
  }
}

export type GitHubUser = { login: string; name: string | null };
export type GitHubPullRequest = {
  number: number;
  title: string;
  author: string;
  state: "open" | "closed";
  draft: boolean;
  merged: boolean;
  /** Base branch name; head as GitHub labels it ("owner:branch" from a fork, else the branch). */
  base: string;
  head: string;
  url: string;
};
export type GitHubPullFile = { path: string; previousPath: string | null; status: string; additions: number; deletions: number; patch: string | null };

type Fetch = (url: string, init: { method?: string; headers: Record<string, string> }) => Promise<{ status: number; headers: { get(name: string): string | null }; json(): Promise<unknown>; text(): Promise<string> }>;

const nextLink = (link: string | null) => link?.split(",").map(part => part.match(/<([^>]+)>\s*;\s*rel="next"/)?.[1]).find(Boolean) ?? null;
const scrub = (text: string, token: string) => token ? text.split(token).join("•••") : text;

/** GitHub's error message for a response, with the rate limit's reset time when it is used up. */
async function responseError(response: Awaited<ReturnType<Fetch>>, token: string) {
  const body = await response.text().catch(() => "");
  let message = "";
  try { message = (JSON.parse(body) as { message?: string }).message ?? ""; } catch { message = body.slice(0, 200); }
  message = scrub(message.trim(), token);
  const status = response.status;
  if (status === 401) return new GitHubError("unauthorized", `GitHub didn’t accept the token${message ? `: ${message}` : ""}.`, status);
  const reset = Number(response.headers.get("x-ratelimit-reset"));
  if ((status === 403 || status === 429) && (response.headers.get("x-ratelimit-remaining") === "0" || /rate limit/i.test(message))) {
    const at = reset ? ` It resets at ${new Date(reset * 1000).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}.` : "";
    return new GitHubError("rate-limit", `GitHub’s API rate limit is used up.${at}${message ? ` (${message})` : ""}`, status);
  }
  if (status === 404) return new GitHubError("not-found", `GitHub couldn’t find the repository, or the token can’t read it${message ? `: ${message}` : ""}.`, status);
  return new GitHubError("other", `GitHub answered ${status}${message ? `: ${message}` : ""}.`, status);
}

type Cached = { etag: string; data: unknown; next: string | null };

/**
 * GitHub's REST API with one token. GETs send If-None-Match with the ETag of the last answer for the same URL, so an
 * unchanged page is a 304 (which doesn't count against the rate limit) and its cached data is used.
 */
export function createGitHubClient({ token, apiUrl = gitHubApiUrl, fetch: request = globalThis.fetch as unknown as Fetch, maxPages = 10 }: { token: string; apiUrl?: string; fetch?: Fetch; maxPages?: number }) {
  const cache = new Map<string, Cached>();

  async function get(url: string): Promise<{ data: unknown; next: string | null }> {
    const cached = cache.get(url);
    // no-cache: the system URL cache would otherwise answer from its copy for GitHub's max-age=60 without asking.
    const headers: Record<string, string> = { Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", Authorization: `Bearer ${token}`, "Cache-Control": "no-cache" };
    if (cached) headers["If-None-Match"] = cached.etag;
    let response: Awaited<ReturnType<Fetch>>;
    try { response = await request(url, { method: "GET", headers }); } catch (error) {
      throw new GitHubError("network", `Couldn’t reach GitHub: ${scrub(error instanceof Error ? error.message : String(error), token).replace(/[^.]$/, "$&.")}`);
    }
    if (response.status === 304 && cached) return cached;
    if (response.status < 200 || response.status >= 300) throw await responseError(response, token);
    const data = await response.json();
    const next = nextLink(response.headers.get("link"));
    const etag = response.headers.get("etag");
    cache.delete(url);
    if (etag) cache.set(url, { etag, data, next });
    // Oldest first: a long session opening many PRs keeps only the last 200 pages.
    if (cache.size > 200) cache.delete(cache.keys().next().value!);
    return { data, next };
  }

  /** Every page of a list (`per_page=100`), following `Link: rel="next"` up to `maxPages`. */
  async function list<T>(path: string): Promise<T[]> {
    const items: T[] = [];
    let url: string | null = `${apiUrl}${path}${path.includes("?") ? "&" : "?"}per_page=100`;
    for (let page = 0; url && page < maxPages; page += 1) {
      const result: { data: unknown; next: string | null } = await get(url);
      items.push(...result.data as T[]);
      url = result.next;
    }
    return items;
  }

  const repoPath = (repo: GitHubRepo) => `/repos/${encodeURIComponent(repo.owner)}/${encodeURIComponent(repo.name)}`;
  type RawPull = { number: number; title: string; user: { login: string } | null; state: "open" | "closed"; draft?: boolean; merged_at?: string | null; base: { ref: string }; head: { ref: string; label: string; repo: { full_name: string } | null }; html_url: string };
  type RawFile = { filename: string; previous_filename?: string; status: string; additions: number; deletions: number; patch?: string };

  return {
    async user(): Promise<GitHubUser> {
      const { data } = await get(`${apiUrl}/user`);
      const user = data as { login: string; name?: string | null };
      return { login: user.login, name: user.name ?? null };
    },
    async pullRequests(repo: GitHubRepo): Promise<GitHubPullRequest[]> {
      const pulls = await list<RawPull>(`${repoPath(repo)}/pulls?state=open`);
      const ownRepo = `${repo.owner}/${repo.name}`.toLowerCase();
      return pulls.map(pull => ({
        number: pull.number, title: pull.title, author: pull.user?.login ?? "ghost", state: pull.state, draft: !!pull.draft, merged: !!pull.merged_at,
        base: pull.base.ref, head: pull.head.repo?.full_name.toLowerCase() === ownRepo ? pull.head.ref : pull.head.label, url: pull.html_url,
      }));
    },
    async pullRequestFiles(repo: GitHubRepo, number: number): Promise<GitHubPullFile[]> {
      const files = await list<RawFile>(`${repoPath(repo)}/pulls/${number}/files`);
      return files.map(file => ({ path: file.filename, previousPath: file.previous_filename ?? null, status: file.status, additions: file.additions, deletions: file.deletions, patch: file.patch ?? null }));
    },
  };
}
export type GitHubClient = ReturnType<typeof createGitHubClient>;

/** A git-style patch for one PR file, from GitHub's hunks (`patch`), so DiffPane can parse it; null when GitHub sent no hunks (binary or too large). */
export function pullFilePatch(file: GitHubPullFile) {
  if (!file.patch) return null;
  const oldPath = file.previousPath ?? file.path;
  const from = file.status === "added" ? "/dev/null" : `a/${oldPath}`;
  const to = file.status === "removed" ? "/dev/null" : `b/${file.path}`;
  const mode = file.status === "added" ? "new file mode 100644\n" : file.status === "removed" ? "deleted file mode 100644\n" : "";
  const rename = file.previousPath && file.previousPath !== file.path ? `rename from ${file.previousPath}\nrename to ${file.path}\n` : "";
  return `diff --git a/${oldPath} b/${file.path}\n${mode}${rename}--- ${from}\n+++ ${to}\n${file.patch.endsWith("\n") ? file.patch : `${file.patch}\n`}`;
}
