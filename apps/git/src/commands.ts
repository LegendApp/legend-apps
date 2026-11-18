import type { GitOperation, GitRefList, GitStash } from "@legend-apps/git-core";
import { abortLabel, canContinue, continueLabel } from "./gitOperation";
import { searchScopes, type SearchScope } from "./gitHistory";
import { findRef, type WorktreeEntry } from "./gitRefs";
import { networkVerb, type NetworkOperation } from "./gitNetwork";
import type { GitHubAccountState } from "./gitHubAccount";
import { canPushQueueEntry, queuePushTarget, type QueueEntry } from "./gitQueue";

/**
 * A sidebar item: Changes, History, a branch, remote branch or tag by its full ref name, a stash by its oid, a worktree by
 * its path, or a Review Queue entry by its id (`review:worktree:<path>`, `review:branch:<ref>`).
 */
export type Section = "changes" | "history" | `ref:${string}` | `stash:${string}` | `worktree:${string}` | `review:${QueueEntry["id"]}` | `pr:${number}`;
export const sectionRef = (section: Section) => section.startsWith("ref:") ? section.slice(4) : null;
export const sectionStash = (section: Section) => section.startsWith("stash:") ? section.slice(6) : null;
export const sectionWorktree = (section: Section) => section.startsWith("worktree:") ? section.slice(9) : null;
export const sectionPullRequest = (section: Section) => section.startsWith("pr:") ? Number(section.slice(3)) : null;
export const sectionReview = (section: Section) => section.startsWith("review:") ? section.slice(7) as QueueEntry["id"] : null;
/** The selected Review Queue entry, if it is still queued. */
export const queueEntry = (queue: readonly QueueEntry[], section: Section) => {
  const id = sectionReview(section);
  return id ? queue.find(entry => entry.id === id) ?? null : null;
};
/** History lists commits: HEAD's, or a ref's. */
export const sectionShowsHistory = (section: Section) => section === "history" || section.startsWith("ref:");

