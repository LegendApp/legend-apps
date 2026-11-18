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

## Panel options and theme

A pane's options are `panels.<panel>` with its layout node's `options` on top. Components
read the narrowest slice of the window's settings observable (`usePanelOptions("diff")`,
`useThemeTokens("lanes")`, `src/settings/panelOptions.tsx`), never a settings prop, so a diff
option or a diff color renders no list row (Jest guards this with React Profiler counts).

- **Diff**: one `DiffNativeRowConfig` per pane from `diffConfigProps` (`src/diffOptions.ts`):
  unified, or side by side through diff-parser's projection (`sideBySideSplit: "horizontal"`,
  old above new, is the unified order); line height from density and code size; colors,
  gutter, whitespace. Fewer than 3 context lines are trimmed from Git's patch (staging still
  applies Git's patch); `ignoreWhitespace` uses the parser's whitespace mode; `hunkActions:
  "none"` hides the hunk buttons. View ▸ Diff writes `panels.diff.mode`/`sideBySideSplit`.
- **Commit list**: one line per commit in the configured columns; right-click the column
  titles to show or hide a column or Reset Columns (written to the user file). Graph lane
  width, line width, node style, lane cap and coloring (by lane, or by the branch color the
  graph layout assigns) come from `graph`; refs inline, in the refs column or hidden, as text
  or `tinted` (theme ref color and a small SF Symbol, no capsules).
- **File lists**: Git's order (`sort: "path"`), name or status; `tree` groups files under a
  row per folder. `stagingControl: "checkboxes"` shows buttons until Spark has a checkbox
  (A9); `capabilityIssues` reports it at info level, as it does `wrap`, `lineNumbers: "new"`,
  more than 3 context lines and `ignoreWhitespace: "trailing"`, which draw the nearest
  supported way.
- **Appearance**: `appearance` (system, light or dark) is set on the window, so its title
  bar, toolbar and system colors follow it, and theme tokens resolve for it.
- **Density and theme**: row heights from `densityHeights` (`src/settings/theme.ts`);
  `system:<name>` colors resolve to hex per appearance once (native rows and SF Symbols
  can't take a PlatformColor); the last lane color is the overflow color.

## Toolbar, context menus and key bindings

All three name commands by registry id (`src/commandMeta.ts`: title, symbol, category,
context-menu targets, aliases for renamed ids; the runtime label, enabled state and default
shortcut live in `src/commands.ts`). Unknown ids stay in the file, are skipped and reported.
The builders are in `src/actions.ts`.

- **Toolbar**: `toolbar.items` in order: command ids (default symbol and short label),
  `{ command, label, symbol }`, and the widgets `branchPicker`, `viewSwitcher`, `search` (with
  its scope menu in History) and `networkProgress`. Spark's toolbar has one flexible space
  between leading and trailing items, so items before the first `flexibleSpace` lead; fixed
  `space`s are skipped. Spark shows icons only (no `displayMode` yet, ask S2): every button
  carries its symbol and label, and other modes are info-level capability issues. Without a
  repository only the commands that work without one show. The window sends the toolbar only
  when its items change, so a settings edit elsewhere sends nothing.
- **Context menus**: `contextMenus.<target>` (commit, file, branch, remoteBranch, tag, stash,
  worktree, diffLine, pullRequest, reviewEntry) replaces that menu's default list whole; the
  defaults reproduce the built-in menus. Menus are built when they open; entries that don't
  apply to what was clicked (Merge on the current branch, conflict picks on a clean file) are
  left out, separators never lead, trail or repeat, and a command whose targets don't include
  the menu's is skipped. Spark context menus have no submenus: a `{ submenu, items }` shows
  its items under a disabled title row.
- **Key bindings**: `keybindings.<id>` (Spark accelerator strings) replaces a command's
  default; `[]` unbinds. A combination bound twice keeps its first owner (settings bindings
  in file order, then defaults) and the loser is reported. The first binding is the menu
  item's key equivalent; extra bindings, and bindings of commands the menu bar doesn't list
  (Toggle Sidebar, say), go to a window-scoped Spark hotkey router.

## Settings window, sharing and AI

Legend Git ▸ Settings… (and View ▸ Customize Toolbar…) opens `src/settings/SettingsWindow.tsx`: General,
Layout, Panels (rows generated from the JSON Schema), Theme, Toolbar, Context Menus, Keyboard and Customize
with AI, on Spark's settings window with native controls. It shares the opening window's settings store
(`acquireGitSettings`: one store per repository for every window), so its *Apply To* popup edits that
repository's layer or the user layer, and an AI preview shows live in that window.

- **Export/Import** (`src/settings/sharing.ts`): exports keep only known, valid keys (never `root`, window
  state or tokens); imports summarize changes by area, back the layer up to `.bak`, then Replace or Apply on
  Top; Undo Import writes the previous text back.
- **Customize with AI** (`src/settings/customizeAI.ts`): runs the user's Claude/Codex CLI like commit
  messages do, with the AI reference, schema, effective settings and command ids; checks the reply, sends the
  problems back once, then previews it (`store.preview`) until Keep (`store.replace`) or Revert.
- **Docs** (`docs/settings/`): `reference.md`, `commands.md` and `ai-reference.md` are generated by
  `src/settings/docs.ts` and stale-checked in Jest; `customizing.md` and `examples/*.json` are hand-written,
  and every example validates in Jest.

```sh
GIT_SETTINGS_WRITE_DOCS=1 bun run test:git -t "settings docs"   # regenerate the docs
```

Panes render store state from observables (`settings$`, `issues$`, `layers$`), never from `store.layerFile()`
in render: the React Compiler memoizes such calls on the unchanged store. Colors use the macOS color panel
(`@legend-apps/color-picker`) plus a text field for `#RRGGBBAA` and `system:` names. Still Spark asks: a
checkbox/switch (A9; booleans use a two-segment control) and a toolbar context menu (S2), so Customize
Toolbar… is in the View menu.
