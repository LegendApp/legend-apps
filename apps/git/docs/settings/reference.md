# Legend Git settings reference

<!-- Generated from apps/git/src/settings (schema.ts, commandMeta.ts); do not edit. -->

Settings files are JSON with `"version": 1`. Every key is optional; an omitted key inherits from the layer below (built-in defaults < preset < user < repository). Objects merge key by key; arrays and layout nodes replace whole. The JSON Schema is `apps/git/settings/git-settings.v1.schema.json`; check a file with `bun run git:settings check <file>`. Preset columns show what each preset sets.

## File keys

| Key | Type | Meaning |
|---|---|---|
| `$schema` | string | The schema URL; editors use it for completion. |
| `version` | integer 1–9007199254740991 | File format version; this app writes 1. |
| `name` | string | Shown in Import and the preset list. |
| `description` | string | Human notes. |
| `author` | string |  |
| `root` | string | The repository root a repository layer applies to (written by the app). |
| `extends` | `"sourcetree"` \\| `"fork"` \\| `"gitkraken"` | The base preset.<br>`"sourcetree"` SourceTree (default).<br>`"fork"` Fork.<br>`"gitkraken"` GitKraken. |

## Settings

| Key | Type | Default | SourceTree \| Fork \| GitKraken | Meaning |
|---|---|---|---|---|
| `appearance` | `"system"` \\| `"light"` \\| `"dark"` | `"system"` |  |  |  | Window appearance.<br>`"system"` Follow macOS.<br>`"light"` Always light.<br>`"dark"` Always dark. |
| `density` | `"compact"` \\| `"regular"` \\| `"comfortable"` | `"regular"` |  |  |  | Row height. Panels without their own density use the global one.<br>`"compact"` File/commit rows 20 pt, sidebar rows 24 pt.<br>`"regular"` File/commit rows 24 pt, sidebar rows 28 pt.<br>`"comfortable"` File/commit rows 28 pt, sidebar rows 32 pt. |
| `keybindings` | map of array of string |  |  |  |  | Key equivalents by command id; [] unbinds. |

### `theme`

Colors and code fonts.

| Key | Type | Default | SourceTree \| Fork \| GitKraken | Meaning |
|---|---|---|---|---|
| `theme.name` | string | `"Default"` |  |  |  |  |

#### `theme.fonts`

Code fonts; the UI font always follows macOS.

| Key | Type | Default | SourceTree \| Fork \| GitKraken | Meaning |
|---|---|---|---|---|
| `theme.fonts.code` | string | `"system-mono"` |  |  |  | Code font family; "system-mono" is the system monospaced font. |
| `theme.fonts.codeSize` | number 8–32 | `12` |  |  |  | Code font size. |

#### `theme.light`

Colors for one appearance.

| Key | Type | Default | SourceTree \| Fork \| GitKraken | Meaning |
|---|---|---|---|---|
| `theme.light.accent` | string | `"system:controlAccentColor"` |  |  |  | "#RRGGBB", "#RRGGBBAA", or "system:<NSColor name>" such as "system:systemGreen". |
| `theme.light.lanes` | array of string | `["#007AFF","#AF52DE","#FF2D55","#FF9500","#28CD41","#30B0C7","#5856D6","#A2845E","#FF3B30","#FFCC00","#00000042"]` |  |  |  | Graph lane colors; the last one is the overflow color. |

#### `theme.light.status`

File status colors.

