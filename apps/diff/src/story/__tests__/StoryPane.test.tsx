import { loadUnifiedDiff, type DiffDocument } from "@legend-apps/diff-parser";
import { observable } from "@legendapp/state";
import { act, fireEvent, render } from "@testing-library/react-native";
import { StoryPane } from "../StoryPane";
import { StoryDescription } from "../StoryDescription";
import { createStoryReviewStore } from "../storyReview";
import type { DiffRowRenderState } from "../../viewer/DiffRows";
import type { DiffNativeRowConfigProps } from "../../window/diffWindowTypes";
import type { useDiffStory } from "../useDiffStory";
import { fixtureDocument, fixtureInput, fixtureResult, memoryStorage } from "./storyFixtures";

jest.mock("@legendapp/list/react-native", () => {
  const React = require("react");
  const { View } = require("react-native");
  const Cell = React.memo(({ item, index, renderItem }: { item: unknown; index: number; renderItem: (props: unknown) => unknown }) => renderItem({ item, index }),
    (previous: { item: unknown; extraData: unknown }, next: { item: unknown; extraData: unknown }) => previous.item === next.item && previous.extraData === next.extraData);
  return { LegendList: React.forwardRef(({ data, extraData, keyExtractor, renderItem }: {
    data: unknown[]; extraData: unknown; keyExtractor: (item: unknown) => string; renderItem: (props: unknown) => unknown;
  }, ref: unknown) => {
    React.useImperativeHandle(ref, () => ({ scrollToIndex: jest.fn() }));
    return <View>{data.map((item, index) => <Cell key={keyExtractor(item)} item={item} index={index} extraData={extraData} renderItem={renderItem} />)}</View>;
  }) };
});
jest.mock("../storyReview", () => ({ ...jest.requireActual("../storyReview"), getStoryReviewStore: () => mockReviews }));
jest.mock("../../window/DiffViewerPane", () => ({ DiffNativeRowConfigView: () => null }));
const mockReviews = createStoryReviewStore(memoryStorage());

function nativeRows(tree: unknown): unknown[] {
  if (Array.isArray(tree)) return tree.flatMap(nativeRows);
  if (!tree || typeof tree !== "object") return [];
  const node = tree as { props: { itemId?: number }; children?: unknown[] };
  return [...(node.props?.itemId !== undefined ? [node] : []), ...(node.children ?? []).flatMap(nativeRows)];
}
function setup(options: { partial?: boolean; status?: "done" | "progress" | "error"; stale?: boolean } = {}) {
  const document = { ...fixtureDocument(), documentId: 7,
    createSideBySideProjection: jest.fn(() => ({ releaseNativeResources: jest.fn() })),
    releaseNativeResources: jest.fn(), consumeTokenizedRowRanges: () => [],
  } as unknown as DiffDocument;
  jest.mocked(loadUnifiedDiff).mockResolvedValue({ document } as Awaited<ReturnType<typeof loadUnifiedDiff>>);
  const input = fixtureInput();
  const result = fixtureResult(input);
  if (options.partial) result.story.sections[0].refs = [{ hunk: "h1", side: "new", startLine: 41, endLine: 41 }];
  const controller = {
    story: { status: options.status ?? "done", result, input, progress: { phase: "output", receivedBytes: 123 }, error: options.status === "error" ? { message: "Validator: title required", rawOutput: "<script>bad()</script>" } : null },
    notice: null, preparing: false, error: null, skills: [], skillErrors: [], editSkill: jest.fn(),
    request: { input: options.stale ? fixtureInput({ text: "changed" }) : input, tool: "codex" },
    tool: "codex", setTool: jest.fn(), generate: jest.fn(), cancel: jest.fn(), consent: jest.fn(), disable: jest.fn(),
  } as unknown as ReturnType<typeof useDiffStory>;
  controller.story$ = observable(controller.story);
  const config = { configId: "files", syntaxHighlightingEnabled: false } as DiffNativeRowConfigProps;
  return { document, controller, props: { controller, viewMode: "unified" as const, rowHeight: 20,
    rowRender$: observable({ presentation: { showOnlyHunks: true } } as DiffRowRenderState),
    collapsedFileIndexes$: observable(new Set<number>()), unifiedConfig: config, blocksConfig: config,
    splitPaneMetrics$: observable({ contentWidth: 900, contentHeight: 600, sidebarWidth: 180, sidebarHeight: 600, contentX: 180 }),
    foregroundColor: "#fff", mutedColor: "#888", backgroundColor: "#000", onJumpToHunk: jest.fn(),
  } };
}

