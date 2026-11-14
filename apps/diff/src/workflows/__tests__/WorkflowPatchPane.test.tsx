import { loadUnifiedDiff, type DiffDocument } from "@legend-apps/diff-parser";
import { observable } from "@legendapp/state";
import { act, fireEvent, render, waitFor } from "@testing-library/react-native";
import { WorkflowPatchPane, type WorkflowPatchViewerProps } from "../WorkflowPatchPane";
import { applyWorkflowPatch, reloadWorkflowPatchInput } from "../workflowPatch";
import { fixtureDocument, fixtureInput, patchSource, repoSource } from "../../story/__tests__/storyFixtures";
import type { DiffRowRenderState } from "../../viewer/DiffRows";

jest.mock("../workflowPatch", () => ({ ...jest.requireActual("../workflowPatch"), applyWorkflowPatch: jest.fn(), reloadWorkflowPatchInput: jest.fn() }));
jest.mock("../../window/DiffViewerPane", () => ({ DiffNativeRowConfigView: () => null }));
jest.mock("@legendapp/list/react-native", () => {
  const React = require("react");
  const { View } = require("react-native");
  const Cell = React.memo(({ item, renderItem }: { item: unknown; renderItem: (props: unknown) => unknown }) => renderItem({ item }),
    (before: { item: unknown; extraData: unknown }, after: { item: unknown; extraData: unknown }) => before.item === after.item && before.extraData === after.extraData);
  return { LegendList: ({ data, renderItem, extraData }: { data: unknown[]; renderItem: (props: unknown) => unknown; extraData: unknown }) => <View>{data.map((item, index) => <Cell key={index} item={item} extraData={extraData} renderItem={renderItem} />)}</View> };
});
function setup() {
  const input = fixtureInput(), fixture = fixtureDocument();
  const document = { ...fixture, rowCount: fixture.rows.length, documentId: 77, getHunkRowIndexes: () => [1, 4, 7],
    releaseNativeResources: jest.fn(), createSideBySideProjection: () => ({ rowCount: 0, projectionId: 1, releaseNativeResources: jest.fn(), setFileCollapsed: jest.fn() }),
  } as unknown as DiffDocument;
  jest.mocked(loadUnifiedDiff).mockResolvedValue({ document } as Awaited<ReturnType<typeof loadUnifiedDiff>>);
  const output = { contractVersion: 1 as const, kind: "patch" as const, summary: "Fix", description: "Correct spelling", patch: "diff --git a/a b/a\n", baseDiffHash: input.diffHash };
  const viewer = { viewMode: "unified", rowHeight: 20, rowRender$: observable({ presentation: { showOnlyHunks: false } } as DiffRowRenderState),
    unifiedConfig: { configId: "original", syntaxHighlightingEnabled: false }, blocksConfig: { configId: "original", syntaxHighlightingEnabled: false },
    splitPaneMetrics$: observable({}), foregroundColor: "#fff", mutedColor: "#888" } as unknown as WorkflowPatchViewerProps;
  return { input, output, document, props: { ...viewer, proposal: { output, source: repoSource, settings: { showOnlyHunks: false, ignoreWhitespaceChanges: false } }, currentHash: input.diffHash,
    onClose: jest.fn(), onDiscard: jest.fn(), onApplied: jest.fn() } };
}
beforeEach(() => { jest.clearAllMocks(); });

it("renders proposed native rows without applying, and guards drift and non-repository sources", async () => {
  const test = setup();
  const screen = await render(<WorkflowPatchPane {...test.props} currentHash="different" />);
  await waitFor(() => expect(loadUnifiedDiff).toHaveBeenCalled());
  expect(screen.getByLabelText("Apply")).toBeDisabled();
  expect(screen.getByText(/base diff changed/)).toBeTruthy();
  expect(applyWorkflowPatch).not.toHaveBeenCalled();
  expect(JSON.stringify(screen.toJSON())).toContain("workflow-patch:77:unified");
  await screen.rerender(<WorkflowPatchPane {...test.props} proposal={{ ...test.props.proposal, source: patchSource }} />);
  expect(screen.getByLabelText("Apply")).toBeDisabled();
  expect(screen.getByText(/not a repository/)).toBeTruthy();
  expect(screen.getByLabelText("Copy patch")).not.toBeDisabled();
  await fireEvent.press(screen.getByLabelText("Discard")); expect(test.props.onDiscard).toHaveBeenCalled();
  await screen.unmount();
});

