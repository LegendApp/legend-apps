import type { DiffNativeRowSelectionActionEvent } from "./DiffNativeRowConfigNativeComponent";

/** A host action in a diff row's context menu, shown while text is selected. `icon` is an SF Symbol name. */
export type DiffContextMenuItem = { id: string; text: string; icon?: string };

/**
 * A persistent highlight on one source row of the DiffDocument. Columns are UTF-16 offsets in the row text;
 * the native side clips them to the row and never splits a surrogate pair or a combining mark from its base.
 * `side` picks the column in the side-by-side ("blocks") presentation; without it both columns draw it.
 * Unified rows ignore `side`.
 */
export type DiffAnnotationHighlightRange = {
  rowIndex: number;
  side?: "old" | "new";
  startColumn: number;
  endColumn: number;
  /** CSS-style hex (#rgb, #rrggbb, #rrggbbaa); defaults to a translucent purple. */
  color?: string;
};

/**
 * What `onSelectionAction` reports. Rows are source row indexes into the DiffDocument and columns are
 * UTF-16 offsets in those rows' text; anchor/focus keep the drag direction, so focus can come first.
 * `side` is "old" or "new" in the side-by-side presentation and "unified" in the unified one, where the
 * host reads each row's change type. `selectedText` is what Copy would put on the pasteboard.
 */
export type DiffSelectionAction = Omit<DiffNativeRowSelectionActionEvent, "side"> & { side: "old" | "new" | "unified" };

export function encodeDiffContextMenuItems(items: readonly DiffContextMenuItem[]): string {
  const valid = items.filter(item => item.id.length > 0 && item.text.length > 0);
  return valid.length ? JSON.stringify(valid.map(({ id, text, icon }) => (icon ? { id, text, icon } : { id, text }))) : "";
}

export function encodeDiffAnnotationHighlightRanges(ranges: readonly DiffAnnotationHighlightRange[]): string {
  const valid = ranges.filter(range => Number.isInteger(range.rowIndex) && range.rowIndex >= 0
    && Number.isFinite(range.startColumn) && Number.isFinite(range.endColumn) && range.endColumn > range.startColumn);
  return valid.length ? JSON.stringify(valid.map(({ rowIndex, side, startColumn, endColumn, color }) => ({
    rowIndex, ...(side ? { side } : {}), startColumn, endColumn, ...(color ? { color } : {}),
  }))) : "";
}