it("renders the fixture with native rows, explicit uncovered hunks, review progress and partial context", async () => {
  const test = setup({ partial: true });
  const screen = await render(<StoryPane {...test.props} />);
  await act(async () => {});
  expect(screen.getByText("Improve behavior")).toBeTruthy();
  const hash = test.controller.story.result!.diffHash;
  expect(screen.queryByText(hash)).toBeNull();
  await fireEvent.press(screen.getByLabelText("Show Details"));
  expect(screen.getByText(hash)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText("Hide Details"));
  expect(screen.queryByText(hash)).toBeNull();
  expect(screen.getByText("Look here · A change")).toBeTruthy();
  expect(screen.getByText("Not covered by the story")).toBeTruthy();
  expect(screen.getByText("src/a.ts · new 41–41 ↗")).toBeTruthy();
  expect(nativeRows(screen.toJSON())).toHaveLength(6);
  await fireEvent.press(screen.getByLabelText("Show hunk context"));
  expect(nativeRows(screen.toJSON())).toHaveLength(8);
  await fireEvent.press(screen.getByLabelText("Mark reviewed: A change"));
  expect(screen.getByText(/1\/1 sections reviewed/)).toBeTruthy();
  await fireEvent.press(screen.getAllByLabelText(/Open src\/a.ts hunk in Files/)[0]);
  expect(test.props.onJumpToHunk).toHaveBeenCalledWith(expect.objectContaining({ id: "h1" }), false);
  await screen.unmount();
  expect(test.document.releaseNativeResources).toHaveBeenCalledTimes(1);
});

it("shows stale state and exposes cancellation and validator raw output as text", async () => {
  const test = setup({ status: "progress", stale: true });
  const screen = await render(<StoryPane {...test.props} />);
  await act(async () => {});
  expect(screen.getByText(/Out of date/)).toBeTruthy();
  expect(screen.getByText("Writing the story…")).toBeTruthy();
  expect(screen.queryByText(/bytes received/)).toBeNull();
  await fireEvent.press(screen.getByLabelText("Cancel"));
  expect(test.controller.cancel).toHaveBeenCalled();
  const error = setup({ status: "error" });
  await screen.rerender(<StoryPane {...error.props} />);
  expect(screen.getByText("Validator: title required")).toBeTruthy();
  expect(screen.queryByText("<script>bad()</script>")).toBeNull();
  await fireEvent.press(screen.getByLabelText("Show Output"));
  expect(screen.getByText("<script>bad()</script>")).toBeTruthy();
  await screen.unmount();
});

it("renders Markdown formatting as native text without interactive links or HTML", async () => {
  const screen = await render(<StoryDescription markdown={'## Heading\nExplain **why** and `code`. [link](javascript:bad)\n<img src="bad" onerror="bad()">'} color="#fff" />);
  expect(screen.getByText("Heading")).toBeTruthy();
  expect(screen.getByText("why")).toBeTruthy();
  expect(JSON.stringify(screen.toJSON())).not.toContain("onPress");
  expect(screen.toJSON()).not.toBeNull();
  await screen.unmount();
});

it("keeps cached review marks but clears them for regenerated sections with reused IDs", async () => {
  const test = setup();
  test.controller.story$.result.createdAt.set(20);
  const screen = await render(<StoryPane {...test.props} />);
  await act(async () => {});
  await fireEvent.press(screen.getByLabelText("Mark reviewed: A change"));
  expect(screen.getByText(/1\/1 sections reviewed/)).toBeTruthy();
  await act(() => test.controller.story$.result.createdAt.set(21));
  expect(screen.getByText(/0\/1 sections reviewed/)).toBeTruthy();
  await act(() => test.controller.story$.result.createdAt.set(20));
  expect(screen.getByText(/1\/1 sections reviewed/)).toBeTruthy();
  await screen.unmount();
});

