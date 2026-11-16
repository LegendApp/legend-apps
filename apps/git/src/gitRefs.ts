import { getGitService, type GitBranch, type GitRefList, type GitRemoteBranch, type GitService, type GitTag } from "@legend-apps/git-core";

export type RefsState = { root: string | null; refs: GitRefList | null; writing: boolean; error: string | null };
export const emptyRefs: RefsState = { root: null, refs: null, writing: false, error: null };

/** A sidebar ref: a local branch, a remote branch or a tag, found by its full ref name. */
export type RefEntry = { kind: "branch"; ref: GitBranch } | { kind: "remote"; ref: GitRemoteBranch } | { kind: "tag"; ref: GitTag };

export function findRef(refs: GitRefList | null, name: string | null | undefined): RefEntry | null {
  if (!refs || !name) return null;
  const branch = refs.branches.find(entry => entry.ref === name);
  if (branch) return { kind: "branch", ref: branch };
  for (const remote of refs.remotes) {
    const found = remote.branches.find(entry => entry.ref === name);
    if (found) return { kind: "remote", ref: found };
  }
  const tag = refs.tags.find(entry => entry.ref === name);
  return tag ? { kind: "tag", ref: tag } : null;
}

/** What a user typed in Switch Branch: a local branch, a remote branch ("origin/x"), or a remote branch's own name ("x") when only one remote has it. */
export function resolveBranchName(refs: GitRefList | null, name: string): RefEntry | null {
  if (!refs) return null;
  const local = refs.branches.find(entry => entry.name === name);
  if (local) return { kind: "branch", ref: local };
  const remotes = refs.remotes.flatMap(remote => remote.branches);
  const remote = remotes.find(entry => entry.name === name);
  if (remote) return { kind: "remote", ref: remote };
  const matches = remotes.filter(entry => entry.branch === name);
  return matches.length === 1 ? { kind: "remote", ref: matches[0]! } : null;
}

/** Local branches, most recently committed first, for the toolbar's branch menu. */
export const recentBranches = (refs: GitRefList | null, count = 10) => [...refs?.branches ?? []].sort((a, b) => b.time - a.time).slice(0, count);

/**
 * Branches, remote branches and tags of one repository, and the branch writes. Reads happen on
 * `refresh`, which the window calls whenever Changes re-reads status (its watcher sees ref and HEAD
 * changes). Writes run one at a time through git-core's repository queue and reject with Git's error.
 */
export function createGitRefs(onChange: (state: RefsState) => void, serviceFor: (path: string) => GitService = getGitService) {
  let state = emptyRefs;
  let closed = false;
  let service: GitService | undefined;
  let active: AbortController | undefined;
  let run = 0;
  let latest: Promise<void> = Promise.resolve();
  const publish = (patch: Partial<RefsState>) => { state = { ...state, ...patch }; if (!closed) onChange(state); };

  const read = async (git: GitService, controller: AbortController, current: number) => {
    try {
      const refs = await git.listRefs({ signal: controller.signal });
      if (current === run && active === controller && !closed) publish({ refs, error: null });
    } catch (error) {
      if (current === run && active === controller && !closed && !controller.signal.aborted) publish({ error: error instanceof Error ? error.message : String(error) });
    }
  };
  /** Re-reads the refs; resolves once the newest read has landed, also one started meanwhile. */
  const refresh = async () => {
    const git = service, controller = active;
    if (!git || !controller || closed) return;
    latest = read(git, controller, ++run);
    let seen: Promise<void>;
    do { seen = latest; await seen; } while (seen !== latest);
  };

  /** Runs one write and re-reads the refs, also when the write fails; rejects with the write's error. */
  const write = async <T>(operation: (git: GitService, signal: AbortSignal) => Promise<T>): Promise<T> => {
    const git = service, controller = active;
    if (!git || !controller || closed) throw new Error("Open a repository first.");
    if (state.writing) throw new Error("Another branch operation is still running.");
    publish({ writing: true });
    try {
      return await operation(git, controller.signal);
    } finally {
      if (active === controller) {
        publish({ writing: false });
        await refresh();
      }
    }
  };

  return {
    setRoot(root: string | null) {
      if (root === state.root) return;
      active?.abort();
      run++;
      service = root ? serviceFor(root) : undefined;
      active = root ? new AbortController() : undefined;
      publish({ ...emptyRefs, root });
      void refresh();
    },
    refresh,
    /** Checks out a local branch, or a remote branch as a tracking local branch; resolves with the local branch's ref name. */
    checkout(entry: RefEntry) {
      if (entry.kind === "tag") return Promise.reject(new Error("Check out a branch, not a tag."));
      return write(async (git, signal) => {
        if (entry.kind === "branch") { await git.checkoutBranch(entry.ref.name, { signal }); return entry.ref.ref; }
        return `refs/heads/${await git.checkoutRemoteBranch(entry.ref, { signal })}`;
      });
    },
    /** Creates and checks out branch `name` at `startPoint` (a ref name or commit; HEAD when omitted). */
    create(name: string, startPoint?: string) {
      return write((git, signal) => git.createBranch(name, startPoint, { signal }));
    },
    rename(from: string, to: string) {
      return write((git, signal) => git.renameBranch(from, to, { signal }));
    },
    /** Rejects with GitBranchNotMergedError when `force` is off and the branch has unmerged commits. */
    delete(name: string, force = false) {
      return write((git, signal) => git.deleteBranch(name, { force, signal }));
    },
    dispose() { closed = true; active?.abort(); active = undefined; service = undefined; },
  };
}
