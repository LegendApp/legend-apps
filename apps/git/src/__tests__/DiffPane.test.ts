import type { DiffRenderRow } from "@legend-apps/diff-parser";
import { diffPaneItems, lineTarget, nextLineSelection } from "../DiffPane";

jest.mock("@legend-apps/diff-parser", () => ({}));
jest.mock("@legendapp/spark/ui", () => ({ Button: "Button" }));
jest.mock("@legendapp/spark/ui/symbol", () => ({ SFSymbol: "SFSymbol" }));
jest.mock("react-native", () => ({ PlatformColor: (name: string) => name, StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1, absoluteFillObject: {} } }));

const row = (index: number, hunkIndex: number, changeType: number, oldLineNumber: number, newLineNumber: number) =>
  ({ index, kind: hunkIndex < 0 ? 0 : 2, fileIndex: 0, hunkIndex, oldLineNumber, newLineNumber, changeType, text: "", tokens: [] }) as DiffRenderRow;

it("maps native rows to hunk headers and changed-line keys, and extends or toggles a selection", () => {
  const items = diffPaneItems([row(0, -1, 3, -1, -1), row(1, 0, 0, 1, 1), row(2, 0, 2, 2, -1), row(3, 0, 1, -1, 2), row(4, 1, 1, -1, 9)]);
  expect(items.map(item => item.type === "hunk" ? `h${item.hunkIndex}` : item.key)).toEqual(["h0", null, "-2", "+2", "h1", "+9"]);
  let state = nextLineSelection(items, new Set(), null, 2, {});
  expect([...state.selected]).toEqual(["-2"]);
  state = nextLineSelection(items, state.selected, state.anchor, 5, { shift: true });
  expect([...state.selected]).toEqual(["-2", "+2", "+9"]);
  state = nextLineSelection(items, state.selected, state.anchor, 3, { meta: true });
  expect([...state.selected]).toEqual(["-2", "+9"]);
  expect(nextLineSelection(items, state.selected, state.anchor, 1, {})).toEqual(state);
});

it("maps a diff row to the line Blame Line acts on: removed lines on the old side under the old path", () => {
  const row = (changeType: number, oldLineNumber: number, newLineNumber: number) => ({ index: 0, kind: 0, fileIndex: 0, hunkIndex: 0, oldLineNumber, newLineNumber, changeType, text: "", tokens: [] });
  const patch = { path: "new.txt", file: { oldPath: "old.txt" } };
  expect(lineTarget(row(2, 4, 0), patch)).toEqual({ side: "old", line: 4, path: "old.txt" });
  expect(lineTarget(row(1, 0, 7), patch)).toEqual({ side: "new", line: 7, path: "new.txt" });
  expect(lineTarget(row(0, 3, 5), patch)).toEqual({ side: "new", line: 5, path: "new.txt" });
  expect(lineTarget(row(0, 0, 0), { path: "a.txt", file: null })).toBeNull();
});