it("keeps Apply busy, uses the original context and a fresh reload, and reports Git errors", async () => {
  const test = setup();
  let reject!: (reason: Error) => void;
  jest.mocked(applyWorkflowPatch).mockImplementationOnce(() => new Promise((_resolve, fail) => { reject = fail; }));
  const screen = await render(<WorkflowPatchPane {...test.props} />);
  await waitFor(() => expect(screen.getByLabelText("Apply")).not.toBeDisabled());
  await fireEvent.press(screen.getByLabelText("Apply"));
  expect(screen.getByLabelText("Applying…")).toBeDisabled();
  const context = jest.mocked(applyWorkflowPatch).mock.calls[0][1];
  expect(context.source).toBe(repoSource);
  await context.reloadInput(context.signal);
  expect(reloadWorkflowPatchInput).toHaveBeenCalledWith(repoSource, test.props.proposal.settings, context.signal);
  await act(() => reject(new Error("Base changed before apply")));
  expect(screen.getByText("Apply failed: Base changed before apply")).toBeTruthy();
  expect(test.props.onApplied).not.toHaveBeenCalled();
  expect(screen.getByLabelText("Apply")).not.toBeDisabled();
  await screen.unmount();
  expect(context.signal?.aborted).toBe(true);
});

it("refreshes only after explicit successful Apply; empty patches remain copyable", async () => {
  const test = setup(); jest.mocked(applyWorkflowPatch).mockResolvedValue(undefined);
  const screen = await render(<WorkflowPatchPane {...test.props} />);
  await waitFor(() => expect(screen.getByLabelText("Apply")).not.toBeDisabled());
  await fireEvent.press(screen.getByLabelText("Apply"));
  await waitFor(() => expect(test.props.onApplied).toHaveBeenCalledTimes(1));
  await screen.rerender(<WorkflowPatchPane {...test.props} proposal={{ ...test.props.proposal, output: { ...test.output, patch: "" } }} />);
  expect(screen.getByLabelText("Apply")).toBeDisabled();
  expect(screen.getByLabelText("Copy patch")).not.toBeDisabled();
  await screen.unmount();
});

it("collapses and expands proposed files while retaining native source-row indexes", async () => {
  const test = setup();
  const screen = await render(<WorkflowPatchPane {...test.props} />);
  await waitFor(() => expect(screen.getByText("a.ts")).toBeTruthy());
  expect(JSON.stringify(screen.toJSON())).toContain('"rowIndex":3');
  await fireEvent.press(screen.getByText("a.ts"));
  expect(JSON.stringify(screen.toJSON())).not.toContain('"rowIndex":3');
  expect(screen.getByText("api.ts")).toBeTruthy();
  await fireEvent.press(screen.getByText("a.ts"));
  expect(JSON.stringify(screen.toJSON())).toContain('"rowIndex":3');
  await screen.unmount();
});

it("updates retained patch rows when the hunk-header setting changes without changing Apply provenance", async () => {
  const test = setup();
  const screen = await render(<WorkflowPatchPane {...test.props} />);
  await waitFor(() => expect(screen.getByText("a.ts")).toBeTruthy());
  expect(screen.queryByText(/Hunk 1:/)).toBeNull();
  await act(() => test.props.rowRender$.presentation.showOnlyHunks.set(true));
  expect(screen.getAllByText(/Hunk 1:/).length).toBeGreaterThan(0);
  await fireEvent.press(screen.getByLabelText("Apply"));
  const context = jest.mocked(applyWorkflowPatch).mock.calls[0][1];
  await context.reloadInput(context.signal);
  expect(reloadWorkflowPatchInput).toHaveBeenCalledWith(repoSource, { showOnlyHunks: false, ignoreWhitespaceChanges: false }, context.signal);
  await screen.unmount();
});
