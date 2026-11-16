import type { GitRefList, GitStash } from "@legend-apps/git-core";
import { searchScopes, type SearchScope } from "./gitHistory";
import { findRef } from "./gitRefs";

/** A sidebar item: Changes, History, a branch, remote branch or tag by its full ref name, or a stash by its oid. */
export type Section = "changes" | "history" | `ref:${string}` | `stash:${string}`;
export const sectionRef = (section: Section) => section.startsWith("ref:") ? section.slice(4) : null;
export const sectionStash = (section: Section) => section.startsWith("stash:") ? section.slice(6) : null;
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
  run: {
    openRepository(): void;
    toggleSidebar(): void;
    showSection(section: Section): void;
    refresh(): void;
    copySha(oid: string): void;
    openOnGitHub(oid: string): void;
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
    copyText(text: string): void;
    stashChanges(includeUntracked: boolean): void;
    applyStash(oid: string): void;
    popStash(oid: string): void;
    dropStash(oid: string): void;
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
/** The stash a stash command acts on: the context menu's, else the selected one. */
const stash = (context: CommandContext, target?: string) => {
  const oid = target ?? sectionStash(context.section);
  return context.stashes?.find(entry => entry.oid === oid) ?? null;
};
const canStash = (context: CommandContext) => canWriteBranch(context) && context.hasChanges && !context.busy;

export const commands = [
  { id: "open-repository", label: "Open Repository…", shortcut: "Cmd+o", enabled: () => true, run: context => context.run.openRepository() },
  { id: "toggle-sidebar", label: context => context.sidebarCollapsed ? "Show Sidebar" : "Hide Sidebar", shortcut: "Cmd+Ctrl+s", enabled: () => true, run: context => context.run.toggleSidebar() },
  { id: "show-changes", label: "Changes", shortcut: "Cmd+1", enabled: context => context.hasRepository, run: context => context.run.showSection("changes") },
  { id: "show-history", label: "History", shortcut: "Cmd+2", enabled: context => context.hasRepository, run: context => context.run.showSection("history") },
  { id: "refresh", label: "Refresh", shortcut: "Cmd+r", enabled: context => context.hasRepository, run: context => context.run.refresh() },
  { id: "copy-sha", label: "Copy SHA", shortcut: "Cmd+Shift+c", enabled: (context, target) => !!commit(context, target), run: (context, target) => context.run.copySha(commit(context, target)!) },
  {
    id: "open-github", label: "Open on GitHub",
    enabled: (context, target) => { const oid = commit(context, target); return !!oid && !!context.gitHubUrl(oid); },
    run: (context, target) => context.run.openOnGitHub(commit(context, target)!),
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
  { id: "commit", label: "Commit", shortcut: "Cmd+Enter", enabled: context => context.canCommit, run: context => context.run.commit() },
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
    id: "copy-ref-name", label: "Copy Name",
    enabled: (context, target) => !!ref(context, target),
    run: (context, target) => context.run.copyText(ref(context, target)!.ref.name),
  },
  { id: "stash-changes", label: "Stash Changes…", shortcut: "Cmd+Alt+s", enabled: canStash, run: context => context.run.stashChanges(false) },
  { id: "stash-all-changes", label: "Stash Changes Including Untracked…", shortcut: "Cmd+Alt+Shift+s", enabled: canStash, run: context => context.run.stashChanges(true) },
  { id: "apply-stash", label: "Apply Stash", enabled: (context, target) => canWriteBranch(context) && !!stash(context, target), run: (context, target) => context.run.applyStash(stash(context, target)!.oid) },
  { id: "pop-stash", label: "Pop Stash", enabled: (context, target) => canWriteBranch(context) && !!stash(context, target), run: (context, target) => context.run.popStash(stash(context, target)!.oid) },
  { id: "drop-stash", label: "Drop Stash…", enabled: (context, target) => context.hasRepository && !context.branchBusy && !!stash(context, target), run: (context, target) => context.run.dropStash(stash(context, target)!.oid) },
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
