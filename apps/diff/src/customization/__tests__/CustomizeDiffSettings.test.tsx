import { act, fireEvent, render } from "@testing-library/react-native";
import { createDiffCustomizationController } from "../diffCustomizationController";

const mockController = createDiffCustomizationController({
  readHistory: () => undefined, saveHistory: () => {},
  baseline: async () => ({ baseId: "v1", files: { "diffPalette.ts": "red" } }),
  compile: async (_baseline, files) => files["diffPalette.ts"]!,
  generate: async () => ({ title: "Blue colors", summary: "Make the colors blue", edits: [{ path: "diffPalette.ts", before: "red", after: "blue" }] }),
  validate: () => {}, openPreview: async () => {}, closePreview: async () => {}, prepareActivation: async () => true,
});
jest.mock("../diffCustomizationRuntime", () => ({ diffCustomization: mockController }));
jest.mock("@legendapp/spark/ai", () => ({ getAICommandAvailability: async () => ({ codex: true, claude: false, preferredTool: "codex" }) }));

const { CustomizeDiffSettings } = require("../CustomizeDiffSettings") as typeof import("../CustomizeDiffSettings");

it("supports prompting, keeping, editing, inspecting and deleting a change through settings", async () => {
  const view = await render(<CustomizeDiffSettings />);
  await act(() => mockController.initialize());
  await fireEvent.changeText(view.getByLabelText("Describe an app change"), "Make colors blue");
  await fireEvent.press(view.getByLabelText("Generate & Preview"));
  await act(async () => {});
  expect(view.getByText("Preview: Blue colors")).toBeTruthy();
  expect(mockController.activeVersion()).toBeNull();
  await fireEvent.press(view.getByLabelText("Keep"));
  await act(async () => {});
  expect(view.getByText("1. Blue colors")).toBeTruthy();
  await fireEvent.press(view.getByLabelText("Edit Blue colors"));
  expect(view.getByLabelText("Describe an app change").props.value).toBe("Make colors blue");
  expect(view.getByLabelText("Revise & Preview")).toBeTruthy();
  await fireEvent.press(view.getByLabelText("Cancel Edit"));
  await fireEvent.press(view.getByLabelText("Show Code Changes"));
  expect(view.getByText("Prompt: Make colors blue")).toBeTruthy();
  expect(view.getByText("− red")).toBeTruthy();
  await fireEvent.press(view.getByLabelText("Delete Blue colors"));
  await act(async () => {});
  expect(view.getByText("Preview: Delete Blue colors")).toBeTruthy();
  await fireEvent.press(view.getByLabelText("Keep"));
  await act(async () => {});
  expect(view.getByText("No saved changes yet.")).toBeTruthy();
  expect(view.getByLabelText("Try Blue colors")).toBeTruthy();
  await view.unmount();
});
