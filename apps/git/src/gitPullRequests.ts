import { getGitService, githubRepository, type GitBranch, type GitRefList, type GitService } from "@legend-apps/git-core";
import { findUnifiedPatchFile, parseUnifiedPatch, type UnifiedPatchFile } from "@legend-apps/diff-parser/src/unifiedPatch";
import { apiUrlOverride, createGitHubClient, gitHubApiUrl, GitHubError, pullFilePatch, type GitHubClient, type GitHubPullFile, type GitHubPullRequest, type GitHubRepo, type GitHubReview, type MergedPullRequest, type NewPullRequest, type NewReviewComment, type ReviewEvent, type ReviewThread } from "./github";

/** `text` is null when GitHub sent no hunks (binary or too large); `error` when its hunks don't parse. */
export type PullFile = GitHubPullFile & { text: string | null; file: UnifiedPatchFile | null; error: string | null };
export type PullRequestsState = {
  root: string | null;
  /** The github.com repository whose pull requests are listed (the `upstream` remote's, else `origin`'s); null for other hosts. */
  repo: GitHubRepo | null;
  /** The remote `repo` was read from ("upstream" or "origin"), which pull requests are fetched from. */
  remote: string | null;
  /** Open pull requests, newest first; null until read (or when signed out). */
  pulls: GitHubPullRequest[] | null;
  loading: boolean;
  error: { kind: GitHubError["kind"]; message: string } | null;
  /** The selected pull request's files; null until read. */
  number: number | null;
  files: PullFile[] | null;
  filesLoading: boolean;
  filesError: string | null;
  selectedPath: string | null;
  /** The selected pull request's review threads; null until read. */
  threads: ReviewThread[] | null;
  /** Its head commit as of the thread read (newer than the list's when someone pushed since). */
  headSha: string | null;
  threadsError: { kind: GitHubError["kind"]; message: string } | null;
  /** The selected pull request's submitted reviews, oldest first; null until read. */
  reviews: GitHubReview[] | null;
  reviewsError: { kind: GitHubError["kind"]; message: string } | null;
  /** A comment, reply, review or pull request is being posted. */
  writing: boolean;
  /**
   * Local branches whose pull request was merged on GitHub (squash and rebase merges included), by branch name, with
   * the tip that was checked: a branch whose tip has moved since isn't merged as far as anyone knows.
   */
  merged: Record<string, { number: number; oid: string }>;
};
const noSelection = { number: null, files: null, filesLoading: false, filesError: null, selectedPath: null, threads: null, headSha: null, threadsError: null, reviews: null, reviewsError: null };
export const emptyPullRequests: PullRequestsState = { root: null, repo: null, remote: null, pulls: null, loading: false, error: null, ...noSelection, writing: false, merged: {} };

/** One file's patch parsed on its own, so a malformed one doesn't hide the others. */
function pullFile(file: GitHubPullFile): PullFile {
  const text = pullFilePatch(file);
  try {
    return { ...file, text, file: text ? findUnifiedPatchFile(parseUnifiedPatch(text), file.path) ?? null : null, error: null };
  } catch (error) {
    return { ...file, text: null, file: null, error: error instanceof Error ? error.message : String(error) };
  }
}

const errorOf = (error: unknown) => error instanceof GitHubError ? { kind: error.kind, message: error.message } : { kind: "other" as const, message: error instanceof Error ? error.message : String(error) };

/** The local branch a pull request is checked out as: its head branch, prefixed with the fork's owner ("bo/fix") when it comes from a fork. */
export const pullRequestBranch = (pull: Pick<GitHubPullRequest, "head">) => pull.head.replace(":", "/");

/** The remote and branch an upstream ("origin/feature") names; the longest remote name that prefixes it wins. */
export function upstreamParts(refs: GitRefList, upstream: string) {
  const remote = refs.remotes.map(entry => entry.name).sort((a, b) => b.length - a.length).find(name => upstream.startsWith(`${name}/`));
  return remote ? { remote, branch: upstream.slice(remote.length + 1) } : null;
}

