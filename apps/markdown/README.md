# Legend Markdown

Local-first macOS Markdown editor app for Legend Desktop.

## Current Scope

The MVP is a single-document macOS editor focused on safe local file editing:

- open Markdown files from disk
- create an untitled document
- save, Save As, and autosave file-backed documents
- prompt before discarding dirty changes when opening another document, creating a new document, or quitting
- keep recent Markdown files and clean up missing paths after failed loads
- edit Markdown as blocks with rendered inactive blocks
- use native menus for file, undo/redo, formatting, settings, and font-size commands
- customize theme, font family, font size, line height, content width, and document density

## Run

From the repo root:

```sh
bun run markdown start
bun run markdown run macos
```

Use the already built app when appropriate:

```sh
bun run markdown open
```

## Validation

Baseline checks:

```sh
bun run typecheck
bun run markdown verify macos
```

Manual MVP checks before release:

- dirty file -> New/Open/Quit -> Cancel keeps the current document and edits
- dirty file -> New/Open/Quit -> Save persists changes before continuing
- dirty file -> New/Open/Quit -> Discard continues without saving
- untitled dirty document -> Save opens Save As and preserves edits when canceled
- open, edit, save, quit, reopen round trip preserves Markdown content
- undo/redo work after typing, splitting blocks, formatting, and saving
- appearance settings persist and update the editor
- missing recent or last-opened files are removed and fall back to an untitled document
- a large Markdown file remains scrollable after hydration

## Known Limitations

- macOS is the only supported release target for this app.
- The app is single-document first; tabs, workspaces, and multi-window behavior are deferred.
- External file watching and merge/conflict handling are not implemented.
- Source mode is not implemented.
- Custom theme import/export and in-app theme editing are deferred.
- Block-level clipboard behavior and advanced list editing still need dedicated validation.
