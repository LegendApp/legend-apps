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
  /** The head commit, which new review comments are made on. */
  headSha: string;
  url: string;
};
export type GitHubPullFile = { path: string; previousPath: string | null; status: string; additions: number; deletions: number; patch: string | null };

export type ReviewSide = "LEFT" | "RIGHT";
export type ReviewComment = { id: string; databaseId: number; author: string; body: string; createdAt: string };
/** A review thread: `line`/`side` (and `startLine`/`startSide` for a range) on the PR's current diff; `line` is null when outdated or on the whole file. */
export type ReviewThread = {
  id: string; path: string; line: number | null; originalLine: number | null; startLine: number | null; side: ReviewSide; startSide: ReviewSide | null;
  resolved: boolean; outdated: boolean; comments: ReviewComment[];
};
export type ReviewEvent = "APPROVE" | "REQUEST_CHANGES" | "COMMENT";
export type ReviewState = "APPROVED" | "CHANGES_REQUESTED" | "COMMENTED" | "DISMISSED" | "PENDING";
/** A submitted review, oldest first as GitHub lists them. */
export type GitHubReview = { id: number; author: string; state: ReviewState; submittedAt: string | null };
/** Approve may go without a summary; Comment and Request Changes need one. */
export const canSubmitReview = (event: ReviewEvent, body: string) => !!body.trim() || event === "APPROVE";
/** A new line comment: `line`/`side` end it, `startLine`/`startSide` start a range. */
export type NewReviewComment = { commitId: string; path: string; line: number; side: ReviewSide; startLine?: number; startSide?: ReviewSide; body: string };

type Fetch = (url: string, init: { method?: string; headers: Record<string, string>; body?: string }) => Promise<{ status: number; headers: { get(name: string): string | null }; json(): Promise<unknown>; text(): Promise<string> }>;

const nextLink = (link: string | null) => link?.split(",").map(part => part.match(/<([^>]+)>\s*;\s*rel="next"/)?.[1]).find(Boolean) ?? null;
const scrub = (text: string, token: string) => token ? text.split(token).join("•••") : text;

