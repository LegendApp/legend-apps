import { useValue } from "@legendapp/state/react";
import { act, fireEvent, render } from "@testing-library/react-native";
import { WorkflowRunRow } from "../WorkflowResults";
import { builtInWorkflowSkills } from "../workflowSkills";
import { workflowStore } from "../workflowStore";
import { fixtureInput } from "../../story/__tests__/storyFixtures";
import { workflowResult } from "./workflowFixtures";
import { workflowReviewComments } from "../workflowReview";

function setup(index = 1) {
  const skill = builtInWorkflowSkills[index], input = fixtureInput();
  const result = workflowResult(skill, input);
  workflowStore.state("results", skill.name).assign({ status: "done", result, input, startedAt: 1000, endedAt: 3000 });
  return { skill, result, input, props: { windowId: "results", skill, input, comments: [], onCommentState: jest.fn(), onJump: jest.fn(), onPatch: jest.fn(), color: "#fff", mutedColor: "#888" } };
}
afterEach(() => workflowStore.closeWindow("results"));

it.each(["pass", "fail", "warn"] as const)("renders a %s check with safe Markdown and exact hunk navigation", async verdict => {
  const test = setup();
  workflowStore.state("results", test.skill.name).result.output.set({ contractVersion: 1, kind: "check", summary: "Checked", result: verdict,
    reasons: [{ text: "Review **coverage** [link](javascript:bad)", refs: [{ hunk: "h1" }] }] });
  const screen = await render(<WorkflowRunRow {...test.props} />);
  expect(screen.getByLabelText(`Check ${verdict}`)).toBeTruthy();
  expect(screen.getByText("coverage")).toBeTruthy();
  await fireEvent.press(screen.getByLabelText("Open src/a.ts hunk 1"));
  expect(test.props.onJump).toHaveBeenCalledWith(expect.objectContaining({ id: "h1", file: "src/a.ts" }));
  expect(JSON.stringify(screen.toJSON())).not.toContain("javascript:");
  await screen.unmount();
});

it("shows comments with resolve, dismiss, reopen and outdated state", async () => {
  const test = setup(0);
  test.result.output = { contractVersion: 1, kind: "comments", summary: "Review", comments: [{ ref: { hunk: "h1", side: "new", startLine: 41, endLine: 41 }, severity: "warn", body: "Check **this**", suggestion: "replacement" }] };
  workflowStore.state("results", test.skill.name).result.set(test.result);
  const comments = workflowReviewComments(test.skill.name, test.result, test.input, test.input, {});
  const screen = await render(<WorkflowRunRow {...test.props} comments={comments} />);
  await fireEvent.press(screen.getByLabelText("Resolve"));
  expect(test.props.onCommentState).toHaveBeenLastCalledWith(comments[0].id, "resolved");
  await fireEvent.press(screen.getByLabelText("Dismiss"));
  expect(test.props.onCommentState).toHaveBeenLastCalledWith(comments[0].id, "dismissed");
  await screen.rerender(<WorkflowRunRow {...test.props} comments={[{ ...comments[0], outdated: true, state: "resolved" }]} />);
  expect(screen.getByText(/Outdated/)).toBeTruthy();
  expect(screen.getByLabelText("Open in Files")).toBeDisabled();
  await fireEvent.press(screen.getByLabelText("Reopen"));
  expect(test.props.onCommentState).toHaveBeenLastCalledWith(comments[0].id, "open");
  await screen.unmount();
});

it("updates live status/elapsed in its row and exposes cancellation and failed raw output", async () => {
  const test = setup();
  const cancel = jest.spyOn(workflowStore, "cancel").mockImplementation(() => {});
  workflowStore.state("results", test.skill.name).assign({ status: "queued", startedAt: null, endedAt: null, result: null });
  const screen = await render(<WorkflowRunRow {...test.props} />);
  expect(screen.getByText("queued · 0s")).toBeTruthy();
  await act(() => workflowStore.state("results", test.skill.name).assign({ status: "running", startedAt: Date.now() - 2000, progress: { phase: "output", receivedBytes: 123 } }));
  expect(screen.getByText(/123 bytes received/)).toBeTruthy();
  await fireEvent.press(screen.getByLabelText(`Cancel ${test.skill.name}`));
  expect(cancel).toHaveBeenCalledWith("results", test.skill.name);
  await act(() => workflowStore.state("results", test.skill.name).assign({ status: "error", error: { message: "Invalid contract", rawOutput: "<script>bad()</script>" } }));
  expect(screen.getByText("Invalid contract")).toBeTruthy();
  expect(screen.queryByText("<script>bad()</script>")).toBeNull();
  await fireEvent.press(screen.getByLabelText("Show raw output"));
  expect(screen.getByText("<script>bad()</script>")).toBeTruthy();
  cancel.mockRestore(); await screen.unmount();
});

it("opens patches only after explicit review", async () => {
  const test = setup(2);
  const screen = await render(<WorkflowRunRow {...test.props} />);
  expect(test.props.onPatch).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByLabelText("Review proposed patch"));
  expect(test.props.onPatch).toHaveBeenCalledWith(test.result.output);
  await screen.unmount();
});

it("disables check links when their content changed instead of jumping to a recycled hunk ID", async () => {
  const test = setup();
  workflowStore.state("results", test.skill.name).result.output.set({ contractVersion: 1, kind: "check", summary: "Checked", result: "warn", reasons: [{ text: "Review", refs: [{ hunk: "h1" }] }] });
  const screen = await render(<WorkflowRunRow {...test.props} input={fixtureInput({ text: "changed" })} />);
  expect(screen.getByLabelText("Outdated reference h1")).toBeDisabled();
  expect(test.props.onJump).not.toHaveBeenCalled();
  await screen.unmount();
});

it("initializes idle rows after render without updating a subscribed parent during render", async () => {
  const test = setup();
  workflowStore.closeWindow("results");
  const errors = jest.spyOn(console, "error").mockImplementation(() => {});
  function Parent({ show }: { show: boolean }) {
    useValue(workflowStore.state$.results);
    return show ? <WorkflowRunRow {...test.props} /> : null;
  }
  const screen = await render(<Parent show={false} />);
  try {
    await screen.rerender(<Parent show />);
    expect(screen.getByText("idle · 0s")).toBeTruthy();
    expect(errors.mock.calls.flat().join(" ")).not.toContain("Cannot update a component");
  } finally { await screen.unmount(); errors.mockRestore(); }
});