| Key | Type | Default | SourceTree \| Fork \| GitKraken | Meaning |
|---|---|---|---|---|
| `theme.light.status.added` | string | `"#28CD41"` |  |  |  | "#RRGGBB", "#RRGGBBAA", or "system:<NSColor name>" such as "system:systemGreen". |
| `theme.light.status.modified` | string | `"#FF9500"` |  |  |  | "#RRGGBB", "#RRGGBBAA", or "system:<NSColor name>" such as "system:systemGreen". |
| `theme.light.status.deleted` | string | `"#FF3B30"` |  |  |  | "#RRGGBB", "#RRGGBBAA", or "system:<NSColor name>" such as "system:systemGreen". |
| `theme.light.status.renamed` | string | `"#007AFF"` |  |  |  | "#RRGGBB", "#RRGGBBAA", or "system:<NSColor name>" such as "system:systemGreen". |
| `theme.light.status.typeChanged` | string | `"#AF52DE"` |  |  |  | "#RRGGBB", "#RRGGBBAA", or "system:<NSColor name>" such as "system:systemGreen". |
| `theme.light.status.untracked` | string | `"#8E8E93"` |  |  |  | "#RRGGBB", "#RRGGBBAA", or "system:<NSColor name>" such as "system:systemGreen". |
| `theme.light.status.conflicted` | string | `"#FF3B30"` |  |  |  | "#RRGGBB", "#RRGGBBAA", or "system:<NSColor name>" such as "system:systemGreen". |

#### `theme.light.diff`

Diff colors.

| Key | Type | Default | SourceTree \| Fork \| GitKraken | Meaning |
|---|---|---|---|---|
| `theme.light.diff.addedLine` | string | `"#dafbe1"` |  |  |  | "#RRGGBB", "#RRGGBBAA", or "system:<NSColor name>" such as "system:systemGreen". |
| `theme.light.diff.removedLine` | string | `"#ffebe9"` |  |  |  | "#RRGGBB", "#RRGGBBAA", or "system:<NSColor name>" such as "system:systemGreen". |
| `theme.light.diff.addedWord` | string | `"#1a7f37"` |  |  |  | "#RRGGBB", "#RRGGBBAA", or "system:<NSColor name>" such as "system:systemGreen". |
| `theme.light.diff.removedWord` | string | `"#cf222e"` |  |  |  | "#RRGGBB", "#RRGGBBAA", or "system:<NSColor name>" such as "system:systemGreen". |
| `theme.light.diff.hunkHeader` | string | `"system:secondaryLabelColor"` |  |  |  | "#RRGGBB", "#RRGGBBAA", or "system:<NSColor name>" such as "system:systemGreen". |
| `theme.light.diff.gutter` | string | `"system:tertiaryLabelColor"` |  |  |  | "#RRGGBB", "#RRGGBBAA", or "system:<NSColor name>" such as "system:systemGreen". |
| `theme.light.diff.selection` | string | `"system:selectedContentBackgroundColor"` |  |  |  | "#RRGGBB", "#RRGGBBAA", or "system:<NSColor name>" such as "system:systemGreen". |

#### `theme.light.refs`

Ref label colors (refStyle "tinted").

| Key | Type | Default | SourceTree \| Fork \| GitKraken | Meaning |
|---|---|---|---|---|
| `theme.light.refs.localBranch` | string | `"#007AFF"` |  |  |  | "#RRGGBB", "#RRGGBBAA", or "system:<NSColor name>" such as "system:systemGreen". |
| `theme.light.refs.remoteBranch` | string | `"#8E8E93"` |  |  |  | "#RRGGBB", "#RRGGBBAA", or "system:<NSColor name>" such as "system:systemGreen". |
| `theme.light.refs.tag` | string | `"#FF9500"` |  |  |  | "#RRGGBB", "#RRGGBBAA", or "system:<NSColor name>" such as "system:systemGreen". |
| `theme.light.refs.head` | string | `"#28CD41"` |  |  |  | "#RRGGBB", "#RRGGBBAA", or "system:<NSColor name>" such as "system:systemGreen". |

#### `theme.dark`

Colors for one appearance.

