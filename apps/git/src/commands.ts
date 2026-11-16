export type Section = "changes" | "history";

/** What every command reads to decide its label and whether it is enabled, plus the actions it runs. */
export type CommandContext = {
  hasRepository: boolean;
  section: Section;
  sidebarCollapsed: boolean;
  busy: boolean;
  selectedCommit: string | null;
  gitHubUrl(oid: string): string | null;
  canApplyLines: boolean;
  linesLabel: string;
  canDiscardFile: boolean;
  canDiscardLines: boolean;
  canRestoreDiscard: boolean;
  generating: boolean;
  canGenerate: boolean;
  canCommit: boolean;
  run: {
    openRepository(): void;
    toggleSidebar(): void;
    showSection(section: Section): void;
    refresh(): void;
    copySha(oid: string): void;
    openOnGitHub(oid: string): void;
    applyLines(): void;
    discardFile(): void;
    discardLines(): void;
    restoreDiscard(): void;
    toggleGenerate(): void;
    commit(): void;
  };
};

/** `target` is a commit picked by a context menu; menu and toolbar commands act on the selection. */
export type Command = {
  id: string;
  label: string | ((context: CommandContext) => string);
  shortcut?: string;
  enabled(context: CommandContext, target?: string): boolean;
  run(context: CommandContext, target?: string): void;
};

const commit = (context: CommandContext, target?: string) => target ?? context.selectedCommit;

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
  { id: "apply-lines", label: context => context.linesLabel, shortcut: "Cmd+Shift+l", enabled: context => context.canApplyLines, run: context => context.run.applyLines() },
  { id: "discard-file", label: "Discard Changes to File…", shortcut: "Cmd+Shift+Backspace", enabled: context => context.canDiscardFile, run: context => context.run.discardFile() },
  { id: "discard-lines", label: "Discard Selected Lines…", enabled: context => context.canDiscardLines, run: context => context.run.discardLines() },
  { id: "restore-discard", label: "Restore Last Discard…", enabled: context => context.canRestoreDiscard, run: context => context.run.restoreDiscard() },
  {
    id: "generate-message", label: context => context.generating ? "Cancel Generating Commit Message" : "Generate Commit Message", shortcut: "Cmd+Alt+g",
    enabled: context => context.generating || context.canGenerate, run: context => context.run.toggleGenerate(),
  },
  { id: "commit", label: "Commit", shortcut: "Cmd+Enter", enabled: context => context.canCommit, run: context => context.run.commit() },
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
