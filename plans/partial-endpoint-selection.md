# Partial Endpoint Selection

## Context

Block selection currently promotes a drag that leaves one item into whole-block selection. A future refinement could keep partial text selection at the first and last selected blocks while still selecting whole middle blocks.

The current native drag-outside path proves the important plumbing:

- Native can keep observing drag position while AppKit text selection is active.
- Native can emit drag events to JS for both rendered text and active text input.
- JS can convert window Y into a block and switch into block-selection mode without remounting the input.

## Feasible Native Piece

The missing native primitive is point-to-caret hit testing. On macOS, the rendered `NSTextView` and active input text view can use their layout manager and text container to convert a window point into a character index.

The native `selectionDragOutside` event could be extended with fields like:

```ts
{
  direction: "up" | "down" | "end";
  windowX: number;
  windowY: number;
  characterIndex?: number;
  isInsideTextBounds?: boolean;
}
```

## Hard Parts

Rendered text character indexes do not always map cleanly back to markdown offsets. Formatting markers, links, list prefixes, code fences, and entities can change the displayed string.

The document selection model would need to represent partial endpoints plus full middle blocks, for example:

```ts
{
  anchor: { blockId: string; markdownOffset: number };
  focus: { blockId: string; markdownOffset: number };
}
```

Selection visuals would probably need native text selection on the edge blocks plus JS block highlight rectangles for fully selected middle blocks.

Editing semantics get more complex. Replace/delete needs to preserve unselected text before the selected range in the first block and after the selected range in the last block while deleting any fully selected middle blocks.

## Likely Approach

1. Extend native drag-outside events with point-to-character data for rendered text and input text.
2. Add a markdown-aware mapping from rendered character index to markdown offset where possible.
3. Extend `MarkdownDocument` block selection state to support partial endpoints.
4. Update replace/delete transactions to preserve first/last block partial text.
5. Keep whole-block behavior as the fallback when native cannot produce a reliable markdown offset.