| Key | Type | Default | SourceTree \| Fork \| GitKraken | Meaning |
|---|---|---|---|---|
| `theme.dark.accent` | string | `"system:controlAccentColor"` |  |  |  | "#RRGGBB", "#RRGGBBAA", or "system:<NSColor name>" such as "system:systemGreen". |
| `theme.dark.lanes` | array of string | `["#0A84FF","#BF5AF2","#FF375F","#FF9F0A","#32D74B","#40C8E0","#5E5CE6","#AC8E68","#FF453A","#FFD60A","#FFFFFF40"]` |  |  |  | Graph lane colors; the last one is the overflow color. |

#### `theme.dark.status`

File status colors.

| Key | Type | Default | SourceTree \| Fork \| GitKraken | Meaning |
|---|---|---|---|---|
| `theme.dark.status.added` | string | `"#32D74B"` |  |  |  | "#RRGGBB", "#RRGGBBAA", or "system:<NSColor name>" such as "system:systemGreen". |
| `theme.dark.status.modified` | string | `"#FF9F0A"` |  |  |  | "#RRGGBB", "#RRGGBBAA", or "system:<NSColor name>" such as "system:systemGreen". |
| `theme.dark.status.deleted` | string | `"#FF453A"` |  |  |  | "#RRGGBB", "#RRGGBBAA", or "system:<NSColor name>" such as "system:systemGreen". |
| `theme.dark.status.renamed` | string | `"#0A84FF"` |  |  |  | "#RRGGBB", "#RRGGBBAA", or "system:<NSColor name>" such as "system:systemGreen". |
| `theme.dark.status.typeChanged` | string | `"#BF5AF2"` |  |  |  | "#RRGGBB", "#RRGGBBAA", or "system:<NSColor name>" such as "system:systemGreen". |
| `theme.dark.status.untracked` | string | `"#98989D"` |  |  |  | "#RRGGBB", "#RRGGBBAA", or "system:<NSColor name>" such as "system:systemGreen". |
| `theme.dark.status.conflicted` | string | `"#FF453A"` |  |  |  | "#RRGGBB", "#RRGGBBAA", or "system:<NSColor name>" such as "system:systemGreen". |

#### `theme.dark.diff`

Diff colors.

| Key | Type | Default | SourceTree \| Fork \| GitKraken | Meaning |
|---|---|---|---|---|
| `theme.dark.diff.addedLine` | string | `"#17351f"` |  |  |  | "#RRGGBB", "#RRGGBBAA", or "system:<NSColor name>" such as "system:systemGreen". |
| `theme.dark.diff.removedLine` | string | `"#3a1d24"` |  |  |  | "#RRGGBB", "#RRGGBBAA", or "system:<NSColor name>" such as "system:systemGreen". |
| `theme.dark.diff.addedWord` | string | `"#7ee787"` |  |  |  | "#RRGGBB", "#RRGGBBAA", or "system:<NSColor name>" such as "system:systemGreen". |
| `theme.dark.diff.removedWord` | string | `"#ff7b72"` |  |  |  | "#RRGGBB", "#RRGGBBAA", or "system:<NSColor name>" such as "system:systemGreen". |
| `theme.dark.diff.hunkHeader` | string | `"system:secondaryLabelColor"` |  |  |  | "#RRGGBB", "#RRGGBBAA", or "system:<NSColor name>" such as "system:systemGreen". |
| `theme.dark.diff.gutter` | string | `"system:tertiaryLabelColor"` |  |  |  | "#RRGGBB", "#RRGGBBAA", or "system:<NSColor name>" such as "system:systemGreen". |
| `theme.dark.diff.selection` | string | `"system:selectedContentBackgroundColor"` |  |  |  | "#RRGGBB", "#RRGGBBAA", or "system:<NSColor name>" such as "system:systemGreen". |

#### `theme.dark.refs`

Ref label colors (refStyle "tinted").

