import { getGitService, githubRepository, type GitService } from "@legend-apps/git-core";
import { findUnifiedPatchFile, parseUnifiedPatch, type UnifiedPatchFile } from "@legend-apps/diff-parser/src/unifiedPatch";
import { apiUrlOverride, createGitHubClient, gitHubApiUrl, GitHubError, pullFilePatch, type GitHubClient, type GitHubPullFile, type GitHubPullRequest, type GitHubRepo, type GitHubReview, type NewReviewComment, type ReviewEvent, type ReviewThread } from "./github";

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
  /** A comment, reply or review is being posted. */
  writing: boolean;
};
const noSelection = { number: null, files: null, filesLoading: false, filesError: null, selectedPath: null, threads: null, headSha: null, threadsError: null, reviews: null, reviewsError: null };
export const emptyPullRequests: PullRequestsState = { root: null, repo: null, remote: null, pulls: null, loading: false, error: null, ...noSelection, writing: false };

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

/**
 * The open pull requests of one repository's GitHub remote, read with the signed-in account's token. Reads happen on
 * `refresh` (⌘R, window focus) and selection only, never on a timer; unchanged pages come back as 304s from the
 * client's ETag cache. A newer read, root or token wins over an older one; signing out clears the list.
 */
export function createPullRequests(onChange: (state: PullRequestsState) => void, {
  serviceFor = getGitService, clientFor = (token: string, apiUrl: string) => createGitHubClient({ token, apiUrl }),
}: { serviceFor?: (path: string) => GitService; clientFor?: (token: string, apiUrl: string) => Pick<GitHubClient, "pullRequests" | "pullRequestFiles" | "reviewThreads" | "reviews" | "addReviewComment" | "replyToReviewComment" | "submitReview"> } = {}) {
  let state = emptyPullRequests;
  let closed = false;
  let token: string | null = null;
  let apiUrl = gitHubApiUrl;
  let client: ReturnType<typeof clientFor> | null = null;
  let listRead = 0, filesRead = 0, rootRead = 0, threadsRead = 0, reviewsRead = 0;
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

  async function refresh() {
    const repo = state.repo, owner = client, read = ++listRead;
    if (!repo || !owner || closed) return;
    publish({ loading: true });
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
      listRead += 1; filesRead += 1; threadsRead += 1; reviewsRead += 1;
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
      listRead += 1; filesRead += 1; threadsRead += 1; reviewsRead += 1;
      makeClient();
      publish({ pulls: null, loading: false, error: null, ...noSelection });
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
    dispose() { closed = true; listRead += 1; filesRead += 1; rootRead += 1; threadsRead += 1; reviewsRead += 1; client = null; },
  };
}
