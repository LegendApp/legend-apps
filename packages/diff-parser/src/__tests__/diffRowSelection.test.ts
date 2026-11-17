import { encodeDiffAnnotationHighlightRanges, encodeDiffContextMenuItems } from "../diffRowSelection";

describe("diff row selection encoders", () => {
  it("encodes context menu items and drops incomplete ones", () => {
    expect(encodeDiffContextMenuItems([])).toBe("");
    expect(JSON.parse(encodeDiffContextMenuItems([
      { id: "comment", text: "Comment for AI", icon: "text.bubble" },
      { id: "plain", text: "Plain" },
      { id: "", text: "No id" },
      { id: "no-text", text: "" },
    ]))).toEqual([
      { id: "comment", text: "Comment for AI", icon: "text.bubble" },
      { id: "plain", text: "Plain" },
    ]);
  });

  it("encodes annotation ranges and drops ones that can never draw", () => {
    expect(encodeDiffAnnotationHighlightRanges([])).toBe("");
    expect(JSON.parse(encodeDiffAnnotationHighlightRanges([
      { rowIndex: 4, side: "new", startColumn: 1, endColumn: 3, color: "#8957e555" },
      { rowIndex: 5, startColumn: 0, endColumn: 400 },
      { rowIndex: 6, startColumn: 3, endColumn: 3 },
      { rowIndex: 7, startColumn: 4, endColumn: 2 },
      { rowIndex: -1, startColumn: 0, endColumn: 1 },
      { rowIndex: 1.5, startColumn: 0, endColumn: 1 },
      { rowIndex: 8, startColumn: Number.NaN, endColumn: 1 },
    ]))).toEqual([
      { rowIndex: 4, side: "new", startColumn: 1, endColumn: 3, color: "#8957e555" },
      { rowIndex: 5, startColumn: 0, endColumn: 400 },
    ]);
  });
});