| Key | Type | Default | SourceTree \| Fork \| GitKraken | Meaning |
|---|---|---|---|---|
| `theme.dark.refs.localBranch` | string | `"#0A84FF"` |  |  |  | "#RRGGBB", "#RRGGBBAA", or "system:<NSColor name>" such as "system:systemGreen". |
| `theme.dark.refs.remoteBranch` | string | `"#98989D"` |  |  |  | "#RRGGBB", "#RRGGBBAA", or "system:<NSColor name>" such as "system:systemGreen". |
| `theme.dark.refs.tag` | string | `"#FF9F0A"` |  |  |  | "#RRGGBB", "#RRGGBBAA", or "system:<NSColor name>" such as "system:systemGreen". |
| `theme.dark.refs.head` | string | `"#32D74B"` |  |  |  | "#RRGGBB", "#RRGGBBAA", or "system:<NSColor name>" such as "system:systemGreen". |

### `layout`

Window layout.

| Key | Type | Default | SourceTree \| Fork \| GitKraken | Meaning |
|---|---|---|---|---|
| `layout.active` | string | `"sourcetree"` |  |  |  | A name in `layouts` or a preset id. |
| `layout.layouts` | map of map of any |  |  |  |  | Named layouts; the presets' layouts are named after them. |

### `panels`

Options per panel.

#### `panels.commitList`

The commit list (History, refs, review branches).

| Key | Type | Default | SourceTree \| Fork \| GitKraken | Meaning |
|---|---|---|---|---|
| `panels.commitList.density` | `"compact"` \\| `"regular"` \\| `"comfortable"` |  |  |  |  | Row height. Panels without their own density use the global one.<br>`"compact"` File/commit rows 20 pt, sidebar rows 24 pt.<br>`"regular"` File/commit rows 24 pt, sidebar rows 28 pt.<br>`"comfortable"` File/commit rows 28 pt, sidebar rows 32 pt. |
| `panels.commitList.columns` | array of map of any | `[{"id":"graph"},{"id":"subject"},{"id":"author","width":160},{"id":"date","width":140},{"id":"sha","width":72}]` | `[{"id":"graph","width":120},{"id":"subject"},{"id":"date","width":140},{"id":"author","width":160},{"id":"sha","width":72}]` | `[{"id":"graph","width":90},{"id":"subject"},{"id":"author","width":140},{"id":"date","width":120},{"id":"sha","width":64}]` | `[{"id":"refs","width":180},{"id":"graph","width":220},{"id":"subject"}]` | Columns in display order. |
| `panels.commitList.refs` | `"inline"` \\| `"column"` \\| `"hidden"` | `"inline"` | `"inline"` | `"inline"` | `"column"` | Where branch and tag labels go.<br>`"inline"` Before the subject.<br>`"column"` In the refs column.<br>`"hidden"` Not shown. |
| `panels.commitList.refStyle` | `"text"` \\| `"tinted"` | `"text"` | `"text"` | `"text"` | `"tinted"` | Ref label style.<br>`"text"` Plain text.<br>`"tinted"` Theme ref color with a small SF Symbol. |
| `panels.commitList.showRemoteRefs` | boolean | `true` | `true` | `true` | `true` | Show remote branches. |
| `panels.commitList.showTags` | boolean | `true` | `true` | `true` | `true` | Show tags. |
| `panels.commitList.dateFormat` | `"relative"` \\| `"short"` \\| `"medium"` \\| `"iso"` | `"relative"` | `"medium"` | `"relative"` | `"relative"` | Date format.<br>`"relative"` "3 days ago".<br>`"short"` System short date.<br>`"medium"` System medium date and time.<br>`"iso"` ISO 8601. |
| `panels.commitList.highlightPulled` | boolean | `false` | `false` | `false` | `false` | Mark the commits the last pull brought in. |

#### `panels.commitList.graph`

Graph drawing.

