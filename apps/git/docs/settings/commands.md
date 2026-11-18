# Legend Git commands

<!-- Generated from apps/git/src/settings (schema.ts, commandMeta.ts); do not edit. -->

Settings files name commands by id in `toolbar.items`, `contextMenus` and `keybindings`. Ids are stable; a renamed command keeps its old id as an alias. Context menu targets list where a command may appear; commands without targets belong to the menu bar and toolbar.

## File

| Id | Title | Default shortcut | Context menus | Description |
|---|---|---|---|---|
| `open-repository` | Open Repository… | Cmd+o |  | Choose a repository folder to open in a new window. |
| `open-recent` | Open Recent |  |  | Opens a recently opened repository (File ▸ Open Recent). |
| `reveal-repository` | Show in Finder |  |  | Shows the repository's folder in Finder. |

## Edit

| Id | Title | Default shortcut | Context menus | Description |
|---|---|---|---|---|
| `undo-operation` | Undo Last Operation |  |  | Takes back the newest commit, merge, rebase, reset, checkout or branch delete after showing what moves where. |
| `copy-sha` | Copy SHA | Cmd+Shift+c | commit | Copies the commit's full SHA. |
| `copy-ref-name` | Copy Name |  | branch, remoteBranch, tag | Copies the branch or tag name. |

## View

| Id | Title | Default shortcut | Context menus | Description |
|---|---|---|---|---|
| `toggle-sidebar` | Toggle Sidebar | Cmd+Ctrl+s |  | Shows or hides the sidebar. |
| `show-changes` | Show Changes | Cmd+1 |  | Shows the working tree and staged changes. |
| `show-history` | Show History | Cmd+2 |  | Shows the current branch's commit history. |
| `show-review` | Show Review Queue | Cmd+3 |  | Shows the Review Queue: other worktrees with changes and branches with commits to push. |
| `refresh` | Refresh | Cmd+r |  | Re-reads the repository's status, refs and history. |
| `show-file-history` | Show File History | Cmd+Shift+h | file | Shows the commits that changed the file. |
| `show-all-history` | Show All History |  |  | Leaves file history or search results and shows the full history again. |
| `blame-line` | Blame Line | Cmd+Alt+b | diffLine | Shows the commit that last changed the clicked diff line. |
| `compare-with-selected` | Compare with Selected |  | commit | Diffs this commit against the commit selected in History. |
| `search-message` | Search in Message |  |  | History search matches commit messages. |
| `search-author` | Search in Author |  |  | History search matches commit authors. |
| `search-path` | Search in Path |  |  | History search matches changed paths. |
| `search-content` | Search in Content |  |  | History search matches added or removed text (git log -S). |

## Repository

| Id | Title | Default shortcut | Context menus | Description |
|---|---|---|---|---|
| `push-review` | Push Queued Branch |  | reviewEntry | Pushes (or publishes) the selected Review Queue entry's branch. |
| `fetch` | Fetch | Cmd+Alt+f |  | Fetches from every remote. |
| `pull` | Pull | Cmd+Shift+Down |  | Pulls the current branch from its upstream. |
| `push` | Push | Cmd+Shift+Up |  | Pushes the current branch, or publishes it when it has no upstream. |
| `cancel-network` | Stop Network Operation | Cmd+. |  | Stops the running fetch, pull or push. |

## Branch

| Id | Title | Default shortcut | Context menus | Description |
|---|---|---|---|---|
| `checkout-ref` | Check Out |  | branch, remoteBranch | Checks out the branch (a remote branch gets a tracking local branch). |
| `switch-branch` | Switch Branch… | Cmd+Shift+b |  | Asks for a branch name and checks it out. |
| `new-branch` | New Branch… | Cmd+Shift+n | commit, branch, remoteBranch, tag | Creates a branch at HEAD, or at the commit or ref the menu was opened on. |
| `rename-branch` | Rename Branch… |  | branch | Renames a local branch. |
| `delete-branch` | Delete Branch… |  | branch | Deletes a local branch other than the current one, after asking. |
| `merge-ref` | Merge into Current Branch… |  | branch, remoteBranch | Merges a branch into the current branch after a confirm sheet. |
| `rebase-ref` | Rebase Current Branch onto… |  | branch, remoteBranch | Rebases the current branch onto a branch after a confirm sheet. |
| `interactive-rebase-ref` | Rebase Current Branch Interactively onto… |  | branch, remoteBranch | Opens the interactive rebase sheet for the current branch onto a branch. |
| `interactive-rebase-commit` | Rebase Interactively onto This Commit… |  | commit | Opens the interactive rebase sheet for the current branch onto the commit. |
| `cherry-pick-commit` | Cherry-Pick Commit |  | commit | Applies the commit onto the current branch. |
| `revert-commit` | Revert Commit… |  | commit | Adds a commit that undoes the commit, after asking. |

