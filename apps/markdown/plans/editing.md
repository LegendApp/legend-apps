# Editing And Document Transactions

## Goal

Define the core edit operations for the markdown app. Editing should update canonical markdown source, keep stable in-memory block IDs, and return small patches that let JS update the virtualized block list without refetching the whole document.

Normal typing should not reparse the full document. The active enriched markdown editor owns inline parsing/editing for the active block, then commits markdown changes back into the document model.

## Core Operations

Use document transactions instead of exposing raw whole-document source ranges to the UI:

```ts
type MarkdownTransaction =
  | {
      type: "updateBlockMarkdown";
      blockId: string;
      markdown: string;
    }
  | {
      type: "splitBlock";
      blockId: string;
      offsetUtf16: number;
    }
  | {
      type: "mergeWithPrevious";
      blockId: string;
    }
  | {
      type: "replaceBlocks";
      blockIds: string[];
      markdown: string;
    };

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

The native document/session should own transaction application because it already owns source ranges, parsing, lazy block lookup, and ID allocation.

## Offset Contract

Editor-facing APIs should use block-local UTF-16 offsets, because React Native text selection and JS strings use UTF-16 code units.

Native may store UTF-8 byte ranges internally for source/file efficiency. Conversion between block-local UTF-16 offsets and source byte ranges should stay inside the native document session.

Blocks should expose explicit range metadata:

```ts
type MarkdownBlockRecord = {
  id: string;
  type: string;
  sourceStartByte: number;
  sourceEndByte: number;
  contentStartByte: number;
  contentEndByte: number;
  textRevision: number;
};
```

Avoid passing global source offsets through the editor UI. Commands should target `blockId` and block-local offsets.

## Transaction Responsibilities

### `updateBlockMarkdown`

Use this for normal active-block editing. It replaces the markdown source for one existing block, preserves the block ID, updates that block's render snapshot/revision, shifts later source ranges, and returns a one-block patch.

This path should not perform a full-document reparse.

If the replacement markdown is known to stay within the same structural block type, it can be applied directly. If it may change block structure, promote the operation to `replaceBlocks` or dirty-region reparse.

### `splitBlock`

Use this for Enter-like behavior. Split keeps the original ID on the first/left block and allocates IDs for new blocks.

### `mergeWithPrevious`

Use this for Backspace/Delete-at-boundary behavior. Merge keeps the earlier block ID and retires the merged-away ID.

### `replaceBlocks`

Use this for paste, whole-block selection replacement, raw markdown fallback edits, and other ambiguous operations that may produce a different number or shape of blocks.

## Parser Use

Parsing should be used when markdown structure might change:

- initial document load
- document/file replacement
- external file reload
- paste or whole-block replacement
- raw markdown fallback edits
- parser setting changes
- recovery from invariant failure
- edits that can cross block boundaries or reinterpret neighboring blocks

For ambiguous edits, start with a dirty markdown region instead of a full-document reparse:

- touched block
- neighboring blank-line boundaries
- full fenced code block when editing inside one
- full list/table region when needed
- one adjacent block before/after when markdown ambiguity requires it

Each parsed block must include ID, type, source range, and content range.

## ID Rules

- Same logical block keeps its ID.
- Split keeps the original ID on the first/left block and allocates IDs for new blocks.
- Merge keeps the earlier block ID and retires the other IDs.
- Insert and paste allocate new IDs.
- Delete retires removed IDs.

## Native Indexes

Native should keep:

```ts
blocksByIndex
indexById
sourceRangesById
```

Transactions should return patches to JS. JS applies `changedRange` to its ordered `blockIds` array and updates `blocksById` for `changedBlocks`.

Use range patches as the initial native-to-JS update shape:

- document revision
- start block index
- delete count
- inserted block IDs
- changed block snapshots
- retired block IDs

## Full Reparse Policy

Full-document reparse is not the intended normal edit path. It is acceptable for initial load, file replacement, external reload, parser setting changes, recovery, or as a temporary implementation fallback while validating the editor model.

If used as a phase-1 fallback after edits, it should be treated as scaffolding to remove. It should preserve IDs where possible and should not become the public editing contract.

## Phased Implementation

### Phase 1: Transaction API With Conservative Internals

Expose transaction-based editing immediately. Implement direct `updateBlockMarkdown` for the normal active-block path. Ambiguous transactions may temporarily use broader parsing internally while the document model and editor UX are proven.

### Phase 2: Dirty Region Reparse

Reparse only the expanded dirty markdown region for ambiguous structural edits and splice the resulting blocks into the native block array.

### Phase 3: Source Buffer And Offset Optimization

Optimize source storage and offset conversion after behavior is proven. Native can use UTF-8 byte offsets internally, with explicit conversion helpers for JS/editor UTF-16 selections.

## First Editor Scope

Start with block-level editing:

- one active editable block at a time
- source text remains canonical
- block IDs drive `LegendList`
- render and measurement caches are keyed by block ID plus content revision/hash
- undo/redo stores edit transactions and same-session ID restoration data

Avoid building a full rich-document abstraction until block identity, edit transactions, and native layout invalidation are working reliably.

## Layout Contract

Rely on `LegendList` layout change detection for row height changes. Do not remount rows or change React keys just to force measurement.

If `react-native-enriched-markdown` changes native intrinsic height after async render and the list cannot observe that as a real layout change, fix or work around that at the enriched markdown/native layout boundary. The document model should keep stable block IDs and should not use remounting as the primary layout invalidation strategy.