| Key | Type | Default | SourceTree \| Fork \| GitKraken | Meaning |
|---|---|---|---|---|
| `panels.commitList.graph.style` | `"compact"` \\| `"wide"` | `"wide"` | `"wide"` | `"compact"` | `"wide"` | Graph style.<br>`"compact"` Narrow lanes.<br>`"wide"` Wide lanes. |
| `panels.commitList.graph.laneWidth` | number 8–24 | `12` | `14` | `10` | `20` | Lane width in points (8–24). |
| `panels.commitList.graph.nodeStyle` | `"dot"` \\| `"ring"` | `"dot"` | `"dot"` | `"ring"` | `"dot"` | Commit node shape.<br>`"dot"` Filled dot.<br>`"ring"` Hollow ring. |
| `panels.commitList.graph.lineWidth` | number 1–3 | `2` | `2` | `1.5` | `3` | Line width in points (1–3). |
| `panels.commitList.graph.maxLanes` | integer 4–24 | `12` | `12` | `12` | `16` | Lanes past this fold into the overflow color (4–24). |
| `panels.commitList.graph.colorBy` | `"lane"` \\| `"branch"` | `"lane"` | `"lane"` | `"branch"` | `"branch"` | Lane coloring.<br>`"lane"` Color by lane position.<br>`"branch"` A ref keeps its color across rows. |

#### `panels.commitDetails`

Commit details.

| Key | Type | Default | SourceTree \| Fork \| GitKraken | Meaning |
|---|---|---|---|---|
| `panels.commitDetails.showBody` | boolean | `true` | `true` | `true` | `true` | Show the message body. |
| `panels.commitDetails.showCommitter` | boolean | `true` | `true` | `true` | `true` | Show the committer when it differs from the author. |
| `panels.commitDetails.fileListPlacement` | `"below"` \\| `"beside"` \\| `"none"` | `"none"` | `"none"` | `"none"` | `"none"` | Where the details panel puts its own file list.<br>`"below"` Below the details.<br>`"beside"` Beside the details.<br>`"none"` Not inside the details. |

#### `panels.fileList`

File list options.

| Key | Type | Default | SourceTree \| Fork \| GitKraken | Meaning |
|---|---|---|---|---|
| `panels.fileList.density` | `"compact"` \\| `"regular"` \\| `"comfortable"` |  |  |  |  | Row height. Panels without their own density use the global one.<br>`"compact"` File/commit rows 20 pt, sidebar rows 24 pt.<br>`"regular"` File/commit rows 24 pt, sidebar rows 28 pt.<br>`"comfortable"` File/commit rows 28 pt, sidebar rows 32 pt. |
| `panels.fileList.style` | `"flat"` \\| `"tree"` | `"flat"` | `"flat"` | `"flat"` | `"flat"` | List shape.<br>`"flat"` One row per file.<br>`"tree"` Files grouped in folders. |
| `panels.fileList.sort` | `"path"` \\| `"name"` \\| `"status"` | `"path"` | `"path"` | `"path"` | `"path"` | Sort order.<br>`"path"` By full path.<br>`"name"` By file name.<br>`"status"` By status, then path. |
| `panels.fileList.showFolder` | boolean | `true` | `true` | `true` | `true` | Show the folder after the name (flat style). |
| `panels.fileList.stagingControl` | `"buttons"` \\| `"checkboxes"` | `"buttons"` | `"buttons"` | `"buttons"` | `"buttons"` | How files are staged.<br>`"buttons"` Stage/Unstage buttons.<br>`"checkboxes"` A checkbox per file (falls back to buttons until Spark has native checkboxes). |

#### `panels.unstaged`

File list options.