/** GitHub's error message for a response, with the rate limit's reset time when it is used up. */
async function responseError(response: Awaited<ReturnType<Fetch>>, token: string) {
  const body = await response.text().catch(() => "");
  let message = "";
  try {
    const parsed = JSON.parse(body) as { message?: string; errors?: (string | { message?: string; field?: string; code?: string })[] };
    // 422 Validation Failed names what failed in `errors`.
    const details = (parsed.errors ?? []).map(error => typeof error === "string" ? error : error.message ?? [error.field, error.code].filter(Boolean).join(" ")).filter(Boolean);
    message = [parsed.message ?? "", ...details].filter(Boolean).join(": ");
  } catch { message = body.slice(0, 200); }
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

  const headersFor = () => ({ Accept: "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28", Authorization: `Bearer ${token}`, "Cache-Control": "no-cache" } as Record<string, string>);
  async function send(url: string, init: { method: string; headers: Record<string, string>; body?: string }) {
    try { return await request(url, init); } catch (error) {
      throw new GitHubError("network", `Couldn’t reach GitHub: ${scrub(error instanceof Error ? error.message : String(error), token).replace(/[^.]$/, "$&.")}`);
    }
  }
  /** A JSON POST (REST or GraphQL); non-2xx answers become GitHubErrors with GitHub's message. */
  async function post(url: string, body: unknown): Promise<unknown> {
    const response = await send(url, { method: "POST", headers: { ...headersFor(), "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (response.status < 200 || response.status >= 300) throw await responseError(response, token);
    return response.json();
  }
  /** GraphQL answers 200 with `errors` for a query that fails; the first error's message is GitHub's. */
  async function graphql<T>(query: string, variables: Record<string, unknown>): Promise<T> {
    const result = await post(`${apiUrl}/graphql`, { query, variables }) as { data?: T; errors?: { type?: string; message: string }[] };
    const error = result.errors?.[0];
    if (error) throw new GitHubError(error.type === "NOT_FOUND" ? "not-found" : "other", `GitHub answered: ${scrub(error.message, token)}`);
    return result.data as T;
  }

  async function get(url: string): Promise<{ data: unknown; next: string | null }> {
    const cached = cache.get(url);
    // no-cache: the system URL cache would otherwise answer from its copy for GitHub's max-age=60 without asking.
    const headers = headersFor();
    if (cached) headers["If-None-Match"] = cached.etag;
    const response = await send(url, { method: "GET", headers });
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
  type RawPull = { number: number; title: string; user: { login: string } | null; state: "open" | "closed"; draft?: boolean; merged_at?: string | null; base: { ref: string }; head: { ref: string; sha: string; label: string; repo: { full_name: string } | null }; html_url: string };
  type RawReview = { id: number; user: { login: string } | null; state: ReviewState; submitted_at?: string | null };
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
        base: pull.base.ref, head: pull.head.repo?.full_name.toLowerCase() === ownRepo ? pull.head.ref : pull.head.label, headSha: pull.head.sha, url: pull.html_url,
      }));
    },
    async pullRequestFiles(repo: GitHubRepo, number: number): Promise<GitHubPullFile[]> {
      const files = await list<RawFile>(`${repoPath(repo)}/pulls/${number}/files`);
      return files.map(file => ({ path: file.filename, previousPath: file.previous_filename ?? null, status: file.status, additions: file.additions, deletions: file.deletions, patch: file.patch ?? null }));
    },
    /**
     * Every review thread of a pull request with all its comments (GraphQL, 100 a page, up to `maxPages` pages each),
     * and its head commit as of this read, which new comments must be made on.
     */
    async reviewThreads(repo: GitHubRepo, number: number): Promise<{ headSha: string; threads: ReviewThread[] }> {
      const threads: ReviewThread[] = [];
      let headSha = "";
      let after: string | null = null;
      for (let page = 0; page < maxPages; page += 1) {
        const data: ThreadsData = await graphql<ThreadsData>(threadsQuery, { owner: repo.owner, name: repo.name, number, after });
        const connection = data.repository?.pullRequest?.reviewThreads;
        if (!connection) throw new GitHubError("not-found", `GitHub couldn’t find pull request #${number}.`);
        headSha ||= data.repository!.pullRequest!.headRefOid;
        for (const node of connection.nodes) {
          const comments = node.comments.nodes.slice();
          let more = node.comments.pageInfo;
          for (let commentPage = 1; more.hasNextPage && commentPage < maxPages; commentPage += 1) {
            const next: CommentsData = await graphql<CommentsData>(commentsQuery, { id: node.id, after: more.endCursor });
            if (!next.node) break;
            comments.push(...next.node.comments.nodes);
            more = next.node.comments.pageInfo;
          }
          threads.push({
            id: node.id, path: node.path, line: node.line, originalLine: node.originalLine, startLine: node.startLine, side: node.diffSide, startSide: node.startDiffSide,
            resolved: node.isResolved, outdated: node.isOutdated,
            comments: comments.map(comment => ({ id: comment.id, databaseId: comment.databaseId, author: comment.author?.login ?? "ghost", body: comment.body, createdAt: comment.createdAt })),
          });
        }
        if (!connection.pageInfo.hasNextPage) break;
        after = connection.pageInfo.endCursor;
      }
      return { headSha, threads };
    },
    /** Every submitted review of a pull request (REST, paged), oldest first. */
    async reviews(repo: GitHubRepo, number: number): Promise<GitHubReview[]> {
      const reviews = await list<RawReview>(`${repoPath(repo)}/pulls/${number}/reviews`);
      return reviews.map(review => ({ id: review.id, author: review.user?.login ?? "ghost", state: review.state, submittedAt: review.submitted_at ?? null }));
    },
    /**
     * POST /pulls/{n}/reviews: approves, requests changes or comments on the pull request at `commitId`. Request Changes
     * and Comment need a summary; GitHub refuses (422) to approve or request changes on your own pull request.
     */
    async submitReview(repo: GitHubRepo, number: number, review: { commitId: string; event: ReviewEvent; body: string }) {
      const body = review.body.trim();
      if (!canSubmitReview(review.event, body)) throw new Error(review.event === "COMMENT" ? "Write a comment to submit." : "Say what needs to change.");
      await post(`${apiUrl}${repoPath(repo)}/pulls/${number}/reviews`, { commit_id: review.commitId, event: review.event, ...body ? { body } : {} });
    },
    /** POST /pulls/{n}/comments: a new thread on a line or a range of the diff at `commitId`. */
    async addReviewComment(repo: GitHubRepo, number: number, comment: NewReviewComment) {
      const body: Record<string, unknown> = { body: comment.body, commit_id: comment.commitId, path: comment.path, line: comment.line, side: comment.side };
      const startSide = comment.startSide ?? comment.side;
      if (comment.startLine !== undefined && (comment.startLine !== comment.line || startSide !== comment.side)) { body.start_line = comment.startLine; body.start_side = startSide; }
      await post(`${apiUrl}${repoPath(repo)}/pulls/${number}/comments`, body);
    },
    /** POST /pulls/{n}/comments/{id}/replies: a reply to a thread's first comment. */
    async replyToReviewComment(repo: GitHubRepo, number: number, commentId: number, body: string) {
      await post(`${apiUrl}${repoPath(repo)}/pulls/${number}/comments/${commentId}/replies`, { body });
    },
  };
}