it("keeps generation settings in the Options menu and shows the preview banner and repository prompt approval", async () => {
  const { changeStorySkill } = require("../storySkill");
  const { showContextMenu } = require("@legendapp/spark/context-menu");
  const test = setup();
  Object.assign(test.controller, { windowId: "main", skills: [changeStorySkill], skill: changeStorySkill, selectSkill: jest.fn(), editSkill: jest.fn(), enable: jest.fn(), generationEnabled: true, preview: true, dismissPreview: jest.fn(), approve: jest.fn(),
    trustNotice: { skill: { ...changeStorySkill, layer: "repo", repoRoot: "/repo", path: "/repo/.legend-diff/skills/story.md" } } });
  const screen = await render(<StoryPane {...test.props} />);
  expect(screen.queryByText("change-story · built-in")).toBeNull();
  expect(screen.queryByText(/Generation settings/)).toBeNull();
  const choose = async (itemId: string) => {
    jest.mocked(showContextMenu).mockResolvedValueOnce({ canceled: false, itemId });
    await fireEvent.press(screen.getByLabelText("Options…"));
    await act(async () => {});
  };
  await choose("skill:change-story"); expect(test.controller.selectSkill).toHaveBeenCalledWith("change-story");
  expect(jest.mocked(showContextMenu).mock.calls[0][0]).toEqual(expect.objectContaining({ windowId: "main", items: expect.arrayContaining([expect.objectContaining({ id: "tool:codex", checked: true }), expect.objectContaining({ id: "disable" })]) }));
  await choose("tool:claude"); expect(test.controller.setTool).toHaveBeenCalledWith("claude");
  await choose("editSkill"); expect(test.controller.editSkill).toHaveBeenCalled();
  await choose("disable"); expect(test.controller.disable).toHaveBeenCalled();
  expect(screen.getByText("Preview — saved story unchanged")).toBeTruthy();
  expect(screen.getByText(/from this repository/)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText("Approve this skill")); expect(test.controller.approve).toHaveBeenCalledWith(true);
  await fireEvent.press(screen.getByLabelText("Close preview")); expect(test.controller.dismissPreview).toHaveBeenCalled();
  await screen.unmount();
});

it("shows one sentence and one primary action instead of a blank story screen", async () => {
  const test = setup();
  test.controller.story$.set({ status: "idle", result: null, input: null, progress: null, error: null });
  Object.assign(test.controller, { windowId: "main", skills: [], generationEnabled: false, generationDisabled: false, enable: jest.fn() });
  const screen = await render(<StoryPane {...test.props} />);
  expect(screen.getByText("Get a guided walkthrough of these changes, written by Codex.")).toBeTruthy();
  await fireEvent.press(screen.getByLabelText("Generate Story"));
  expect(test.controller.generate).toHaveBeenCalledWith(true);
  await act(() => test.controller.story$.assign({ status: "progress", progress: { phase: "output", receivedBytes: 315 } }));
  expect(screen.getByText("Writing the story…")).toBeTruthy();
  expect(screen.queryByText(/315/)).toBeNull();
  await fireEvent.press(screen.getByLabelText("Cancel"));
  expect(test.controller.cancel).toHaveBeenCalled();
  await act(() => test.controller.story$.assign({ status: "error", progress: null, error: { message: "Codex is not signed in.", rawOutput: "login required" } }));
  expect(screen.getByText("Codex is not signed in.")).toBeTruthy();
  await fireEvent.press(screen.getByLabelText("Try Again"));
  expect(test.controller.generate).toHaveBeenCalledTimes(2);
  await act(() => test.controller.story$.assign({ status: "idle", error: null }));
  Object.assign(test.controller, { generationDisabled: true });
  await screen.rerender(<StoryPane {...test.props} controller={{ ...test.controller }} />);
  expect(screen.getByText("Story generation is off for this repository.")).toBeTruthy();
  await fireEvent.press(screen.getByLabelText("Turn On…"));
  expect(test.controller.enable).toHaveBeenCalled();
  await screen.unmount();
});