| Key | Type | Default | SourceTree \| Fork \| GitKraken | Meaning |
|---|---|---|---|---|
| `panels.unstaged.density` | `"compact"` \\| `"regular"` \\| `"comfortable"` |  |  |  |  | Row height. Panels without their own density use the global one.<br>`"compact"` File/commit rows 20 pt, sidebar rows 24 pt.<br>`"regular"` File/commit rows 24 pt, sidebar rows 28 pt.<br>`"comfortable"` File/commit rows 28 pt, sidebar rows 32 pt. |
| `panels.unstaged.style` | `"flat"` \\| `"tree"` | `"flat"` | `"flat"` | `"flat"` | `"tree"` | List shape.<br>`"flat"` One row per file.<br>`"tree"` Files grouped in folders. |
| `panels.unstaged.sort` | `"path"` \\| `"name"` \\| `"status"` | `"path"` | `"path"` | `"path"` | `"path"` | Sort order.<br>`"path"` By full path.<br>`"name"` By file name.<br>`"status"` By status, then path. |
| `panels.unstaged.showFolder` | boolean | `true` | `true` | `true` | `true` | Show the folder after the name (flat style). |
| `panels.unstaged.stagingControl` | `"buttons"` \\| `"checkboxes"` | `"buttons"` | `"checkboxes"` | `"buttons"` | `"buttons"` | How files are staged.<br>`"buttons"` Stage/Unstage buttons.<br>`"checkboxes"` A checkbox per file (falls back to buttons until Spark has native checkboxes). |

#### `panels.staged`

File list options.

| Key | Type | Default | SourceTree \| Fork \| GitKraken | Meaning |
|---|---|---|---|---|
| `panels.staged.density` | `"compact"` \\| `"regular"` \\| `"comfortable"` |  |  |  |  | Row height. Panels without their own density use the global one.<br>`"compact"` File/commit rows 20 pt, sidebar rows 24 pt.<br>`"regular"` File/commit rows 24 pt, sidebar rows 28 pt.<br>`"comfortable"` File/commit rows 28 pt, sidebar rows 32 pt. |
| `panels.staged.style` | `"flat"` \\| `"tree"` | `"flat"` | `"flat"` | `"flat"` | `"tree"` | List shape.<br>`"flat"` One row per file.<br>`"tree"` Files grouped in folders. |
| `panels.staged.sort` | `"path"` \\| `"name"` \\| `"status"` | `"path"` | `"path"` | `"path"` | `"path"` | Sort order.<br>`"path"` By full path.<br>`"name"` By file name.<br>`"status"` By status, then path. |
| `panels.staged.showFolder` | boolean | `true` | `true` | `true` | `true` | Show the folder after the name (flat style). |
| `panels.staged.stagingControl` | `"buttons"` \\| `"checkboxes"` | `"buttons"` | `"checkboxes"` | `"buttons"` | `"buttons"` | How files are staged.<br>`"buttons"` Stage/Unstage buttons.<br>`"checkboxes"` A checkbox per file (falls back to buttons until Spark has native checkboxes). |

#### `panels.changes`

File list options.

| Key | Type | Default | SourceTree \| Fork \| GitKraken | Meaning |
|---|---|---|---|---|
| `panels.changes.density` | `"compact"` \\| `"regular"` \\| `"comfortable"` |  |  |  |  | Row height. Panels without their own density use the global one.<br>`"compact"` File/commit rows 20 pt, sidebar rows 24 pt.<br>`"regular"` File/commit rows 24 pt, sidebar rows 28 pt.<br>`"comfortable"` File/commit rows 28 pt, sidebar rows 32 pt. |
| `panels.changes.style` | `"flat"` \\| `"tree"` | `"flat"` | `"flat"` | `"flat"` | `"flat"` | List shape.<br>`"flat"` One row per file.<br>`"tree"` Files grouped in folders. |
| `panels.changes.sort` | `"path"` \\| `"name"` \\| `"status"` | `"path"` | `"path"` | `"path"` | `"path"` | Sort order.<br>`"path"` By full path.<br>`"name"` By file name.<br>`"status"` By status, then path. |
| `panels.changes.showFolder` | boolean | `true` | `true` | `true` | `true` | Show the folder after the name (flat style). |
| `panels.changes.stagingControl` | `"buttons"` \\| `"checkboxes"` | `"buttons"` | `"buttons"` | `"buttons"` | `"buttons"` | How files are staged.<br>`"buttons"` Stage/Unstage buttons.<br>`"checkboxes"` A checkbox per file (falls back to buttons until Spark has native checkboxes). |

