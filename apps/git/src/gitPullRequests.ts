import { getGitService, githubRepository, type GitService } from "@legend-apps/git-core";
import { findUnifiedPatchFile, parseUnifiedPatch, type UnifiedPatchFile } from "@legend-apps/diff-parser/src/unifiedPatch";
import { apiUrlOverride, createGitHubClient, gitHubApiUrl, GitHubError, pullFilePatch, type GitHubClient, type GitHubPullFile, type GitHubPullRequest, type GitHubRepo } from "./github";

/** `text` is null when GitHub sent no hunks (binary or too large); `error` when its hunks don't parse. */
export type PullFile = GitHubPullFile & { text: string | null; file: UnifiedPatchFile | null; error: string | null };
export type PullRequestsState = {
  root: string | null;
  /** The github.com repository whose pull requests are listed (the `upstream` remote's, else `origin`'s); null for other hosts. */
  repo: GitHubRepo | null;
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
};
export const emptyPullRequests: PullRequestsState = { root: null, repo: null, pulls: null, loading: false, error: null, number: null, files: null, filesLoading: false, filesError: null, selectedPath: null };

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

/**
 * The open pull requests of one repository's GitHub remote, read with the signed-in account's token. Reads happen on
 * `refresh` (⌘R, window focus) and selection only, never on a timer; unchanged pages come back as 304s from the
 * client's ETag cache. A newer read, root or token wins over an older one; signing out clears the list.
 */
export function createPullRequests(onChange: (state: PullRequestsState) => void, {
  serviceFor = getGitService, clientFor = (token: string, apiUrl: string) => createGitHubClient({ token, apiUrl }),
}: { serviceFor?: (path: string) => GitService; clientFor?: (token: string, apiUrl: string) => Pick<GitHubClient, "pullRequests" | "pullRequestFiles"> } = {}) {
  let state = emptyPullRequests;
  let closed = false;
  let token: string | null = null;
  let apiUrl = gitHubApiUrl;
  let client: ReturnType<typeof clientFor> | null = null;
  let listRead = 0, filesRead = 0, rootRead = 0;
  const publish = (patch: Partial<PullRequestsState>) => { state = { ...state, ...patch }; if (!closed) onChange(state); };
  const makeClient = () => { client = token && state.repo ? clientFor(token, apiUrl) : null; };

  async function readFiles(number: number, keepSelection: boolean) {
    const repo = state.repo, owner = client, read = ++filesRead;
    if (!repo || !owner) return;
    publish(keepSelection ? { filesLoading: true } : { number, files: null, filesLoading: true, filesError: null, selectedPath: null });
    try {
      const files = (await owner.pullRequestFiles(repo, number)).map(pullFile);
      if (read !== filesRead || closed) return;
      const selectedPath = keepSelection && files.some(file => file.path === state.selectedPath) ? state.selectedPath : files[0]?.path ?? null;
      publish({ files, filesLoading: false, filesError: null, selectedPath });
    } catch (error) {
      if (read === filesRead) publish({ filesLoading: false, filesError: errorOf(error).message });
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
      publish({ pulls, loading: false, error: null, ...number === null ? { number: null, files: null, selectedPath: null, filesError: null } : {} });
      if (number !== null) await readFiles(number, true);
    } catch (error) {
      if (read === listRead && !closed) publish({ loading: false, error: errorOf(error) });
    }
  }

  return {
    /** Reads the repository's GitHub remote (and the loopback API override, for tests), then its pull requests. */
    async setRoot(root: string | null) {
      const read = ++rootRead;
      listRead += 1; filesRead += 1;
      client = null;
      apiUrl = gitHubApiUrl;
      publish({ ...emptyPullRequests, root });
      if (!root) return;
      const git = serviceFor(root);
      try {
        const [upstream, origin, override] = await Promise.all([git.remoteUrl("upstream"), git.remoteUrl("origin"), git.configValue("legendgit.githubApiUrl")]);
        if (read !== rootRead || closed) return;
        apiUrl = apiUrlOverride(override) ?? gitHubApiUrl;
        publish({ repo: githubRepository(upstream) ?? githubRepository(origin) });
        makeClient();
        await refresh();
      } catch (error) { console.error(error); }
    },
    /** The signed-in account's token; null (signed out) clears the list. */
    setToken(next: string | null) {
      if (next === token) return;
      token = next;
      listRead += 1; filesRead += 1;
      makeClient();
      publish({ pulls: null, loading: false, error: null, number: null, files: null, filesLoading: false, filesError: null, selectedPath: null });
      void refresh();
    },
    refresh,
    /** The API sign-in checks tokens against: api.github.com, or the repository's loopback override. */
    apiUrl: () => apiUrl,
    select(number: number | null) {
      if (number === state.number) return;
      filesRead += 1;
      if (number === null || !state.pulls?.some(pull => pull.number === number)) { publish({ number: null, files: null, filesLoading: false, filesError: null, selectedPath: null }); return; }
      void readFiles(number, false);
    },
    selectFile(path: string) { if (state.files?.some(file => file.path === path)) publish({ selectedPath: path }); },
    dispose() { closed = true; listRead += 1; filesRead += 1; rootRead += 1; client = null; },
  };
}
