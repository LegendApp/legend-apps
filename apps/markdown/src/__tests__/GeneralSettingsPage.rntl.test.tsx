import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import { GeneralSettingsContent } from "../settings/GeneralSettingsPage";

const mockSettings = {
  autosave: "enabled",
  formattingToolbarMode: "selection",
  startupBehavior: "newDocument",
  toolbarLayouts: {
    selection: {
      shown: ["bold", "italic", "link"],
    },
    top: {
      shown: ["paragraph", "heading-1", "bold"],
    },
  },
};
const mockSetMarkdownAutosaveSetting = jest.fn((autosave: string) => {
  mockSettings.autosave = autosave;
});
const mockSetMarkdownFormattingToolbarModeSetting = jest.fn((formattingToolbarMode: string) => {
  mockSettings.formattingToolbarMode = formattingToolbarMode;
});
const mockSetMarkdownStartupBehaviorSetting = jest.fn((startupBehavior: string) => {
  mockSettings.startupBehavior = startupBehavior;
});

jest.mock("../markdownSettings", () => ({
  setMarkdownAutosaveSetting: (autosave: string) => mockSetMarkdownAutosaveSetting(autosave),
  setMarkdownFormattingToolbarModeSetting: (formattingToolbarMode: string) => mockSetMarkdownFormattingToolbarModeSetting(formattingToolbarMode),
  setMarkdownStartupBehaviorSetting: (startupBehavior: string) => mockSetMarkdownStartupBehaviorSetting(startupBehavior),
  setMarkdownToolbarLayoutSetting: jest.fn(),
  useMarkdownAutosaveSetting: () => mockSettings.autosave,
  useMarkdownDisplayThemeSetting: () => "light",
  useMarkdownFormattingToolbarModeSetting: () => mockSettings.formattingToolbarMode,
  useMarkdownInstalledPlugins: () => [],
  useMarkdownStartupBehaviorSetting: () => mockSettings.startupBehavior,
  useMarkdownToolbarLayoutSetting: (layoutId: "selection" | "top") => mockSettings.toolbarLayouts[layoutId],
}));

describe("GeneralSettingsContent", () => {
  beforeEach(() => {
    mockSettings.autosave = "enabled";
    mockSettings.formattingToolbarMode = "selection";
    mockSettings.startupBehavior = "newDocument";
    mockSetMarkdownAutosaveSetting.mockClear();
    mockSetMarkdownFormattingToolbarModeSetting.mockClear();
    mockSetMarkdownStartupBehaviorSetting.mockClear();
  });

  it("renders toolbar customization sections for top bottom and floating toolbars", async () => {
    const view = await render(<GeneralSettingsContent />);

    expect(view.getByText("Top and Bottom Toolbars")).toBeTruthy();
    expect(view.getByText("Floating Toolbar")).toBeTruthy();
    expect(view.getAllByText("Shown")).toHaveLength(2);
    expect(view.getAllByText("Hidden").length).toBeGreaterThanOrEqual(2);
    await view.unmount();
  });

  it("updates startup autosave and toolbar mode settings", async () => {
    const view = await render(<GeneralSettingsContent />);
    const startup = view.getByLabelText("Startup");
    const autosave = view.getByLabelText("Autosave");

    expect(startup.type).toBe("NativeSegmentedControl");
    expect(JSON.parse(startup.props.segmentsJson)).toEqual([
      { label: "New", value: "newDocument" },
      { label: "Last", value: "lastDocument" },
    ]);
    expect(startup.props.value).toBe("newDocument");
    expect(autosave.props.accessibilityState?.checked).toBe(true);
    const toolbar = view.getByLabelText("Formatting Toolbar");
    expect(toolbar.type).toBe("NativeSelect");
    expect(toolbar.props.borderless).toBe(true);
    expect(toolbar.props.value).toBe("selection");
    expect(JSON.parse(toolbar.props.itemsJson)).toEqual([
      { label: "Floating", value: "selection" },
      { label: "Top", value: "top" },
      { label: "Bottom", value: "bottom" },
      { label: "Hidden", value: "hidden" },
    ]);

    await fireEvent(startup, "valueChange", { nativeEvent: { value: "lastDocument" } });
    await fireEvent(autosave, "valueChange", false);
    await fireEvent(toolbar, "valueChange", { nativeEvent: { value: "bottom" } });
    await view.rerender(<GeneralSettingsContent />);

    expect(mockSetMarkdownStartupBehaviorSetting).toHaveBeenCalledWith("lastDocument");
    expect(mockSetMarkdownAutosaveSetting).toHaveBeenCalledWith("disabled");
    expect(mockSetMarkdownFormattingToolbarModeSetting).toHaveBeenCalledWith("bottom");
    expect(view.getByLabelText("Startup").props.value).toBe("lastDocument");
    expect(view.getByLabelText("Autosave").props.accessibilityState?.checked).toBe(false);
    expect(view.getByLabelText("Formatting Toolbar").props.value).toBe("bottom");
    await view.unmount();
  });
});