/** What every command reads to decide its label and whether it is enabled, plus the actions it runs. */
export type CommandContext = {
  hasRepository: boolean;
  section: Section;
  sidebarCollapsed: boolean;
  busy: boolean;
  selectedCommit: string | null;
  /** The file selected in Changes or in the selected commit. */
  selectedFile: string | null;
  /** The file whose history History shows, if any. */
  fileHistoryPath: string | null;
  gitHubUrl(oid: string): string | null;
  /** History shows search results. */
  searching: boolean;
  /** The diff pane has a line to blame (the one clicked last). */
  canBlame: boolean;
  searchScope: SearchScope;
  canApplyLines: boolean;
  linesLabel: string;
  canDiscardFile: boolean;
  canDiscardLines: boolean;
  canRestoreDiscard: boolean;
  generating: boolean;
  canGenerate: boolean;
  canCommit: boolean;
  /** Branches, remote branches and tags; null until read. */
  refs: GitRefList | null;
  /** HEAD has no commit yet. */
  unborn: boolean;
  /** A branch or stash write is running. */
  branchBusy: boolean;
  /** Stash entries, newest first; null until read. */
  stashes: GitStash[] | null;
  /** The worktree or index has changes to stash. */
  hasChanges: boolean;
  /** The repository's worktrees, the main one first; null until read. */
  worktrees: WorktreeEntry[] | null;
  /** The path of the worktree this window shows. */
  root: string | null;
  /** The checked-out branch; null when detached or not read yet. */
  currentBranch: string | null;
  /** The current branch's upstream ("origin/main"), or null. */
  upstream: string | null;
  /** The repository has at least one remote. */
  hasRemote: boolean;
  /** The running fetch, pull or push. */
  network: NetworkOperation | null;
  /** The Review Queue: other worktrees with changes and branches with commits to push. */
  queue: readonly QueueEntry[];
  /** Recently opened repositories, newest first. */
  recents: readonly string[];
  /** The merge, rebase, cherry-pick, revert or bisect Git has paused. */
  operation: GitOperation | null;
  /** Paths with merge conflicts. */
  conflicted: readonly string[];
  /** The GitHub account pull requests are read with. */
  gitHub: GitHubAccountState;
  /** Open pull requests' numbers (signed in, on a GitHub repository), and whether a comment or review is being posted. */
  pullRequests: readonly number[];
  pullWriting: boolean;
  /** The selected pull request's page, for Open on GitHub. */
  pullRequestUrl: string | null;
  /** Signed in, on a GitHub repository, with a branch checked out: Create Pull Request… can start. */
  canCreatePullRequest: boolean;
  run: {
    openRepository(): void;
    openRecent(path: string): void;
    /** Asks first. */
    abortOperation(): void;
    continueOperation(): void;
    toggleSidebar(): void;
    showSection(section: Section): void;
    refresh(): void;
    copySha(oid: string): void;
    openOnGitHub(oid: string): void;
    openPullRequestOnGitHub(url: string): void;
    /** Opens the Create Pull Request sheet for the current branch. */
    createPullRequest(): void;
    showFileHistory(path: string): void;
    closeFileHistory(): void;
    blameLine(): void;
    compareWith(oid: string): void;
    setSearchScope(scope: SearchScope): void;
    applyLines(): void;
    discardFile(): void;
    discardLines(): void;
    restoreDiscard(): void;
    toggleGenerate(): void;
    commit(): void;
    checkout(ref: string): void;
    switchBranch(): void;
    /** `start` is a ref name or commit; HEAD when omitted. */
    newBranch(start?: string): void;
    renameBranch(ref: string): void;
    deleteBranch(ref: string): void;
    /** Merges a local or remote branch into the current one after a confirm sheet; without a ref, asks for its name first. */
    mergeRef(ref?: string): void;
    /** Rebases the current branch onto a local or remote branch after a confirm sheet; without a ref, asks for its name first. */
    rebaseRef(ref?: string): void;
    /** Cherry-picks a commit onto the current branch, or reverts it there after asking. */
    pickCommit(kind: "cherry-pick" | "revert", oid: string): void;
    /** Stages a conflicted file, asking first when it still has conflict markers. */
    markResolved(path: string): void;
    copyText(text: string): void;
    stashChanges(includeUntracked: boolean): void;
    applyStash(oid: string): void;
    popStash(oid: string): void;
    dropStash(oid: string): void;
    openWorktree(path: string): void;
    newWorktree(): void;
    removeWorktree(path: string): void;
    revealInFinder(path: string): void;
    fetch(): void;
    pull(): void;
    /** Pushes, or publishes a branch without an upstream. */
    push(): void;
    cancelNetwork(): void;
    /** Pushes (or publishes) a Review Queue entry's branch. */
    pushQueueEntry(id: QueueEntry["id"]): void;
    /** Uses GitHub CLI's token or a pasted one, after a sheet. */
    signInToGitHub(): void;
    signOutOfGitHub(): void;
    /** Opens the review sheet for the selected pull request. */
    reviewPullRequest(): void;
    /** Fetches the pull request into a local branch, then checks it out or adds a worktree for it next to the repository. */
    checkOutPullRequest(number: number, worktree: boolean): void;
  };
};

/** `target` is the commit or file picked by a context menu; menu and toolbar commands act on the selection. */
export type Command = {
  id: string;
  label: string | ((context: CommandContext) => string);
  shortcut?: string;
  enabled(context: CommandContext, target?: string): boolean;
  run(context: CommandContext, target?: string): void;
};

