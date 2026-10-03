import { act, fireEvent, render } from "@testing-library/react-native";
import { createDiffCustomizationController } from "../diffCustomizationController";

const mockController = createDiffCustomizationController({
  readHistory: () => undefined, saveHistory: () => {},
  baseline: async () => ({ baseId: "v1", files: { "diffPalette.ts": "red" } }),
  compile: async (_baseline, files) => files["diffPalette.ts"]!,
  generate: async () => ({ title: "Blue colors", summary: "Make the colors blue", edits: [{ path: "diffPalette.ts", before: "red", after: "blue" }] }),
  validate: () => {}, openPreview: async () => {}, closePreview: async () => {}, prepareActivation: async () => true,
});
jest.mock("../diffCustomizationRuntime", () => ({ diffCustomization: mockController, getDiffCustomizationSettingsTextColor: () => "#58D6C7" }));
const mockGetAvailability = jest.fn();
jest.mock("@legendapp/spark/ai", () => ({ getAICommandAvailability: () => mockGetAvailability() }));

const { CustomizeDiffSettings } = require("../CustomizeDiffSettings") as typeof import("../CustomizeDiffSettings");

beforeEach(async () => {
  await mockController.initialize();
  mockController.setPreferences({ tool: "codex" });
  mockGetAvailability.mockReset().mockResolvedValue({ codex: true, claude: false });
});

it.each([
  { codex: true, claude: false, selected: "claude", expected: "codex" },
  { codex: false, claude: true, selected: "codex", expected: "claude" },
  { codex: true, claude: true, selected: "claude", expected: "claude" },
  { codex: false, claude: false, selected: "codex", expected: "codex" },
] as const)("selects an available tool and disables unavailable choices: %j", async ({ codex, claude, selected, expected }) => {
  mockController.setPreferences({ tool: selected });
  mockGetAvailability.mockResolvedValue({ codex, claude });
  const view = await render(<CustomizeDiffSettings />);
  await act(async () => {});
  expect(mockController.state$.history.tool.peek()).toBe(expected);
  expect(view.getByLabelText(/Codex$/).props.disabled).toBe(!codex);
  expect(view.getByLabelText(/Claude$/).props.disabled).toBe(!claude);
  if (!codex && !claude) expect(view.getByText("Install Codex or Claude and sign in to generate changes.")).toBeTruthy();
  await view.unmount();
});

it("disables choices while checking and selects the first available tool after a retry", async () => {
  mockGetAvailability.mockRejectedValueOnce(new Error("Availability check failed"));
  const view = await render(<CustomizeDiffSettings />);
  await act(async () => {});
  expect(view.getByLabelText(/Codex$/).props.disabled).toBe(true);
  expect(view.getByLabelText(/Claude$/).props.disabled).toBe(true);
  let resolveAvailability!: (value: { codex: boolean; claude: boolean }) => void;
  mockGetAvailability.mockImplementationOnce(() => new Promise(resolve => { resolveAvailability = resolve; }));
  await fireEvent.press(view.getByLabelText("Check Again"));
  expect(view.getByLabelText(/Codex$/).props.disabled).toBe(true);
  expect(view.getByLabelText(/Claude$/).props.disabled).toBe(true);
  await act(async () => resolveAvailability({ codex: false, claude: true }));
  expect(mockController.state$.history.tool.peek()).toBe("claude");
  expect(view.getByLabelText(/Claude$/).props.disabled).toBe(false);
  await view.unmount();
});

it("supports prompting, keeping, editing, inspecting and deleting a change through settings", async () => {
  const view = await render(<CustomizeDiffSettings />);
  await act(() => mockController.initialize());
  const description = view.getByText(/Describe a change to Diff’s viewer/);
  expect(description.props.style).toEqual({ color: "#58D6C7" });
  expect(description.props.className).not.toContain("text-text-secondary");
  await fireEvent.changeText(view.getByLabelText("Describe an app change"), "Make colors blue");
  await fireEvent.press(view.getByLabelText("Generate & Preview"));
  await act(async () => {});
  expect(view.getByText("Preview: Blue colors")).toBeTruthy();
  expect(view.getByLabelText("Keep").props.children.props.className).toContain("text-text-primary");
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