#### `panels.composer`

The commit composer.

| Key | Type | Default | SourceTree \| Fork \| GitKraken | Meaning |
|---|---|---|---|---|
| `panels.composer.bodyLines` | integer 1–40 | `4` | `4` | `4` | `4` | Visible message lines. |
| `panels.composer.showAmend` | boolean | `true` | `true` | `true` | `true` | Show Amend. |
| `panels.composer.showSignOff` | boolean | `false` | `false` | `false` | `false` | Show Sign Off. |
| `panels.composer.showGenerate` | boolean | `true` | `true` | `true` | `true` | Show Generate Commit Message. |

#### `panels.diff`

The diff.

| Key | Type | Default | SourceTree \| Fork \| GitKraken | Meaning |
|---|---|---|---|---|
| `panels.diff.mode` | `"unified"` \\| `"sideBySide"` | `"unified"` | `"unified"` | `"unified"` | `"sideBySide"` | Diff mode.<br>`"unified"` One column.<br>`"sideBySide"` Old and new side by side. |
| `panels.diff.sideBySideSplit` | `"vertical"` \\| `"horizontal"` | `"vertical"` | `"vertical"` | `"vertical"` | `"vertical"` | Side-by-side orientation.<br>`"vertical"` Old \| new columns.<br>`"horizontal"` Old above new. |
| `panels.diff.wrap` | boolean | `false` | `false` | `false` | `false` | Wrap long lines. |
| `panels.diff.contextLines` | integer 0–20 | `3` | `3` | `3` | `3` | Unchanged lines around each change (0–20). |
| `panels.diff.showWhitespace` | boolean | `false` | `false` | `false` | `false` | Draw whitespace characters. |
| `panels.diff.ignoreWhitespace` | `"none"` \\| `"trailing"` \\| `"all"` | `"none"` | `"none"` | `"none"` | `"none"` | Whitespace changes to ignore.<br>`"none"` Show every change.<br>`"trailing"` Ignore trailing whitespace.<br>`"all"` Ignore all whitespace changes. |
| `panels.diff.lineNumbers` | `"both"` \\| `"new"` \\| `"none"` | `"both"` | `"both"` | `"both"` | `"both"` | Line number gutters.<br>`"both"` Old and new.<br>`"new"` New only.<br>`"none"` None. |
| `panels.diff.hunkActions` | `"header"` \\| `"none"` | `"none"` | `"header"` | `"header"` | `"header"` | Hunk actions.<br>`"header"` Stage/Discard Hunk in hunk headers.<br>`"none"` No hunk buttons. |
| `panels.diff.density` | `"compact"` \\| `"regular"` \\| `"comfortable"` |  |  |  |  | Row height. Panels without their own density use the global one.<br>`"compact"` File/commit rows 20 pt, sidebar rows 24 pt.<br>`"regular"` File/commit rows 24 pt, sidebar rows 28 pt.<br>`"comfortable"` File/commit rows 28 pt, sidebar rows 32 pt. |

#### `panels.prDetails`

Pull request details.

| Key | Type | Default | SourceTree \| Fork \| GitKraken | Meaning |
|---|---|---|---|---|
| `panels.prDetails.showChecks` | boolean | `true` | `true` | `true` | `true` | Show CI checks. |

#### `panels.empty`

A blank pane; no options.

### `sidebar`

The sidebar.

| Key | Type | Default | SourceTree \| Fork \| GitKraken | Meaning |
|---|---|---|---|---|
| `sidebar.sections` | array of map of any | `[{"id":"workspace"},{"id":"reviewQueue"},{"id":"branches"},{"id":"remotes"},{"id":"tags"},{"id":"stashes"},{"id":"worktrees"},{"id":"pullRequests"}]` |  |  |  | Sections in display order; a section left out is hidden. |
| `sidebar.showCounts` | boolean | `true` |  |  |  | Show item counts. |

