import { getGitService, type GitNetworkOptions, type GitProgress, type GitService } from "@legend-apps/git-core";

export type NetworkOperation = "fetch" | "pull" | "push" | "publish";
/** The running fetch, pull or push of one repository (one at a time) and its last `--progress` report. */
export type NetworkState = { root: string | null; operation: NetworkOperation | null; progress: GitProgress | null };
export const emptyNetwork: NetworkState = { root: null, operation: null, progress: null };

const verbs: Record<NetworkOperation, string> = { fetch: "Fetching", pull: "Pulling", push: "Pushing", publish: "Publishing" };
export const networkVerb = (operation: NetworkOperation) => verbs[operation];

/** The toolbar's status text: Git's phase and percentage while an operation runs, else the branch's ↓behind ↑ahead counts ("" when both are 0). */
export function networkStatusText(state: NetworkState, branch: { upstream: string | null; ahead: number; behind: number } | null | undefined) {
  if (state.operation) return state.progress ? `${state.progress.phase} ${state.progress.percent}%` : `${verbs[state.operation]}…`;
  if (!branch?.upstream) return "";
  return [branch.behind ? `↓${branch.behind}` : "", branch.ahead ? `↑${branch.ahead}` : ""].filter(Boolean).join(" ");
}

/**
 * Fetch, pull and push for one repository, one at a time. Progress reports are passed on at most every 150 ms unless the
 * phase changes. Operations reject with Git's error; `cancel` (or a new root, or dispose) stops the running one.
 */
export function createGitNetwork(onChange: (state: NetworkState) => void, serviceFor: (path: string) => GitService = getGitService, now = () => Date.now()) {
  let state = emptyNetwork;
  let closed = false;
  let active: AbortController | undefined;
  const publish = (patch: Partial<NetworkState>) => { state = { ...state, ...patch }; if (!closed) onChange(state); };

  const run = async (operation: NetworkOperation, start: (git: GitService, options: GitNetworkOptions) => Promise<void>) => {
    const root = state.root;
    if (!root || closed) throw new Error("Open a repository first.");
    if (state.operation) throw new Error(`${verbs[state.operation]} is still running.`);
    const controller = new AbortController();
    active = controller;
    let shown = 0;
    publish({ operation, progress: null });
    const onProgress = (progress: GitProgress) => {
      if (active !== controller) return;
      const time = now();
      if (state.progress?.phase === progress.phase && (time - shown < 150 || state.progress.percent === progress.percent)) return;
      shown = time;
      publish({ progress });
    };
    try {
      await start(serviceFor(root), { signal: controller.signal, onProgress });
    } finally {
      if (active === controller) { active = undefined; publish({ operation: null, progress: null }); }
    }
  };

  return {
    setRoot(root: string | null) {
      if (root === state.root) return;
      active?.abort();
      active = undefined;
      publish({ ...emptyNetwork, root });
    },
    /** Fetches every remote and prunes remote branches deleted there. */
    fetch() { return run("fetch", (git, options) => git.fetch({ ...options, prune: true })); },
    pull() { return run("pull", (git, options) => git.pull(options)); },
    push() { return run("push", (git, options) => git.push(options)); },
    /** The branch's first push: sets its upstream on `remote`. */
    publish(remote: string) { return run("publish", (git, options) => git.push({ ...options, setUpstream: remote })); },
    /** The remote a first push would go to, or null when there's none. */
    publishRemote() {
      return state.root ? serviceFor(state.root).publishRemote() : Promise.resolve(null);
    },
    cancel() { active?.abort(); },
    dispose() { closed = true; active?.abort(); active = undefined; },
  };
}
