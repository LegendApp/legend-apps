import { getGitService, type GitAddWorktreeOptions, type GitBranch, type GitRefList, type GitRemoteBranch, type GitService, type GitStash, type GitTag, type GitWorktree } from "@legend-apps/git-core";

/** A worktree and its number of changed paths (null until counted, or when its folder can't be read). */
export type WorktreeEntry = GitWorktree & { changes: number | null };
/** `outgoing`: commits each local branch without a live upstream has that the default branch doesn't, by full ref name (null until read, or when there's no default branch). */
export type RefsState = { root: string | null; refs: GitRefList | null; stashes: GitStash[] | null; worktrees: WorktreeEntry[] | null; outgoing: Record<string, number> | null; writing: boolean; error: string | null };
export const emptyRefs: RefsState = { root: null, refs: null, stashes: null, worktrees: null, outgoing: null, writing: false, error: null };

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
 * Branches, remote branches, tags and stashes of one repository, and their writes. Reads happen on
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
      const [refs, stashes, listed] = await Promise.all([git.listRefs({ signal: controller.signal }), git.listStashes({ signal: controller.signal }), git.listWorktrees({ signal: controller.signal })]);
      if (current !== run || active !== controller || closed) return;
      // Counts from the last read stay shown until the new ones land; a missing folder has none.
      const previous = new Map(state.worktrees?.map(entry => [entry.path, entry.changes]));
      publish({ refs, stashes, worktrees: listed.map(entry => ({ ...entry, changes: previous.get(entry.path) ?? null })), error: null });
      // One extra read for branches the Review Queue compares with the default branch instead of an upstream.
      const base = refs.defaultBranch;
      if (base && refs.branches.some(branch => !branch.upstream || branch.gone)) {
        void git.branchesAhead(base, { signal: controller.signal }).then(outgoing => {
          if (current === run && active === controller && !closed) publish({ outgoing });
        }, () => {});
      } else publish({ outgoing: null });
      if (listed.length < 2) return;
      // Counted after the refs land, so writes and refreshes don't wait for every worktree's status.
      void Promise.all(listed.map(entry => entry.bare || entry.prunable !== null ? null
        : git.worktreeChangeCount(entry.path, { signal: controller.signal }).catch(() => null))).then(counts => {
        if (current === run && active === controller && !closed) publish({ worktrees: listed.map((entry, index) => ({ ...entry, changes: counts[index] ?? null })) });
      });
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
    if (state.writing) throw new Error("Another branch or stash operation is still running.");
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
    /**
     * Stashes all changes, untracked files included, and checks out the branch; when the checkout still fails the
     * stash is popped back. Resolves with the local branch's ref name.
     */
    stashAndCheckout(entry: RefEntry) {
      if (entry.kind === "tag") return Promise.reject(new Error("Check out a branch, not a tag."));
      return write(async (git, signal) => `refs/heads/${(await git.stashAndSwitch(entry.kind === "branch" ? entry.ref.name : entry.ref, { signal })).branch}`);
    },
    /** Resolves with the new stash's oid. */
    stash(message: string, includeUntracked: boolean) {
      return write((git, signal) => git.stashPush(message, { includeUntracked, signal }));
    },
    applyStash(oid: string) { return write((git, signal) => git.stashApply(oid, { signal })); },
    popStash(oid: string) { return write((git, signal) => git.stashPop(oid, { signal })); },
    dropStash(oid: string) { return write((git, signal) => git.stashDrop(oid, { signal })); },
    /** Creates and checks out branch `name` at `startPoint` (a ref name or commit; HEAD when omitted). */
    create(name: string, startPoint?: string) {
      return write((git, signal) => git.createBranch(name, startPoint, { signal }));
    },
    rename(from: string, to: string) {
      return write((git, signal) => git.renameBranch(from, to, { signal }));
    },
    /** Adds a worktree at `path` for an existing branch or a new one (see GitService.addWorktree); resolves with its path as Git lists it. */
    addWorktree(path: string, options: Omit<GitAddWorktreeOptions, "signal">) {
      return write((git, signal) => git.addWorktree(path, { ...options, signal } as GitAddWorktreeOptions));
    },
    /** Without `force`, Git refuses a worktree with changes or a lock and its message is the error. */
    removeWorktree(path: string, force = false) {
      return write((git, signal) => git.removeWorktree(path, { force, signal }));
    },
    /** Rejects with GitBranchNotMergedError when `force` is off and the branch has unmerged commits. */
    delete(name: string, force = false) {
      return write((git, signal) => git.deleteBranch(name, { force, signal }));
    },
    dispose() { closed = true; active?.abort(); active = undefined; service = undefined; },
  };
}
