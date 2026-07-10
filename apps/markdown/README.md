# Legend Markdown

Legend Markdown is a local-first block Markdown editor for macOS. It combines rendered inactive blocks with direct editing, native document behavior, configurable formatting tools, and persistent appearance and hotkey settings.

## Current scope

- create untitled documents and open `.md`, `.markdown`, `.mdown`, `.mkd`, and `.mdx` files
- save, Save As, and optionally autosave file-backed documents
- prompt before discarding unsaved work when opening, creating, closing, or quitting
- restore the last document or start a new one according to the startup setting
- keep recent documents and reload a clean file after an external change
- edit Markdown as blocks with undo/redo and keyboard navigation
- format headings, emphasis, links, lists, quotes, code, dividers, and other supported block types through native menus and toolbars
- place the formatting toolbar above selections, at the top, at the bottom, or hide it
- customize toolbar contents and order
- customize display and layout themes, font family, font size, line height, content width, and document density
- customize editor hotkeys and load user-provided theme files

The app currently supports macOS and one document window at a time. It edits the Markdown document directly rather than exposing a separate raw-source mode.

## Run

From the repository root:

```sh
bun run markdown start macos
bun run markdown run macos
```

Open an existing development build without rebuilding:

```sh
bun run markdown open macos
```

The Markdown Metro server uses port `19092` by default.

## Validate

Run the editor's non-runtime suites and native parser checks with:

```sh
bun run test:markdown-editing
bun run markdown verify macos
bun run typecheck
```

The full runtime matrix is separate because it drives the macOS app:

```sh
bun run test:markdown-editing:all
```

Focused E2E scenarios are available for UI, selection, soft wrapping, code blocks, navigation, edit navigation, and theme reflow; see the `test:markdown-e2e:*` scripts in the root `package.json`.

## Key files

- `app.manifest.ts` declares the Markdown document types, macOS native modules, and release metadata.
- `src/App.tsx` owns startup, native menus, recents, and document-window orchestration.
- `src/MarkdownEditorWindow.tsx` owns the active session, file watching, editor surface, and toolbar placement.
- `src/useMarkdownDocumentSession.ts` and `src/useMarkdownDocumentEvents.ts` own save, transition, close, and quit behavior.
- `src/settings/` and `src/markdownSettings.ts` define editor, appearance, toolbar, and hotkey preferences.
- `packages/markdown-document/` contains the reusable document model and React surface.
