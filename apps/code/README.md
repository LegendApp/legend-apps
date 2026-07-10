# Legend Code

Legend Code is a focused, read-only TypeScript source viewer for macOS. It is currently a performance-oriented app for opening large `.ts` and `.tsx` files with native parsing, incremental syntax highlighting, and a virtualized line list.

## Current scope

- open TypeScript and TSX files from Finder, the native Open dialog, launch arguments, or recent documents
- parse and tokenize source through `@legend-apps/syntax-parser`
- render only the visible line range and continue tokenizing in the background
- reload the open file after external file-system changes
- show line, token, native parse, and JavaScript load statistics in the viewer header
- customize the source font, font size, syntax theme, and syntax-highlighting toggle

The app is a viewer, not an editor: it does not modify source files. Its manifest currently supports macOS only.

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

There is no app-specific Code test suite yet. Changes to shared parsing or virtualization behavior should also run the relevant package tests.

## Key files

- `app.manifest.ts` declares the macOS identity, TypeScript document type, native modules, and release metadata.
- `src/App.tsx` owns document-app startup, menus, recents, and window orchestration.
- `src/CodeViewerWindow.tsx` owns file loading, watching, incremental highlighting, and virtualized rendering.
- `src/codeSettings.ts` and `src/SettingsWindow.tsx` define persisted appearance settings.