const commit = (context: CommandContext, target?: string) => target ?? context.selectedCommit;
/** The ref a branch command acts on: the context menu's, else the selected sidebar ref. */
const ref = (context: CommandContext, target?: string) => findRef(context.refs, target ?? sectionRef(context.section));
/** The local branch Rename acts on: the target or selected one, else (no target, no branch selected) the current branch. */
const renameTarget = (context: CommandContext, target?: string) => {
  const entry = ref(context, target);
  if (entry?.kind === "branch") return entry.ref;
  return target ? null : context.refs?.branches.find(branch => branch.current) ?? null;
};
const canWriteBranch = (context: CommandContext) => context.hasRepository && !context.branchBusy && !context.unborn;
/** A local branch other than the current one, or a remote branch, that a merge can take (the context menu's, else the selected one). */
const mergeable = (context: CommandContext, target?: string) => {
  const entry = ref(context, target);
  return entry?.kind === "remote" || (entry?.kind === "branch" && !entry.ref.current) ? entry : null;
};
const canMerge = (context: CommandContext) => canWriteBranch(context) && !!context.currentBranch && !context.operation && !context.busy;
/** The stash a stash command acts on: the context menu's, else the selected one. */
const stash = (context: CommandContext, target?: string) => {
  const oid = target ?? sectionStash(context.section);
  return context.stashes?.find(entry => entry.oid === oid) ?? null;
};
/** The worktree a worktree command acts on: the context menu's, else the selected one (in Worktrees or the Review Queue). */
const worktree = (context: CommandContext, target?: string) => {
  const queued = queueEntry(context.queue, context.section);
  const path = target ?? sectionWorktree(context.section) ?? (queued?.kind === "worktree" ? queued.path : null);
  return context.worktrees?.find(entry => entry.path === path) ?? null;
};
/** Another worktree whose folder is there to open. */
const openable = (context: CommandContext, target?: string) => {
  const entry = worktree(context, target);
  return entry && !entry.bare && entry.prunable === null && entry.path !== context.root ? entry : null;
};
/** The queue entry a queue command acts on: the context menu's (by id), else the selected one. */
const queued = (context: CommandContext, target?: string) => target ? context.queue.find(entry => entry.id === target) ?? null : queueEntry(context.queue, context.section);
/** The pull request a pull request command acts on: the context menu's (its number), else the selected one. */
const pullRequest = (context: CommandContext, target?: string) => {
  const number = target ? Number(target) : sectionPullRequest(context.section);
  return number !== null && context.pullRequests.includes(number) ? number : null;
};
const canStash = (context: CommandContext) => canWriteBranch(context) && context.hasChanges && !context.busy;

