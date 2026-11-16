# Legend Git

A native macOS Changes view with a source-list sidebar and window toolbar.
Open Repository uses the system folder chooser and resolves nested folders and linked
worktrees. Select an unstaged or staged file and use Stage or Unstage; files with
changes in both the index and worktree appear in both lists. Repository watches
refresh status automatically. Commit, history, branches and hunk operations are deferred.

From the repository root:

```sh
bun run git run macos
bun run git start macos
bun run git verify macos
bun run test:git --runInBand
```

Spark generates the macOS host under `shell/.legend/spark/git-shared-debug`; no
app-specific native project or URL scheme is needed for this app.