/**
 * Where a local branch was pushed as itself: its upstream's remote and branch when the upstream is live and has the same
 * name. A branch tracking another name (made from "origin/main") or a gone one has to be published first.
 */
export function pushedAs(refs: GitRefList, branch: Pick<GitBranch, "name" | "upstream" | "gone">) {
  const tracked = branch.upstream && !branch.gone ? upstreamParts(refs, branch.upstream) : null;
  return tracked?.branch === branch.name ? tracked : null;
}

/** A new pull request's `head`: the branch, or "owner:branch" when it lives in another repository than the pull request's (a fork). */
export function pullRequestHead(repo: GitHubRepo, headRepo: GitHubRepo | null, branch: string) {
  const same = !headRepo || `${headRepo.owner}/${headRepo.name}`.toLowerCase() === `${repo.owner}/${repo.name}`.toLowerCase();
  return same ? branch : `${headRepo.owner}:${branch}`;
}

/** A new pull request's title: its only commit's summary, else the branch name. */
export const pullRequestTitle = (branch: string, summaries: readonly string[]) => summaries.length === 1 && summaries[0]!.trim() ? summaries[0]!.trim() : branch;

/** The branches a pull request can merge into (the remote's, as last fetched) and the one to preselect: the remote's HEAD, else main or master. */
export function pullRequestBases(refs: GitRefList | null, remote: string | null) {
  const names = refs?.remotes.find(entry => entry.name === remote)?.branches.map(branch => branch.branch).filter(name => name !== "HEAD") ?? [];
  const head = refs?.defaultBranch?.startsWith(`refs/remotes/${remote}/`) ? refs.defaultBranch.slice(14 + remote!.length) : null;
  const preferred = [head, "main", "master"].find(name => name && names.includes(name)) ?? names[0] ?? "main";
  return { bases: names.length ? names : [preferred], base: preferred };
}

/**
 * Which local branches a merged pull request covers: the PR's head branch (by name, on the account the branch's
 * upstream remote belongs to; without an upstream, origin's or the PR repository's owner, or "owner/branch" as Check
 * Out as Branch names fork branches), and only when the branch's tip is the PR's last head commit or an ancestor of
 * it, so a branch with newer local commits isn't called merged. Most recently updated PRs win. The default branch is left out.
 */
export async function mergedBranches(git: Pick<GitService, "listRefs" | "remoteUrl" | "mergeBase">, repo: GitHubRepo, pulls: readonly MergedPullRequest[]) {
  const marks: PullRequestsState["merged"] = {};
  if (!pulls.length) return marks;
  const refs = await git.listRefs();
  const byRef = new Map<string, MergedPullRequest[]>();
  for (const pull of pulls) byRef.set(pull.headRef, [...byRef.get(pull.headRef) ?? [], pull]);
  const owners = new Map<string, Promise<string | null>>();
  const ownerOf = (remote: string) => {
    if (!owners.has(remote)) owners.set(remote, git.remoteUrl(remote).then(url => githubRepository(url)?.owner.toLowerCase() ?? null, () => null));
    return owners.get(remote)!;
  };
  const defaultName = refs.defaultBranch?.startsWith("refs/heads/") ? refs.defaultBranch.slice(11) : refs.defaultBranch ? upstreamParts(refs, refs.defaultBranch.slice(13))?.branch : undefined;
  for (const branch of refs.branches) {
    if (branch.ref === refs.defaultBranch || branch.name === defaultName) continue;
    // A gone upstream still names where the branch was pushed (GitHub deletes merged branches); another name doesn't.
    const upstream = pushedAs(refs, { ...branch, gone: false });
    const candidates: { ref: string; owners: (string | null)[] }[] = upstream ? [{ ref: upstream.branch, owners: [await ownerOf(upstream.remote)] }]
      : [{ ref: branch.name, owners: [await ownerOf("origin"), repo.owner.toLowerCase()] }, ...branch.name.includes("/") ? [{ ref: branch.name.slice(branch.name.indexOf("/") + 1), owners: [branch.name.slice(0, branch.name.indexOf("/")).toLowerCase()] }] : []];
    search: for (const candidate of candidates) {
      for (const pull of byRef.get(candidate.ref) ?? []) {
        if (!pull.headOwner || !candidate.owners.includes(pull.headOwner.toLowerCase())) continue;
        // The PR's head may not be here (pushed from elsewhere); then nothing says the branch was merged.
        if (branch.oid === pull.headSha || await git.mergeBase(branch.oid, pull.headSha).then(base => base === branch.oid, () => false)) {
          marks[branch.name] = { number: pull.number, oid: branch.oid };
          break search;
        }
      }
    }
  }
  return marks;
}