## Changes

| Id | Title | Default shortcut | Context menus | Description |
|---|---|---|---|---|
| `apply-lines` | Stage or Unstage Selected Lines | Cmd+Shift+l | diffLine | Stages the selected unstaged lines, or unstages the selected staged lines. |
| `discard-file` | Discard Changes to File… | Cmd+Shift+Backspace | file | Discards the selected file's working tree changes after asking. |
| `discard-lines` | Discard Selected Lines… |  | diffLine | Discards the selected unstaged lines after asking. |
| `restore-discard` | Restore Last Discard… |  |  | Puts back the most recently discarded changes. |
| `stage-file` | Stage File |  | file | Stages the file (a conflicted file is marked resolved). |
| `unstage-file` | Unstage File |  | file | Unstages the file. |
| `stage-all` | Stage All |  |  | Stages every unstaged file except conflicted ones. |
| `unstage-all` | Unstage All |  |  | Unstages every staged file. |
| `generate-message` | Generate Commit Message | Cmd+Alt+g |  | Writes a commit message for the staged changes with the user's own AI CLI, or cancels a running one. |
| `commit` | Commit | Cmd+Enter |  | Commits the staged changes with the composer's message. |

## Stash

| Id | Title | Default shortcut | Context menus | Description |
|---|---|---|---|---|
| `stash-changes` | Stash Changes… | Cmd+Alt+s |  | Stashes the working tree and staged changes. |
| `stash-all-changes` | Stash Changes Including Untracked… | Cmd+Alt+Shift+s |  | Stashes all changes, untracked files included. |
| `apply-stash` | Apply Stash |  | stash | Applies the stash and keeps it. |
| `pop-stash` | Pop Stash |  | stash | Applies the stash and drops it: the selected one, or the newest from a toolbar or the menu bar. |
| `drop-stash` | Drop Stash… |  | stash | Deletes the stash after asking. |

## Worktree

| Id | Title | Default shortcut | Context menus | Description |
|---|---|---|---|---|
| `open-worktree` | Open Worktree in New Window | Cmd+Shift+o | worktree, reviewEntry | Opens another worktree of this repository in its own window. |
| `open-review-worktree` | Open Queued Worktree | Cmd+Down |  | Opens the Review Queue's selected worktree in its own window. |
| `new-worktree` | New Worktree… |  |  | Adds a worktree for a branch next to the repository. |
| `remove-worktree` | Remove Worktree… |  | worktree | Removes a linked worktree after asking. |
| `reveal-worktree` | Reveal in Finder |  | worktree, reviewEntry | Shows the worktree's folder in Finder. |

## Github

| Id | Title | Default shortcut | Context menus | Description |
|---|---|---|---|---|
| `sign-in-github` | Sign In to GitHub… |  |  | Signs in to GitHub with GitHub CLI's token or a pasted one. |
| `sign-out-github` | Sign Out of GitHub |  |  | Signs out of GitHub and forgets the token. |
| `review-pull-request` | Review Pull Request… |  |  | Opens the review sheet for the selected pull request. |
| `checkout-pull-request` | Check Out Pull Request as Branch |  | pullRequest | Fetches the pull request into a local branch and checks it out. |
| `pull-request-worktree` | Open Pull Request in New Worktree… |  | pullRequest | Fetches the pull request into a local branch and adds a worktree for it next to the repository. |
| `open-github` | Open on GitHub | Ctrl+Cmd+g | commit | Opens the commit, or the selected pull request, on GitHub. |
| `create-pull-request` | Create Pull Request… | Cmd+Shift+r | branch | Opens the Create Pull Request sheet for the current branch. |

## Operation

| Id | Title | Default shortcut | Context menus | Description |
|---|---|---|---|---|
| `abort-operation` | Abort Operation… |  |  | Aborts the merge, rebase, cherry-pick or revert Git has paused, after asking. |
| `continue-operation` | Continue Operation |  |  | Continues the paused merge, rebase, cherry-pick or revert once conflicts are resolved. |
| `mark-resolved` | Mark Resolved |  | file | Stages a conflicted file, asking first when it still has conflict markers. |
| `use-ours` | Use Ours |  | file | Resolves a conflicted file with the current branch's side and stages it. |
| `use-theirs` | Use Theirs |  | file | Resolves a conflicted file with the incoming side and stages it. |
| `use-both` | Use Both |  | file | Resolves a conflicted file with both sides and stages it. |
