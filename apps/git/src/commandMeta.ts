import type { CommandId } from "./commands";

/** Where a command may appear in a context menu (settings `contextMenus` keys). */
export const menuTargets = ["commit", "file", "branch", "remoteBranch", "tag", "stash", "worktree", "diffLine", "pullRequest", "reviewEntry"] as const;
export type MenuTarget = (typeof menuTargets)[number];

export const commandCategories = ["file", "edit", "view", "repository", "branch", "changes", "stash", "worktree", "github", "operation"] as const;
export type CommandCategory = (typeof commandCategories)[number];

/**
 * A command's static description for settings files, Settings and docs. The runtime label (`commands.ts`) can depend on
 * state; `title` cannot. Ids are part of the settings contract: a renamed command lists its old id in `aliases`.
 */
export type CommandMeta = {
  title: string;
  /** SF Symbol for toolbar use. */
  symbol?: string;
  /** A toolbar button's label when it is shorter than the title ("Merge" for Merge into Current Branch…). */
  toolbarLabel?: string;
  category: CommandCategory;
  /** Context menus it may appear in; omitted = menu bar and toolbar only. */
  targets?: readonly MenuTarget[];
  /** One sentence for docs and AI. */
  description: string;
  aliases?: readonly string[];
};

export const commandMeta = {
  "open-repository": { title: "Open Repository…", symbol: "folder", toolbarLabel: "Open", category: "file", description: "Choose a repository folder to open in a new window." },
  "undo-operation": { title: "Undo Last Operation", symbol: "arrow.uturn.backward", toolbarLabel: "Undo", category: "edit", description: "Takes back the newest commit, merge, rebase, reset, checkout or branch delete after showing what moves where." },
  "open-recent": { title: "Open Recent", category: "file", description: "Opens a recently opened repository (File ▸ Open Recent)." },
  "abort-operation": { title: "Abort Operation…", symbol: "xmark.octagon", category: "operation", description: "Aborts the merge, rebase, cherry-pick or revert Git has paused, after asking." },
  "continue-operation": { title: "Continue Operation", symbol: "play", category: "operation", description: "Continues the paused merge, rebase, cherry-pick or revert once conflicts are resolved." },
  "toggle-sidebar": { title: "Toggle Sidebar", symbol: "sidebar.left", category: "view", description: "Shows or hides the sidebar." },
  "show-changes": { title: "Show Changes", symbol: "square.and.pencil", category: "view", description: "Shows the working tree and staged changes." },
  "show-history": { title: "Show History", symbol: "clock", category: "view", description: "Shows the current branch's commit history." },
  "show-review": { title: "Show Review Queue", symbol: "tray.full", category: "view", description: "Shows the Review Queue: other worktrees with changes and branches with commits to push." },
  "push-review": { title: "Push Queued Branch", symbol: "arrow.up", category: "repository", targets: ["reviewEntry"], description: "Pushes (or publishes) the selected Review Queue entry's branch." },
  "fetch": { title: "Fetch", symbol: "arrow.down.circle", category: "repository", description: "Fetches from every remote." },
  "pull": { title: "Pull", symbol: "arrow.down", category: "repository", description: "Pulls the current branch from its upstream." },
  "push": { title: "Push", symbol: "arrow.up", category: "repository", description: "Pushes the current branch, or publishes it when it has no upstream." },
  "cancel-network": { title: "Stop Network Operation", symbol: "stop.circle", category: "repository", description: "Stops the running fetch, pull or push." },
  "refresh": { title: "Refresh", symbol: "arrow.clockwise", category: "view", description: "Re-reads the repository's status, refs and history." },
  "sign-in-github": { title: "Sign In to GitHub…", symbol: "person.crop.circle", category: "github", description: "Signs in to GitHub with GitHub CLI's token or a pasted one." },
  "sign-out-github": { title: "Sign Out of GitHub", category: "github", description: "Signs out of GitHub and forgets the token." },
  "review-pull-request": { title: "Review Pull Request…", symbol: "text.bubble", category: "github", description: "Opens the review sheet for the selected pull request." },
  "checkout-pull-request": { title: "Check Out Pull Request as Branch", symbol: "arrow.triangle.branch", category: "github", targets: ["pullRequest"], description: "Fetches the pull request into a local branch and checks it out." },
  "pull-request-worktree": { title: "Open Pull Request in New Worktree…", category: "github", targets: ["pullRequest"], description: "Fetches the pull request into a local branch and adds a worktree for it next to the repository." },
  "copy-sha": { title: "Copy SHA", symbol: "doc.on.doc", category: "edit", targets: ["commit"], description: "Copies the commit's full SHA." },
  "open-github": { title: "Open on GitHub", symbol: "safari", category: "github", targets: ["commit"], description: "Opens the commit, or the selected pull request, on GitHub." },
  "create-pull-request": { title: "Create Pull Request…", symbol: "arrow.triangle.pull", category: "github", targets: ["branch"], description: "Opens the Create Pull Request sheet for the current branch." },
  "show-file-history": { title: "Show File History", symbol: "clock.arrow.circlepath", category: "view", targets: ["file"], description: "Shows the commits that changed the file." },
  "show-all-history": { title: "Show All History", category: "view", description: "Leaves file history or search results and shows the full history again." },
  "blame-line": { title: "Blame Line", category: "view", targets: ["diffLine"], description: "Shows the commit that last changed the clicked diff line." },
  "compare-with-selected": { title: "Compare with Selected", category: "view", targets: ["commit"], description: "Diffs this commit against the commit selected in History." },
  "search-message": { title: "Search in Message", category: "view", description: "History search matches commit messages." },
  "search-author": { title: "Search in Author", category: "view", description: "History search matches commit authors." },
  "search-path": { title: "Search in Path", category: "view", description: "History search matches changed paths." },
  "search-content": { title: "Search in Content", category: "view", description: "History search matches added or removed text (git log -S)." },
  "apply-lines": { title: "Stage or Unstage Selected Lines", symbol: "checklist", category: "changes", targets: ["diffLine"], description: "Stages the selected unstaged lines, or unstages the selected staged lines." },
  "discard-file": { title: "Discard Changes to File…", symbol: "trash", category: "changes", targets: ["file"], description: "Discards the selected file's working tree changes after asking." },
  "discard-lines": { title: "Discard Selected Lines…", category: "changes", targets: ["diffLine"], description: "Discards the selected unstaged lines after asking." },
  "restore-discard": { title: "Restore Last Discard…", category: "changes", description: "Puts back the most recently discarded changes." },
  "stage-file": { title: "Stage File", symbol: "plus.circle", category: "changes", targets: ["file"], description: "Stages the file (a conflicted file is marked resolved)." },
  "unstage-file": { title: "Unstage File", symbol: "minus.circle", category: "changes", targets: ["file"], description: "Unstages the file." },
  "stage-all": { title: "Stage All", symbol: "plus.circle.fill", category: "changes", description: "Stages every unstaged file except conflicted ones." },
  "unstage-all": { title: "Unstage All", symbol: "minus.circle.fill", category: "changes", description: "Unstages every staged file." },
  "generate-message": { title: "Generate Commit Message", symbol: "sparkles", category: "changes", description: "Writes a commit message for the staged changes with the user's own AI CLI, or cancels a running one." },
  "commit": { title: "Commit", symbol: "checkmark.circle", category: "changes", description: "Commits the staged changes with the composer's message." },
  "checkout-ref": { title: "Check Out", symbol: "arrow.right.circle", category: "branch", targets: ["branch", "remoteBranch"], description: "Checks out the branch (a remote branch gets a tracking local branch)." },
  "switch-branch": { title: "Switch Branch…", symbol: "arrow.triangle.swap", category: "branch", description: "Asks for a branch name and checks it out." },
  "new-branch": { title: "New Branch…", symbol: "plus.square.on.square", toolbarLabel: "Branch", category: "branch", targets: ["commit", "branch", "remoteBranch", "tag"], description: "Creates a branch at HEAD, or at the commit or ref the menu was opened on." },
  "rename-branch": { title: "Rename Branch…", category: "branch", targets: ["branch"], description: "Renames a local branch." },
  "delete-branch": { title: "Delete Branch…", symbol: "trash", category: "branch", targets: ["branch"], description: "Deletes a local branch other than the current one, after asking." },
  "merge-ref": { title: "Merge into Current Branch…", symbol: "arrow.triangle.merge", toolbarLabel: "Merge", category: "branch", targets: ["branch", "remoteBranch"], description: "Merges a branch into the current branch after a confirm sheet." },
  "rebase-ref": { title: "Rebase Current Branch onto…", symbol: "arrow.up.and.down.and.sparkles", toolbarLabel: "Rebase", category: "branch", targets: ["branch", "remoteBranch"], description: "Rebases the current branch onto a branch after a confirm sheet." },
  "interactive-rebase-ref": { title: "Rebase Current Branch Interactively onto…", category: "branch", targets: ["branch", "remoteBranch"], description: "Opens the interactive rebase sheet for the current branch onto a branch." },
  "interactive-rebase-commit": { title: "Rebase Interactively onto This Commit…", category: "branch", targets: ["commit"], description: "Opens the interactive rebase sheet for the current branch onto the commit." },
  "cherry-pick-commit": { title: "Cherry-Pick Commit", category: "branch", targets: ["commit"], description: "Applies the commit onto the current branch." },
  "revert-commit": { title: "Revert Commit…", category: "branch", targets: ["commit"], description: "Adds a commit that undoes the commit, after asking." },
  "mark-resolved": { title: "Mark Resolved", symbol: "checkmark", category: "operation", targets: ["file"], description: "Stages a conflicted file, asking first when it still has conflict markers." },
  "use-ours": { title: "Use Ours", category: "operation", targets: ["file"], description: "Resolves a conflicted file with the current branch's side and stages it." },
  "use-theirs": { title: "Use Theirs", category: "operation", targets: ["file"], description: "Resolves a conflicted file with the incoming side and stages it." },
  "use-both": { title: "Use Both", category: "operation", targets: ["file"], description: "Resolves a conflicted file with both sides and stages it." },
  "copy-ref-name": { title: "Copy Name", category: "edit", targets: ["branch", "remoteBranch", "tag"], description: "Copies the branch or tag name." },
  "stash-changes": { title: "Stash Changes…", symbol: "tray.and.arrow.down", toolbarLabel: "Stash", category: "stash", description: "Stashes the working tree and staged changes." },
  "stash-all-changes": { title: "Stash Changes Including Untracked…", category: "stash", description: "Stashes all changes, untracked files included." },
  "apply-stash": { title: "Apply Stash", category: "stash", targets: ["stash"], description: "Applies the stash and keeps it." },
  "pop-stash": { title: "Pop Stash", symbol: "tray.and.arrow.up", toolbarLabel: "Pop", category: "stash", targets: ["stash"], description: "Applies the stash and drops it: the selected one, or the newest from a toolbar or the menu bar." },
  "drop-stash": { title: "Drop Stash…", symbol: "trash", category: "stash", targets: ["stash"], description: "Deletes the stash after asking." },
  "open-worktree": { title: "Open Worktree in New Window", symbol: "macwindow.badge.plus", category: "worktree", targets: ["worktree", "reviewEntry"], description: "Opens another worktree of this repository in its own window." },
  "open-review-worktree": { title: "Open Queued Worktree", category: "worktree", description: "Opens the Review Queue's selected worktree in its own window." },
  "new-worktree": { title: "New Worktree…", symbol: "plus.rectangle.on.folder", category: "worktree", description: "Adds a worktree for a branch next to the repository." },
  "remove-worktree": { title: "Remove Worktree…", category: "worktree", targets: ["worktree"], description: "Removes a linked worktree after asking." },
  "reveal-repository": { title: "Show in Finder", symbol: "folder", toolbarLabel: "Finder", category: "file", description: "Shows the repository's folder in Finder." },
  "reveal-worktree": { title: "Reveal in Finder", symbol: "folder", category: "worktree", targets: ["worktree", "reviewEntry"], description: "Shows the worktree's folder in Finder." },
} as const satisfies Record<CommandId, CommandMeta>;

export const commandIds = Object.keys(commandMeta) as CommandId[];

let aliasTable: Map<string, CommandId> | undefined;
const aliases = () => aliasTable ??= new Map(commandIds.flatMap(id => ((commandMeta[id] as CommandMeta).aliases ?? []).map(alias => [alias, id] as const)));

/** The current id for a settings file's command id (an alias of a renamed command resolves to its new id), or null. */
export function resolveCommandId(id: string): CommandId | null {
  return Object.hasOwn(commandMeta, id) ? id as CommandId : aliases().get(id) ?? null;
}
