import { observable } from "@legendapp/state";
import type { DiffDocument } from "@legend-apps/diff-parser";
import { act, fireEvent, render } from "@testing-library/react-native";
import { DiffUnifiedRow, DiffSideBySideRow, type DiffRowRenderState } from "../../viewer/DiffRows";
import { fixtureDocument, fixtureInput } from "../../story/__tests__/storyFixtures";
import { workflowGutterModel, workflowReviewComments } from "../workflowReview";
import { workflowResult } from "./workflowFixtures";
import { builtInWorkflowSkills } from "../workflowSkills";

function setup() {
  const fixture = { ...fixtureDocument(), getSideBySideRow: jest.fn() }, input = fixtureInput();
  fixture.getSideBySideRow.mockReturnValue({ oldRowVisible: true, newRowVisible: true, oldRow: fixture.rows[2], newRow: fixture.rows[3] });
  const result = { ...workflowResult(builtInWorkflowSkills[0]), output: { contractVersion: 1 as const, kind: "comments" as const, summary: "Review", comments: [
    { ref: { hunk: "h1", side: "new" as const, startLine: 41, endLine: 41 }, severity: "warn" as const, body: "Review" },
    { ref: { hunk: "h1", side: "old" as const, startLine: 41, endLine: 41 }, severity: "error" as const, body: "Review old" },
  ] } };
  const comments = workflowReviewComments("review-risks", result, input, input, {});
  const gutter = { comments$: observable(workflowGutterModel(comments, input)), onOpen: jest.fn() };
  const rowRender$ = observable({ document: { current: fixture, collapsedFileIndexList: [] }, presentation: { showOnlyHunks: false } } as unknown as DiffRowRenderState);
  return { comments, gutter, rowRender$, props: { adaptiveRender: "normal" as const, collapsedFileIndexes$: observable(new Set<number>()), nativeConfigId: "original", nativeRowHeight: 20,
    onToggleFileCollapsed: jest.fn(), rowRender$, workflowGutter: gutter } };
}

it("adds markers to the shared unified native-only row and updates them without replacing native row identity", async () => {
  const test = setup();
  const screen = await render(<DiffUnifiedRow {...test.props} index={3} isFileHeader={false} hasHunkHeader={false} row={undefined} />);
  expect(screen.getByLabelText("1 workflow comment, new line 41")).toBeTruthy();
  expect(screen.queryByLabelText("1 workflow comment, old line 41")).toBeNull();
  await fireEvent.press(screen.getByLabelText("1 workflow comment, new line 41"));
  expect(test.gutter.onOpen).toHaveBeenCalledWith(test.comments[0]);
  expect(JSON.stringify(screen.toJSON())).toContain('"rowIndex":3');
  await act(() => test.gutter.comments$.set({}));
  expect(screen.queryByLabelText("1 workflow comment, new line 41")).toBeNull();
  expect(JSON.stringify(screen.toJSON())).toContain('"rowIndex":3');
  await screen.unmount();
});

it("places old and new markers on a shared projected row using source locations", async () => {
  const test = setup();
  const screen = await render(<DiffSideBySideRow {...test.props} index={94} listIndex={1} itemMetadata={{ itemId: 94, kind: "changed", fileIndex: 0, hunkIndex: 0, hunkStart: false, sourceStart: 2, sourceEnd: 4 }} row={undefined} />);
  expect(screen.getByLabelText("1 workflow comment, old line 41")).toBeTruthy();
  expect(screen.getByLabelText("1 workflow comment, new line 41")).toBeTruthy();
  expect(JSON.stringify(screen.toJSON())).toContain('"rowIndex":1');
  await screen.unmount();
});

it("does not materialize plain rows before any workflow comments exist", async () => {
  const test = setup(); test.gutter.comments$.set({});
  const document = test.rowRender$.document.current.peek() as DiffDocument;
  const read = jest.spyOn(document, "getPlainRows");
  const screen = await render(<DiffUnifiedRow {...test.props} index={999} isFileHeader={false} hasHunkHeader={false} row={undefined} />);
  expect(read).not.toHaveBeenCalled();
  expect(JSON.stringify(screen.toJSON())).toContain('"rowIndex":999');
  await screen.unmount();
});

it("looks up only the paired old and new lines, excluding neighboring replaced rows", async () => {
  const test = setup();
  const document = test.rowRender$.document.current.peek() as DiffDocument;
  const rows = document.getPlainRows(0, 4);
  const projected = { index: 1, kind: "change", fileIndex: 0, hunkIndex: 0, sourceStart: 1, sourceEnd: 4, newRowEqualsOldRow: false, oldRowVisible: true, newRowVisible: true, oldRow: rows[1], newRow: rows[3] };
  document.getSideBySideRow = jest.fn(() => projected) as DiffDocument["getSideBySideRow"];
  const screen = await render(<DiffSideBySideRow {...test.props} index={94} listIndex={1} itemMetadata={{ itemId: 94, kind: "changed", fileIndex: 0, hunkIndex: 0, hunkStart: false, sourceStart: 1, sourceEnd: 4 }} row={undefined} />);
  expect(screen.queryByLabelText("1 workflow comment, old line 41")).toBeNull();
  expect(screen.getByLabelText("1 workflow comment, new line 41")).toBeTruthy();
  await screen.unmount();
});
