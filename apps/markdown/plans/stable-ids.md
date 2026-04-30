# Stable Block IDs

## Goal

Build the markdown editor around in-memory block identity that is stable for the current editing session, while keeping markdown text clean and free of persisted IDs.

Markdown source remains the source of truth. Block IDs are session-local metadata used by the editor, virtualized list, render caches, measurements, selection state, and undo/redo.

## Decisions

- Do not save block IDs into markdown files.
- Generate opaque, monotonic IDs instead of deriving IDs from block indexes or fractional positions.
- Treat IDs as stable only within one open document session.
- On external file changes, either ignore self-saves or discard local session state and reload fresh from disk.
- Keep block order separately from block identity.
- Use block IDs, not indexes, as `LegendList` data and React keys.

## Shape

```ts
type BlockId = string;

type MarkdownEditorDocument = {
  sessionId: string;
  revision: number;
  source: string;
  blockIds: BlockId[];
  blocksById: Map<BlockId, MarkdownBlockRecord>;
  indexById: Map<BlockId, number>;
};

type MarkdownBlockRecord = {
  id: BlockId;
  type: string;
  sourceStart: number;
  sourceEnd: number;
  contentStart: number;
  contentEnd: number;
};
```

Native should own the ID allocator for parsed/lazy documents:

```ts
document.nextBlockId(); // e.g. "d7:b42"
```

Initial parse assigns IDs while native already walks the parsed blocks. Later insert/split/paste operations allocate from the same session counter.

## Rules

- Existing IDs never change.
- Deleted IDs are retired and never reused during the session.
- Split keeps the original ID for the first/left block and allocates IDs for new blocks.
- Merge keeps the earlier block ID and retires the merged-away IDs.
- Paste allocates new IDs.
- Move preserves IDs only when the edit operation explicitly represents a move.
- Undo within the same session may restore retired IDs when reversing deletes/splits/merges.

## List Integration

Use IDs as row identity:

```tsx
<LegendList
  data={document.blockIds}
  keyExtractor={(id) => id}
  renderItem={({ item: blockId }) => {
    const block = document.blocksById.get(blockId);
    // render block
  }}
/>
```

Indexes remain useful as current ordering/addressing data, but they should not be used as durable identity or cache keys.

## Why This Model

This is simpler than fractional IDs because order and identity stay separate. Inserts, deletes, splits, and merges update `blockIds`, while row state and measurement caches remain attached to stable opaque IDs.

It is also simpler than persistent IDs because the markdown file stays normal. A reload creates a new session and new IDs.