/**
 * The open pull requests of one repository's GitHub remote, read with the signed-in account's token. Reads happen on
 * `refresh` (⌘R, window focus) and selection only, never on a timer; unchanged pages come back as 304s from the
 * client's ETag cache. A newer read, root or token wins over an older one; signing out clears the list.
 */
export function createPullRequests(onChange: (state: PullRequestsState) => void, {
  serviceFor = getGitService, clientFor = (token: string, apiUrl: string) => createGitHubClient({ token, apiUrl }), now = () => Date.now(),
}: { now?: () => number; serviceFor?: (path: string) => GitService; clientFor?: (token: string, apiUrl: string) => Pick<GitHubClient, "pullRequests" | "pullRequestFiles" | "reviewThreads" | "reviews" | "addReviewComment" | "replyToReviewComment" | "submitReview" | "createPullRequest" | "mergedPullRequests"> } = {}) {
  let state = emptyPullRequests;
  let closed = false;
  let token: string | null = null;
  let apiUrl = gitHubApiUrl;
  let client: ReturnType<typeof clientFor> | null = null;
  let listRead = 0, filesRead = 0, rootRead = 0, threadsRead = 0, reviewsRead = 0, mergedRead = 0;
  // When merged pull requests were last read (GraphQL has no 304s), so focusing the window doesn't read them every time.
  let mergedAt = 0;
  // Not state: a repository switch resets the published `writing` while a POST is still out.
  let writing = false;
  const publish = (patch: Partial<PullRequestsState>) => { state = { ...state, ...patch }; if (!closed) onChange(state); };
  const makeClient = () => { client = token && state.repo ? clientFor(token, apiUrl) : null; };

  /** Reads the threads on their own, so a failed GraphQL read still shows the files. */
  async function readThreads(number: number) {
    const repo = state.repo, owner = client, read = ++threadsRead;
    if (!repo || !owner) return;
    try {
      const { threads, headSha } = await owner.reviewThreads(repo, number);
      if (read === threadsRead && !closed) publish({ threads, headSha: headSha || null, threadsError: null });
    } catch (error) {
      if (read === threadsRead && !closed) publish({ threadsError: errorOf(error) });
    }
  }

  /** Each reviewer's latest review, for the header; read with the files. */
  async function readReviews(number: number) {
    const repo = state.repo, owner = client, read = ++reviewsRead;
    if (!repo || !owner) return;
    try {
      const reviews = await owner.reviews(repo, number);
      if (read === reviewsRead && !closed) publish({ reviews, reviewsError: null });
    } catch (error) {
      if (read === reviewsRead && !closed) publish({ reviewsError: errorOf(error) });
    }
  }

  async function readFiles(number: number, keepSelection: boolean) {
    const repo = state.repo, owner = client, read = ++filesRead;
    if (!repo || !owner) return;
    publish(keepSelection ? { filesLoading: true } : { ...noSelection, number, filesLoading: true });
    void readThreads(number);
    void readReviews(number);
    try {
      const files = (await owner.pullRequestFiles(repo, number)).map(pullFile);
      if (read !== filesRead || closed) return;
      const selectedPath = keepSelection && files.some(file => file.path === state.selectedPath) ? state.selectedPath : files[0]?.path ?? null;
      publish({ files, filesLoading: false, filesError: null, selectedPath });
    } catch (error) {
      if (read === filesRead) publish({ filesLoading: false, filesError: errorOf(error).message });
    }
  }

  async function write(number: number, post: (owner: NonNullable<typeof client>, repo: GitHubRepo) => Promise<void>) {
    const repo = state.repo, owner = client;
    if (!repo || !owner || writing) return;
    writing = true;
    publish({ writing: true });
    try { await post(owner, repo); }
    finally {
      writing = false;
      if (!closed) publish({ writing: false });
      if (client === owner && state.number === number) await Promise.all([readThreads(number), readReviews(number)]);
    }
  }

  /** Marks local branches whose pull request was merged; a failed read leaves the marks as they were. */
  async function readMerged() {
    const repo = state.repo, owner = client, root = state.root, read = ++mergedRead;
    if (!repo || !owner || !root) return;
    mergedAt = now();
    try {
      const merged = await mergedBranches(serviceFor(root), repo, await owner.mergedPullRequests(repo));
      if (read === mergedRead && !closed) publish({ merged });
    } catch (error) { if (!(error instanceof GitHubError)) console.error(error); }
  }

  /** Reads the list (and merged pull requests; on focus only once a minute). */
  async function refresh({ focus = false }: { focus?: boolean } = {}) {
    const repo = state.repo, owner = client, read = ++listRead;
    if (!repo || !owner || closed) return;
    publish({ loading: true });
    if (!focus || now() - mergedAt >= 60_000) void readMerged();
    try {
      const pulls = await owner.pullRequests(repo);
      if (read !== listRead || closed) return;
      const number = state.number !== null && pulls.some(pull => pull.number === state.number) ? state.number : null;
      publish({ pulls, loading: false, error: null, ...number === null ? noSelection : {} });
      if (number !== null) await readFiles(number, true);
    } catch (error) {
      if (read === listRead && !closed) publish({ loading: false, error: errorOf(error) });
    }
  }

  return {
    /** Reads the repository's GitHub remote (and the loopback API override, for tests), then its pull requests. */
    async setRoot(root: string | null) {
      const read = ++rootRead;
      listRead += 1; filesRead += 1; threadsRead += 1; reviewsRead += 1; mergedRead += 1; mergedAt = 0;
      client = null;
      apiUrl = gitHubApiUrl;
      publish({ ...emptyPullRequests, root });
      if (!root) return;
      const git = serviceFor(root);
      try {
        const [upstream, origin, override] = await Promise.all([git.remoteUrl("upstream"), git.remoteUrl("origin"), git.configValue("legendgit.githubApiUrl")]);
        if (read !== rootRead || closed) return;
        apiUrl = apiUrlOverride(override) ?? gitHubApiUrl;
        const fromUpstream = githubRepository(upstream);
        publish({ repo: fromUpstream ?? githubRepository(origin), remote: fromUpstream ? "upstream" : githubRepository(origin) ? "origin" : null });
        makeClient();
        await refresh();
      } catch (error) { console.error(error); }
    },
    /** The signed-in account's token; null (signed out) clears the list. */
    setToken(next: string | null) {
      if (next === token) return;
      token = next;
      listRead += 1; filesRead += 1; threadsRead += 1; reviewsRead += 1; mergedRead += 1; mergedAt = 0;
      makeClient();
      publish({ pulls: null, loading: false, error: null, ...noSelection, merged: {} });
      void refresh();
    },
    refresh,
    /** The API sign-in checks tokens against: api.github.com, or the repository's loopback override. */
    apiUrl: () => apiUrl,
    select(number: number | null) {
      if (number === state.number) return;
      filesRead += 1; threadsRead += 1; reviewsRead += 1;
      if (number === null || !state.pulls?.some(pull => pull.number === number)) { publish(noSelection); return; }
      void readFiles(number, false);
    },
    selectFile(path: string) { if (state.files?.some(file => file.path === path)) publish({ selectedPath: path }); },
    /** Comments on the selected file's lines at the pull request's head commit, then reads the threads again. Throws GitHub's error. */
    addComment(comment: Omit<NewReviewComment, "commitId" | "path">) {
      const pull = state.pulls?.find(entry => entry.number === state.number), path = state.selectedPath;
      if (!pull || !path) return Promise.resolve();
      const commitId = state.headSha ?? pull.headSha;
      return write(pull.number, (owner, repo) => owner.addReviewComment(repo, pull.number, { ...comment, path, commitId }));
    },
    /** Replies to the thread whose first comment is `commentId`, then reads the threads again. Throws GitHub's error. */
    reply(commentId: number, body: string) {
      const number = state.number;
      if (number === null) return Promise.resolve();
      return write(number, (owner, repo) => owner.replyToReviewComment(repo, number, commentId, body));
    },
    /** Approves, requests changes or comments on the selected pull request at its head commit, then reads its reviews and threads again. Throws GitHub's error. */
    submitReview(event: ReviewEvent, body: string) {
      const pull = state.pulls?.find(entry => entry.number === state.number);
      if (!pull) return Promise.resolve();
      const commitId = state.headSha ?? pull.headSha;
      return write(pull.number, (owner, repo) => owner.submitReview(repo, pull.number, { commitId, event, body }));
    },
    /** The title a new pull request for `branch` starts with: its only commit's summary since `base` on the pull requests' remote, else the branch name. */
    async suggestedTitle(branch: string, base: string) {
      const root = state.root, remote = state.remote;
      if (!root || !remote) return branch;
      const page = await serviceFor(root).logRange(`refs/remotes/${remote}/${base}`, `refs/heads/${branch}`, { count: 1 }).catch(() => null);
      return pullRequestTitle(branch, page?.done ? page.commits.map(commit => commit.summary) : []);
    },
    /**
     * Opens a pull request in `root`'s GitHub repository for the branch pushed to `remoteBranch` on `remote`
     * ("owner:branch" when that remote is a fork), then reads the list again and returns its number. Does nothing when
     * another repository is open by now. Throws GitHub's error, or when `remote` isn't on GitHub.
     */
    async createPullRequest({ root, remote, remoteBranch, ...pull }: Omit<NewPullRequest, "head"> & { root: string; remote: string; remoteBranch: string }) {
      const repo = state.repo, owner = client;
      if (!repo || !owner || state.root !== root || writing) return null;
      writing = true;
      publish({ writing: true });
      try {
        const headRepo = githubRepository(await serviceFor(root).remoteUrl(remote));
        if (!headRepo) throw new Error(`“${remote}” isn’t a GitHub remote, so a pull request can’t come from it. Publish the branch to a GitHub remote first.`);
        if (state.root !== root || client !== owner) return null;
        const created = await owner.createPullRequest(repo, { ...pull, head: pullRequestHead(repo, headRepo, remoteBranch) });
        if (client === owner && state.root === root) {
          await refresh();
          // GitHub's list can lag its write; the new pull request is listed either way.
          if (client === owner && state.pulls && !state.pulls.some(entry => entry.number === created.number)) publish({ pulls: [created, ...state.pulls] });
        }
        return created.number;
      } finally {
        writing = false;
        if (!closed) publish({ writing: false });
      }
    },
    dispose() { closed = true; listRead += 1; filesRead += 1; rootRead += 1; threadsRead += 1; reviewsRead += 1; mergedRead += 1; client = null; },
  };
}