export const commands = [
  { id: "open-repository", label: "Open Repository…", shortcut: "Cmd+o", enabled: () => true, run: context => context.run.openRepository() },
  { id: "open-recent", label: "Open Recent", enabled: (context, target) => !!target && context.recents.includes(target), run: (context, target) => context.run.openRecent(target!) },
  {
    id: "abort-operation", label: context => context.operation ? `${abortLabel(context.operation.kind)}…` : "Abort Operation…",
    enabled: context => context.hasRepository && !context.busy && !!context.operation, run: context => context.run.abortOperation(),
  },
  {
    id: "continue-operation", label: context => context.operation && context.operation.kind !== "bisect" ? continueLabel(context.operation.kind) : "Continue Operation",
    enabled: context => context.hasRepository && !context.busy && canContinue(context.operation), run: context => context.run.continueOperation(),
  },
  { id: "toggle-sidebar", label: context => context.sidebarCollapsed ? "Show Sidebar" : "Hide Sidebar", shortcut: "Cmd+Ctrl+s", enabled: () => true, run: context => context.run.toggleSidebar() },
  { id: "show-changes", label: "Changes", shortcut: "Cmd+1", enabled: context => context.hasRepository, run: context => context.run.showSection("changes") },
  { id: "show-history", label: "History", shortcut: "Cmd+2", enabled: context => context.hasRepository, run: context => context.run.showSection("history") },
  {
    id: "show-review", label: "Review Queue", shortcut: "Cmd+3", enabled: context => context.hasRepository && context.queue.length > 0,
    run: context => context.run.showSection(`review:${(queueEntry(context.queue, context.section) ?? context.queue[0]!).id}`),
  },
  {
    id: "push-review", label: (context: CommandContext) => { const entry = queued(context); return entry && queuePushTarget(entry)?.publish ? "Publish Branch…" : "Push"; },
    enabled: (context, target) => { const entry = queued(context, target); return context.hasRepository && !!entry && canPushQueueEntry(entry) && (!!entry.upstream || context.hasRemote) && !context.network; },
    run: (context, target) => context.run.pushQueueEntry(queued(context, target)!.id),
  },
  { id: "fetch", label: "Fetch", shortcut: "Cmd+Alt+f", enabled: context => context.hasRepository && context.hasRemote && !context.network, run: context => context.run.fetch() },
  // Pull fast-forwards the worktree, so it waits for branch writes like a checkout.
  { id: "pull", label: "Pull", shortcut: "Cmd+Shift+Down", enabled: context => canWriteBranch(context) && !!context.upstream && !context.network, run: context => context.run.pull() },
  {
    id: "push", label: context => context.upstream || !context.currentBranch ? "Push" : "Publish Branch…", shortcut: "Cmd+Shift+Up",
    enabled: context => context.hasRepository && !context.unborn && !!context.currentBranch && (!!context.upstream || context.hasRemote) && !context.network,
    run: context => context.run.push(),
  },
  {
    id: "cancel-network", label: context => context.network ? `Stop ${networkVerb(context.network)}` : "Stop", shortcut: "Cmd+.",
    enabled: context => !!context.network, run: context => context.run.cancelNetwork(),
  },
  { id: "refresh", label: "Refresh", shortcut: "Cmd+r", enabled: context => context.hasRepository, run: context => context.run.refresh() },
  // Also while signed in, to replace a token GitHub stopped accepting.
  { id: "sign-in-github", label: "Sign In to GitHub…", enabled: context => context.gitHub.status !== "loading", run: context => context.run.signInToGitHub() },
  {
    id: "sign-out-github", label: context => context.gitHub.login ? `Sign Out of GitHub (${context.gitHub.login})` : "Sign Out of GitHub",
    enabled: context => context.gitHub.status === "signed-in", run: context => context.run.signOutOfGitHub(),
  },
  {
    id: "review-pull-request", label: "Review…",
    enabled: context => context.gitHub.status === "signed-in" && pullRequest(context) !== null && !context.pullWriting, run: context => context.run.reviewPullRequest(),
  },
  // Fetching goes through the network slot; checking out waits for branch writes like any checkout.
  {
    id: "checkout-pull-request", label: "Check Out as Branch",
    enabled: (context, target) => canWriteBranch(context) && pullRequest(context, target) !== null && !context.network,
    run: (context, target) => context.run.checkOutPullRequest(pullRequest(context, target)!, false),
  },
  {
    id: "pull-request-worktree", label: "Open in New Worktree…",
    enabled: (context, target) => canWriteBranch(context) && pullRequest(context, target) !== null && !context.network && !!context.worktrees,
    run: (context, target) => context.run.checkOutPullRequest(pullRequest(context, target)!, true),
  },
  { id: "copy-sha", label: "Copy SHA", shortcut: "Cmd+Shift+c", enabled: (context, target) => !!commit(context, target), run: (context, target) => context.run.copySha(commit(context, target)!) },
  {
    // A commit (a context menu's, or History's selected one), else the selected pull request.
    id: "open-github", label: "Open on GitHub", shortcut: "Ctrl+Cmd+g",
    enabled: (context, target) => { const oid = commit(context, target); return oid ? !!context.gitHubUrl(oid) : !!context.pullRequestUrl; },
    run: (context, target) => { const oid = commit(context, target); if (oid) context.run.openOnGitHub(oid); else context.run.openPullRequestOnGitHub(context.pullRequestUrl!); },
  },
  {
    // Also from the current branch's context menu (its ref is the target); another branch would have to be checked out first.
    id: "create-pull-request", label: "Create Pull Request…", shortcut: "Cmd+Shift+r",
    enabled: (context, target) => context.canCreatePullRequest && !context.network && !context.pullWriting && !context.unborn
      && (!target || context.refs?.branches.find(branch => branch.ref === target)?.current === true),
    run: context => context.run.createPullRequest(),
  },
  {
    id: "show-file-history", label: "Show File History", shortcut: "Cmd+Shift+h",
    enabled: (context, target) => context.hasRepository && !!(target ?? context.selectedFile),
    run: (context, target) => context.run.showFileHistory((target ?? context.selectedFile)!),
  },
  { id: "show-all-history", label: "Show All History", enabled: context => !!context.fileHistoryPath || context.searching, run: context => context.run.closeFileHistory() },
  { id: "blame-line", label: "Blame Line", shortcut: "Cmd+Alt+b", enabled: context => context.hasRepository && context.canBlame, run: context => context.run.blameLine() },
  {
    id: "compare-with-selected", label: "Compare with Selected",
    enabled: (context, target) => !!target && !!context.selectedCommit && target !== context.selectedCommit,
    run: (context, target) => context.run.compareWith(target!),
  },
  ...searchScopes.map(({ scope, label }) => ({
    id: `search-${scope}` as const, label,
    enabled: (context: CommandContext) => context.hasRepository && context.section !== "changes",
    run: (context: CommandContext) => context.run.setSearchScope(scope),
  })),
  { id: "apply-lines", label: context => context.linesLabel, shortcut: "Cmd+Shift+l", enabled: context => context.canApplyLines, run: context => context.run.applyLines() },
  { id: "discard-file", label: "Discard Changes to File…", shortcut: "Cmd+Shift+Backspace", enabled: context => context.canDiscardFile, run: context => context.run.discardFile() },
  { id: "discard-lines", label: "Discard Selected Lines…", enabled: context => context.canDiscardLines, run: context => context.run.discardLines() },
  { id: "restore-discard", label: "Restore Last Discard…", enabled: context => context.canRestoreDiscard, run: context => context.run.restoreDiscard() },
  {
    id: "generate-message", label: context => context.generating ? "Cancel Generating Commit Message" : "Generate Commit Message", shortcut: "Cmd+Alt+g",
    enabled: context => context.generating || context.canGenerate, run: context => context.run.toggleGenerate(),
  },
  { id: "commit", label: context => sectionReview(context.section) ? "Commit…" : "Commit", shortcut: "Cmd+Enter", enabled: context => context.canCommit, run: context => context.run.commit() },
  {
    id: "checkout-ref", label: "Check Out",
    enabled: (context, target) => { const entry = ref(context, target); return canWriteBranch(context) && (entry?.kind === "remote" || (entry?.kind === "branch" && !entry.ref.current)); },
    run: (context, target) => context.run.checkout(ref(context, target)!.ref.ref),
  },
  {
    id: "switch-branch", label: "Switch Branch…", shortcut: "Cmd+Shift+b",
    enabled: context => canWriteBranch(context) && !!(context.refs?.branches.some(branch => !branch.current) || context.refs?.remotes.some(remote => remote.branches.length)),
    run: context => context.run.switchBranch(),
  },
  {
    id: "new-branch", label: "New Branch…", shortcut: "Cmd+Shift+n",
    enabled: canWriteBranch,
    run: (context, target) => context.run.newBranch(target),
  },
  {
    id: "rename-branch", label: "Rename Branch…",
    enabled: (context, target) => canWriteBranch(context) && !!renameTarget(context, target),
    run: (context, target) => context.run.renameBranch(renameTarget(context, target)!.ref),
  },
  {
    id: "delete-branch", label: "Delete Branch…",
    enabled: (context, target) => { const entry = ref(context, target); return canWriteBranch(context) && entry?.kind === "branch" && !entry.ref.current; },
    run: (context, target) => context.run.deleteBranch(ref(context, target)!.ref.ref),
  },
  {
    // The Branch menu merges the selected branch, or asks for a name; a context menu names both branches.
    id: "merge-ref", label: "Merge into Current Branch…",
    enabled: (context, target) => canMerge(context) && (target ? !!mergeable(context, target)
      : !!(context.refs?.branches.some(branch => !branch.current) || context.refs?.remotes.some(remote => remote.branches.length))),
    run: (context, target) => context.run.mergeRef(mergeable(context, target)?.ref.ref),
  },
  {
    id: "rebase-ref", label: "Rebase Current Branch onto…",
    enabled: (context, target) => canMerge(context) && (target ? !!mergeable(context, target)
      : !!(context.refs?.branches.some(branch => !branch.current) || context.refs?.remotes.some(remote => remote.branches.length))),
    run: (context, target) => context.run.rebaseRef(mergeable(context, target)?.ref.ref),
  },
  { id: "cherry-pick-commit", label: "Cherry-Pick Commit", enabled: (context, target) => canMerge(context) && !!commit(context, target), run: (context, target) => context.run.pickCommit("cherry-pick", commit(context, target)!) },
  { id: "revert-commit", label: "Revert Commit…", enabled: (context, target) => canMerge(context) && !!commit(context, target), run: (context, target) => context.run.pickCommit("revert", commit(context, target)!) },
  {
    id: "mark-resolved", label: "Mark Resolved",
    enabled: (context, target) => { const path = target ?? (context.section === "changes" ? context.selectedFile : null); return context.hasRepository && !context.busy && !!path && context.conflicted.includes(path); },
    run: (context, target) => context.run.markResolved((target ?? context.selectedFile)!),
  },
  {
    id: "copy-ref-name", label: "Copy Name",
    enabled: (context, target) => !!ref(context, target),
    run: (context, target) => context.run.copyText(ref(context, target)!.ref.name),
  },
  { id: "stash-changes", label: "Stash Changes…", shortcut: "Cmd+Alt+s", enabled: canStash, run: context => context.run.stashChanges(false) },
  { id: "stash-all-changes", label: "Stash Changes Including Untracked…", shortcut: "Cmd+Alt+Shift+s", enabled: canStash, run: context => context.run.stashChanges(true) },
  { id: "apply-stash", label: "Apply Stash", enabled: (context, target) => canWriteBranch(context) && !!stash(context, target), run: (context, target) => context.run.applyStash(stash(context, target)!.oid) },
  { id: "pop-stash", label: "Pop Stash", enabled: (context, target) => canWriteBranch(context) && !!stash(context, target), run: (context, target) => context.run.popStash(stash(context, target)!.oid) },
  { id: "drop-stash", label: "Drop Stash…", enabled: (context, target) => context.hasRepository && !context.branchBusy && !!stash(context, target), run: (context, target) => context.run.dropStash(stash(context, target)!.oid) },
  { id: "open-worktree", label: "Open Worktree in New Window", shortcut: "Cmd+Shift+o", enabled: (context, target) => !!openable(context, target), run: (context, target) => context.run.openWorktree(openable(context, target)!.path) },
  {
    // ⌘↓ (Finder's Open) in the Review Queue, enabled only while a queued worktree is selected. A plain Return key
    // equivalent would take Return from the window's text fields, and Spark's sidebar sends no key events (Spark ask).
    id: "open-review-worktree", label: "Open Queued Worktree", shortcut: "Cmd+Down",
    enabled: context => { const entry = queueEntry(context.queue, context.section); return entry?.kind === "worktree" && !!openable(context, entry.path); },
    run: context => { const entry = queueEntry(context.queue, context.section); if (entry?.kind === "worktree") context.run.openWorktree(entry.path); },
  },
  { id: "new-worktree", label: "New Worktree…", enabled: context => canWriteBranch(context) && !!context.worktrees, run: context => context.run.newWorktree() },
  {
    id: "remove-worktree", label: "Remove Worktree…",
    // Not the main worktree, and not the one this window shows (one open in another window is refused when run).
    enabled: (context, target) => { const entry = worktree(context, target); return context.hasRepository && !context.branchBusy && !!entry && !entry.main && entry.path !== context.root; },
    run: (context, target) => context.run.removeWorktree(worktree(context, target)!.path),
  },
  {
    id: "reveal-worktree", label: "Reveal in Finder",
    enabled: (context, target) => { const entry = worktree(context, target); return !!entry && entry.prunable === null; },
    run: (context, target) => context.run.revealInFinder(worktree(context, target)!.path),
  },
] as const satisfies readonly Command[];

export type CommandId = (typeof commands)[number]["id"];
const byId = new Map<string, Command>(commands.map(command => [command.id, command]));

export function commandLabel(id: CommandId, context: CommandContext) {
  const { label } = byId.get(id)!;
  return typeof label === "function" ? label(context) : label;
}

export const commandEnabled = (id: CommandId, context: CommandContext, target?: string) => byId.get(id)!.enabled(context, target);

/** Runs a command by id if it exists and is enabled now; unknown ids (other menus, other windows) are ignored. */
export function runCommand(id: string, context: CommandContext, target?: string) {
  const command = byId.get(id);
  if (!command?.enabled(context, target)) return false;
  command.run(context, target);
  return true;
}

/** A menu bar or context menu entry for a command; the shortcut is left out of context menus. */
export function commandMenuItem(id: CommandId, context: CommandContext, { target, shortcut = true }: { target?: string; shortcut?: boolean } = {}) {
  const command = byId.get(id)!;
  return {
    type: "action" as const, id, label: commandLabel(id, context),
    ...(shortcut && command.shortcut ? { shortcut: command.shortcut } : {}),
    disabled: !command.enabled(context, target),
  };
}