type PageInfo = { hasNextPage: boolean; endCursor: string | null };
type RawComment = { id: string; databaseId: number; author: { login: string } | null; body: string; createdAt: string };
type RawThread = {
  id: string; path: string; line: number | null; originalLine: number | null; startLine: number | null; diffSide: ReviewSide; startDiffSide: ReviewSide | null;
  isResolved: boolean; isOutdated: boolean; comments: { nodes: RawComment[]; pageInfo: PageInfo };
};
type ThreadsData = { repository: { pullRequest: { headRefOid: string; reviewThreads: { nodes: RawThread[]; pageInfo: PageInfo } } | null } | null };
type CommentsData = { node: { comments: { nodes: RawComment[]; pageInfo: PageInfo } } | null };
const commentFields = "nodes { id databaseId author { login } body createdAt } pageInfo { hasNextPage endCursor }";
const threadsQuery = `query($owner: String!, $name: String!, $number: Int!, $after: String) { repository(owner: $owner, name: $name) { pullRequest(number: $number) { headRefOid
  reviewThreads(first: 100, after: $after) { nodes { id path line originalLine startLine diffSide startDiffSide isResolved isOutdated comments(first: 100) { ${commentFields} } } pageInfo { hasNextPage endCursor } } } } }`;
const commentsQuery = `query($id: ID!, $after: String) { node(id: $id) { ... on PullRequestReviewThread { comments(first: 100, after: $after) { ${commentFields} } } } }`;
export type GitHubClient = ReturnType<typeof createGitHubClient>;

const reviewWords: Partial<Record<ReviewState, string>> = { APPROVED: "approved", CHANGES_REQUESTED: "requested changes", COMMENTED: "commented" };

/**
 * Where each reviewer stands, in the order they first reviewed: their latest approval or change request (a later
 * comment doesn't change it); a dismissed one drops them; someone who only commented (or commented after a dismissal) "commented". Pending reviews are
 * the author's drafts and don't count.
 */
export function reviewSummary(reviews: readonly GitHubReview[]) {
  const latest = new Map<string, ReviewState>();
  for (const review of reviews) {
    const current = latest.get(review.author);
    if (review.state === "PENDING" || (review.state === "COMMENTED" && current && current !== "DISMISSED")) continue;
    latest.set(review.author, review.state);
  }
  return [...latest].filter(([, state]) => state !== "DISMISSED").map(([author, state]) => ({ author, state, text: `${author} ${reviewWords[state]}` }));
}

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