### `toolbar`

The window toolbar.

| Key | Type | Default | SourceTree \| Fork \| GitKraken | Meaning |
|---|---|---|---|---|
| `toolbar.displayMode` | `"iconAndLabel"` \\| `"iconOnly"` \\| `"labelOnly"` | `"iconAndLabel"` |  |  |  | Toolbar display mode.<br>`"iconAndLabel"` Icon and label.<br>`"iconOnly"` Icon only.<br>`"labelOnly"` Label only. |
| `toolbar.items` | array of `"branchPicker"` \\| `"viewSwitcher"` \\| `"search"` \\| `"networkProgress"` \\| `"space"` \\| `"flexibleSpace"` or commandId or map of any | `["toggle-sidebar","branchPicker","flexibleSpace","viewSwitcher","networkProgress","refresh","search"]` |  |  |  | Items in order. |

### `contextMenus`

Context menus by target; each list replaces the default whole.

| Key | Type | Default | SourceTree \| Fork \| GitKraken | Meaning |
|---|---|---|---|---|
| `contextMenus.commit` | array of menuEntry |  |  |  |  | The commit context menu. |
| `contextMenus.file` | array of menuEntry |  |  |  |  | The file context menu. |
| `contextMenus.branch` | array of menuEntry |  |  |  |  | The branch context menu. |
| `contextMenus.remoteBranch` | array of menuEntry |  |  |  |  | The remoteBranch context menu. |
| `contextMenus.tag` | array of menuEntry |  |  |  |  | The tag context menu. |
| `contextMenus.stash` | array of menuEntry |  |  |  |  | The stash context menu. |
| `contextMenus.worktree` | array of menuEntry |  |  |  |  | The worktree context menu. |
| `contextMenus.diffLine` | array of menuEntry |  |  |  |  | The diffLine context menu. |
| `contextMenus.pullRequest` | array of menuEntry |  |  |  |  | The pullRequest context menu. |
| `contextMenus.reviewEntry` | array of menuEntry |  |  |  |  | The reviewEntry context menu. |

## Layout rules

A layout has a `views` object with a required `default` tree and optional trees per view kind: `changes`, `history`, `ref`, `stash`, `worktree`, `review`, `pullRequest`. A missing or null kind uses `default`.
A tree is made of three node types:
- `{ "type": "split", "direction": "row" | "column", "children": [ { "node": <node>, "size"?, "minSize"?, "maxSize"?, "collapsible"?, "holdingPriority"? }, … ] }` with 2 to 4 children. `row` puts children side by side, `column` stacks them.
- `{ "type": "panel", "panel": <panel id>, "id"?, "options"? }`. Panel ids: `commitList`, `commitDetails`, `fileList`, `unstaged`, `staged`, `changes`, `composer`, `diff`, `prDetails`, `empty`. `options` overrides `panels.<panel>` for this pane only.
- `{ "type": "switch", "cases": [ { "when": <condition>, "node": <node> } ], "otherwise": <node> }`. Conditions: `fileSelected`, `commitSelected`, `operationInProgress`.
Rules checked on load (a view that breaks one falls back to the base preset's view, with an issue naming the node path):
- every view reaches a `diff` panel;
- a panel appears once per view unless each copy has its own `id` (different branches of a switch may repeat one);
- the panes' minimum sizes (default 120 pt each) fit a 960 × 542 pt content area;
- `options` validate against that panel's options.

## Toolbar entries

An entry is a command id (see [commands.md](commands.md)), `{ "command": <id>, "label"?, "symbol"? }`, or a widget: `branchPicker`, `viewSwitcher`, `search`, `networkProgress`, `space`, `flexibleSpace`.

## Context menu entries

An entry is a command id, `"separator"`, or `{ "submenu": <title>, "items": [ … ] }`. Each target's list replaces the built-in menu whole; entries that don't apply to what was clicked are left out when the menu opens.
