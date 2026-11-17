# @legend-apps/diff-parser

Native unified-diff and git parsing (`DiffDocument`, `DiffSideBySideProjection`, history and blame readers) plus the macOS row components that draw them: `DiffNativeRowConfig`, `DiffNativeRow`, `DiffHorizontalScroller` and `DiffMergeNativePane`.

## Selection actions and annotation highlights

Both are opt-in props on `DiffNativeRowConfig`. Without them the rows behave as before: right-click shows the default menu, and only search highlights are drawn.

```tsx
import {
  DiffNativeRowConfig,
  encodeDiffAnnotationHighlightRanges,
  encodeDiffContextMenuItems,
  type DiffSelectionAction,
} from "@legend-apps/diff-parser";

const contextMenuItems = encodeDiffContextMenuItems([{ id: "comment", text: "Comment for AI", icon: "text.bubble" }]);

<DiffNativeRowConfig
  {...config}
  contextMenuItems={contextMenuItems}
  onSelectionAction={event => queueComment(event.nativeEvent as DiffSelectionAction)}
  annotationHighlightRanges={encodeDiffAnnotationHighlightRanges([
    { rowIndex: 42, side: "new", startColumn: 4, endColumn: 19 },
  ])}
/>;
```

`contextMenuItems` (`{ id, text, icon? }`, `icon` an SF Symbol name) appear after Copy in a row's context menu while a non-empty selection exists. Choosing one fires `onSelectionAction` with:

| Field | Meaning |
|---|---|
| `actionId`, `itemText` | The chosen item |
| `side` | `"old"` or `"new"` in the side-by-side (`"blocks"`) presentation; `"unified"` in the unified one, where the host reads each row's change type |
| `anchorRowIndex`, `focusRowIndex` | Source row indexes into the `DiffDocument` (`DiffRenderRow.index`), not list or projection rows |
| `anchorColumn`, `focusColumn` | UTF-16 offsets in those rows' text, clipped to the row |
| `selectedText` | What Copy puts on the pasteboard: the selected part of each row on that side, joined with `\n` |

Anchor and focus keep the drag direction, so a backwards selection reports focus before anchor. An endpoint on a row with no text on the selected side (a file or hunk header, a row that only exists on the other side) moves to the nearest row inside the selection that has text. The payload is taken when the menu opens.

`annotationHighlightRanges` (`{ rowIndex, side?, startColumn, endColumn, color? }`) draws a persistent background and underline on each range, separate from search highlights and the selection, so a queued comment stays visible after the selection clears. Rows are source row indexes and columns UTF-16 offsets, as above. Ranges are clipped to the row and widened so they never split a surrogate pair or separate a combining mark, variation selector or ZWJ from the character before it. `side` limits a range to one column of the side-by-side presentation; unified rows ignore it. `color` takes `#rgb`, `#rrggbb` or `#rrggbbaa` and defaults to a translucent purple.

The selection and clipping rules live in `cpp/DiffRowSelection.hpp`; `tests/DiffRowSelection.test.cpp` covers them and runs first in `bun run test:diff-parser:native`.
