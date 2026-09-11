# Legend Code

Legend Code is a single-file text editor prototype for macOS. It opens UTF-8 text files of any extension, including dotfiles and extensionless files, with native parsing, incremental syntax highlighting, and a virtualized line list. Recognized formats use the shared syntax language detection; unknown formats are plain text. Edits are not saved yet.

## Current scope

- open text files from Finder, the native Open dialog, launch arguments, or recent documents
- parse and tokenize source through `@legend-apps/syntax-parser`
- render only the visible line range and continue tokenizing in the background
- reload the open file after external file-system changes
- show progress for large-file loading and background highlighting
- customize the source font, font size, syntax theme, and syntax-highlighting toggle

Edits currently live in memory; the app does not modify source files. Its manifest supports macOS only.

## Run

From the repository root:

```sh
bun run code start macos
bun run code run macos
```

Open an existing development build without rebuilding:

```sh
bun run code open macos
```

The Code Metro server uses port `19094` by default.

## Validate

```sh
bun run typecheck
bun run code verify macos
```

Run `bun run test:code --runInBand` and `bun run test:source-editor`. Changes to shared parsing or native input should also run `bun run test:source-editor:native`.

## Key files

- `app.manifest.ts` declares the macOS identity, text document type, native modules, and release metadata.
- `src/App.tsx` owns document-app startup, menus, recents, and window orchestration.
- `src/CodeViewerWindow.tsx` owns file loading, watching, incremental highlighting, and virtualized rendering.
- `src/codeSettings.ts` and `src/SettingsWindow.tsx` define persisted appearance settings.
## Tree-sitter replacement (in progress)

Exercise the native backend during migration using:

```sh
bun run code run macos -- --syntax-backend=tree-sitter /absolute/path/example.tsx
```

The shared `SourceDocumentEditor` also accepts `syntaxBackend="tree-sitter"`.
Compiled coverage currently includes JavaScript/JSX, TypeScript/TSX, JSON/JSONC/JSONL,
CSS, Python, YAML, Markdown and MDX. Markdown/MDX include inline formatting, document
frontmatter, fenced languages from the compiled registry, and JSX/JavaScript in MDX.
Slides' HTML-style notes comments are retained via a documented grammar extension.
Remaining languages still use TextMate while the
migration is built; the approved target is to remove it and the backend selector
entirely. Code keeps background highlighting enabled; Diff will retain on-demand
highlighting on the same Tree-sitter engine.

Native grammar changes require `bun run code pods macos` and a debug rebuild.
A Metro reload cannot add the new parsers to an existing app binary.

Tree-sitter owns a separate serial-worker document mirror. Prefix colors arrive
before the full parse; full parses use cooperative slices without blocking the
input thread or abandoning progress on each keystroke. Themes reuse captured
tokens. See `packages/syntax-parser/TREE_SITTER_INTEGRATION_PLAN.md` for validation
and remaining limitations.
