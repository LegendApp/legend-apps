# MarkdownDocument Architecture

## Direction

Open source the editor in two layers:

1. A reusable `MarkdownDocument` package/component.
2. A React Native macOS app that consumes it.

`MarkdownDocument` should be the editor surface, not just a renderer. It should own document loading, native parsing, block identity, list rendering, active-block editing, selection, edit transactions, dirty state, and document-level callbacks.

The app should own product shell concerns: windows, menus, file dialogs, recent files, app settings, autosave policy, and later tabs/workspaces.

Start as a real package rather than app-local source. The expected initial location is `packages/markdown-document`, consumed by `apps/markdown`.

Future UI customization should be protected from the start. `MarkdownDocument` should expose commands, state, styles, and layout props, while the app shell owns toolbar placement, button sizing, formatting bars, and other chrome.

## Package Boundary

The reusable package should expose:

- `MarkdownDocument`
- document/session hooks
- transaction types
- block snapshot types
- adapter interface
- command interface for menu/toolbar integrations

The app should not reach into native parser internals or list cache internals.

## Adapter Boundary

Keep platform-specific loading/editing behind an adapter so a future web app can reuse the editor model and React surface.

```ts
type MarkdownDocumentAdapter = {
  load(filename: string): Promise<MarkdownDocumentSnapshot>;
  applyTransaction(
    documentId: string,
    transaction: MarkdownTransaction,
  ): Promise<MarkdownTransactionResult>;
  getBlock(documentId: string, blockId: string): Promise<MarkdownBlockSnapshot>;
  save(documentId: string): Promise<void>;
  close(documentId: string): Promise<void>;
};
```

Native macOS can implement this with Nitro/native parsing and filesystem access. A future web adapter can use a JS/WASM parser and browser-specific file or storage APIs.

## Ownership

`MarkdownDocument` owns:

- native document session lifecycle
- block ID allocation semantics
- ordered `blockIds`
- `blocksById` cache
- `LegendList` rendering
- active block editor state
- document transactions
- selection model
- undo/redo integration points
- dirty state events
- command/state APIs for external chrome
- replaceable markdown/document style defaults

The app owns:

- choosing/opening files
- recent files
- menu commands and keyboard shortcuts
- window state
- app preferences
- autosave scheduling
- save prompts
- crash/session restore policy
- toolbar placement and contents
- button sizing and shell layout customization

## Web Sharing Goal

Share as much as possible above the adapter:

- block ID model
- transaction types
- selection model
- command model
- undo/redo data shape
- React editor surface
- inactive block rendering contract

Expect these to differ by platform:

- file loading/saving
- parser implementation
- native enriched editor implementation
- platform menus and keyboard shortcuts
- filesystem watching

## First Public API Shape

Start narrow:

```tsx
<MarkdownDocument
  filename={filename}
  adapter={adapter}
  onLoaded={handleLoaded}
  onDirtyChange={handleDirtyChange}
  onSaveRequested={handleSaveRequested}
/>
```

The first API should optimize for `filename + adapter`. The component owns document lifecycle through the adapter, while the app owns choosing the filename and app-level behavior.

Add command refs or hooks for app menus:

```ts
type MarkdownDocumentCommands = {
  save(): void;
  undo(): void;
  redo(): void;
  toggleBold(): void;
  toggleItalic(): void;
  insertLink(): void;
};
```

## Non-Goals

- Workspace/folder model in the reusable package.
- Persisted block IDs in markdown.
- App-specific recent-file persistence in the document package.
- Full source editor as the primary editing mode.
- Fixed app-shell chrome inside `MarkdownDocument`.
