# MarkdownDocument Component API

## Direction

Build `MarkdownDocument` as a reusable package component from the start. The first API should use `filename + adapter`, with the app owning file choice and product shell behavior.

Future customization is a key product goal. The component should provide replaceable defaults and command/state APIs, not fixed app chrome.

## Component

```tsx
<MarkdownDocument
  filename={filename}
  adapter={adapter}
  theme={theme}
  style={style}
  contentContainerStyle={contentContainerStyle}
  markdownStyle={markdownStyle}
  onLoaded={handleLoaded}
  onDirtyChange={handleDirtyChange}
  onSaveStateChange={handleSaveStateChange}
  onError={handleError}
/>
```

## Adapter

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

The native adapter owns filesystem access, native parser sessions, source ranges, block allocation, and markdown patches.

## Commands

Expose a command ref or hook so the app can connect menus and shortcuts without reaching into internal state:

```ts
type MarkdownDocumentCommands = {
  save(): void;
  undo(): void;
  redo(): void;
  focus(): void;
  toggleBold(): void;
  toggleItalic(): void;
  insertLink(): void;
};
```

Inline formatting commands should route to the active enriched markdown editor when possible.

These commands are also the integration point for future custom top/bottom toolbars and formatting bars.

## Events

Initial events:

- `onLoaded`
- `onDirtyChange`
- `onSaveStateChange`
- `onError`
- selection/state event if the app toolbar needs to reflect active formatting

## Edit Result Shape

Use range patches from native to JS:

```ts
type MarkdownTransactionResult = {
  revision: number;
  sourceLength: number;
  changedRange: {
    startBlockIndex: number;
    deleteCount: number;
    blockIds: string[];
  };
  changedBlocks: MarkdownBlockSnapshot[];
  retiredBlockIds: string[];
};
```

JS applies the patch to its ordered `blockIds` and block snapshot cache.

## Editor Integration

Use the current `react-native-enriched-markdown` input API for v1:

- `onChangeMarkdown`
- `onChangeSelection`
- `onChangeState`
- focus/blur
- inline formatting commands
- link commands
- `getMarkdown`
- caret rect APIs

If block-editor behavior exposes a missing API, work around it first when practical. If the workaround is fragile or harmful, contribute the missing callback/command upstream.

Likely future requests, only if needed:

- backspace at start
- delete at end
- split/Enter interception
- paste classification
- explicit content-size change callback

## Layout

Rely on `LegendList` layout change detection. Do not key rows by revision or remount rows to force measurement.

If enriched markdown async rendering changes height without a list-visible layout event, handle that as a native layout invalidation issue in the enriched markdown integration.

## Undo/Redo

JS owns undo/redo for v1. Native transactions return enough patch and retired/restored ID metadata for JS to build undo entries and restore selection.

## Customization Direction

V1 should keep customization paths open even when it ships with simple defaults.

Markdown/document customization:

- all markdown styles configurable
- editor/input style configurable
- document width configurable
- document alignment configurable
- document padding configurable
- exported `defaultMarkdownStyle` for apps to spread/override

App shell customization:

- top toolbar contents and placement owned by the app
- bottom toolbar contents and placement owned by the app
- formatting bar contents, button size, and placement owned by the app
- menu/shortcut wiring uses `MarkdownDocument` commands

`MarkdownDocument` should not own fixed toolbar layouts, fixed button placements, or product-specific chrome. It should expose state and commands so a customizable shell can be built around it later.
