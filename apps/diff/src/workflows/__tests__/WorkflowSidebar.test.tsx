import { fireEvent, render } from "@testing-library/react-native";
import { Text } from "react-native";
import { WorkflowSidebar } from "../WorkflowSidebar";
import type { useDiffWorkflows } from "../useDiffWorkflows";
import { builtInWorkflowSkills } from "../workflowSkills";
import { StorySidebar } from "../../story/StorySidebar";
import { useState } from "react";

it("selects workflows, restores named selections, saves presets and runs only on command", async () => {
  const runSelected = jest.fn(), savePreset = jest.fn();
  function Harness() {
    const [selected, setSelected] = useState<string[]>([]);
    return <WorkflowSidebar color="#fff" controller={{ skills: builtInWorkflowSkills, selected, setSelected, ready: true, scope: "repo:/repo", runSelected, savePreset,
      presets: [{ name: "Pre-PR checks", skills: ["tests-cover-change", "review-risks"] }], deletePreset: jest.fn(),
    } as unknown as ReturnType<typeof useDiffWorkflows>} />;
  }
  const screen = await render(<Harness />);
  expect(screen.getByLabelText("Run selected")).toBeDisabled();
  await fireEvent.press(screen.getByLabelText("review-risks"));
  expect(screen.getByLabelText("review-risks").props.accessibilityState).toEqual({ checked: true });
  await fireEvent.press(screen.getByLabelText("Presets"));
  await fireEvent.press(screen.getByLabelText("Select preset Pre-PR checks"));
  expect(screen.getByLabelText("tests-cover-change").props.accessibilityState).toEqual({ checked: true });
  await fireEvent.changeText(screen.getByLabelText("Preset name"), "Review");
  await fireEvent.press(screen.getByLabelText("Save selection as preset"));
  expect(savePreset).toHaveBeenCalledWith("Review");
  expect(runSelected).not.toHaveBeenCalled();
  await fireEvent.press(screen.getByLabelText("Run selected"));
  expect(runSelected).toHaveBeenCalledTimes(1);
  await screen.unmount();
});

it("exposes Files, Story and Workflows in the existing sidebar", async () => {
  const onTab = jest.fn();
  const screen = await render(<StorySidebar tab="workflows" onTab={onTab} sections={[]} onSection={jest.fn()} color="#fff" workflows={<Text>Workflow controls</Text>}><Text>Files list</Text></StorySidebar>);
  expect(screen.getByText("Workflow controls")).toBeTruthy();
  expect(screen.queryByText("Files list")).toBeNull();
  await fireEvent.press(screen.getByText("Files"));
  expect(onTab).toHaveBeenCalledWith("files");
  expect(screen.getByText("Story")).toBeTruthy();
  expect(screen.getByText("Workflows")).toBeTruthy();
  await screen.unmount();
});
