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

## Settings files

Layout, panel options, theme, toolbar, context menus and key bindings are data
(`src/settings/`). The zod definitions in `src/settings/schema.ts` are the single
source of truth; `settings/git-settings.v1.schema.json` is generated from them and a
Jest test fails when it is stale. Settings layer as built-in defaults < preset
(`src/settings/presets/*.json`, SourceTree by default) < `~/Library/Application Support/<app>/settings.json`
< `repositories/<sha1 of root>.json` beside it. Invalid values fall back per key,
unknown keys are kept on save, and a file from a newer version is read but never written.

```sh
bun run git:settings check <file...>   # issues in the app's format; exits 1 on errors
bun run git:settings schema            # regenerate the JSON Schema (--check to compare)
```

## Layouts

Each window opens the settings store for its repository and renders the active layout
(`src/layout/`): the sidebar sits in the native `SidebarSplitView` sidebar slot, and the
selected section's tree (`views.changes`, `history`, `ref`, `stash`, `worktree`, `review`,
`pullRequest`, else `default`) fills the content slot. Panels a section can't show are
dropped and their splits fold away; `switch` nodes follow `fileSelected`,
`commitSelected` and `operationInProgress`.

Until Spark has a general split view (ask S1), nested splits are fixed panes: a child's
`size` (at least `minSize`; in a column, taller when the panel's content needs it, as the
composer does) in points along the split, the rest shared, no draggable
dividers. Only the sidebar divider drags; its width and the collapsed sidebar are window
state in `state/<window id>.json`, recorded from settled (`ready`) resize events, never
from a drag in progress, and never in `settings.json`.

View ▸ Layout picks a preset's or a saved layout, saves the current one under a name
(Save Layout As…, written to `layout.layouts` in the user file), resets it, and moves the
pane clicked last left/right/up/down (Move Pane). Panels keep no expensive state: a diff
the layout moves reuses its document from the window's cache.
