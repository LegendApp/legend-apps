import { fireEvent, render, type RenderResult } from "@testing-library/react-native";
import React from "react";
import { GeneralSettingsPage } from "../settings/GeneralSettingsPage";

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
  useMarkdownStartupBehaviorSetting: () => mockSettings.startupBehavior,
  useMarkdownToolbarLayoutSetting: (layoutId: "selection" | "top") => mockSettings.toolbarLayouts[layoutId],
}));

function segmentedSelected(view: RenderResult, label: string) {
  return segmentedOption(view, label).props.accessibilityState?.selected;
}

function segmentedOption(view: RenderResult, label: string) {
  const optionText = view.getByText(label);
  const option = optionText.parent;
  if (!option) {
    throw new Error(`Missing segmented option parent for ${label}`);
  }
  return option;
}

function switchControl(view: RenderResult) {
  return view.getByLabelText("Autosave");
}

describe("GeneralSettingsPage", () => {
  beforeEach(() => {
    mockSettings.autosave = "enabled";
    mockSettings.formattingToolbarMode = "selection";
    mockSettings.startupBehavior = "newDocument";
    mockSetMarkdownAutosaveSetting.mockClear();
    mockSetMarkdownFormattingToolbarModeSetting.mockClear();
    mockSetMarkdownStartupBehaviorSetting.mockClear();
  });

  it("renders toolbar customization sections for top bottom and floating toolbars", async () => {
    const view = await render(<GeneralSettingsPage />);

    expect(view.getByText("Top and Bottom Toolbars")).toBeTruthy();
    expect(view.getByText("Floating Toolbar")).toBeTruthy();
    expect(view.getAllByText("Shown")).toHaveLength(2);
    expect(view.getAllByText("Hidden").length).toBeGreaterThanOrEqual(2);
    await view.unmount();
  });

  it("updates startup autosave and toolbar mode settings", async () => {
    const view = await render(<GeneralSettingsPage />);

    expect(segmentedSelected(view, "New")).toBe(true);
    expect(switchControl(view).props.accessibilityState?.checked).toBe(true);
    expect(segmentedSelected(view, "Floating")).toBe(true);

    await fireEvent.press(segmentedOption(view, "Last"));
    await fireEvent.press(switchControl(view));
    await fireEvent.press(segmentedOption(view, "Bottom"));
    await view.rerender(<GeneralSettingsPage />);

    expect(mockSetMarkdownStartupBehaviorSetting).toHaveBeenCalledWith("lastDocument");
    expect(mockSetMarkdownAutosaveSetting).toHaveBeenCalledWith("disabled");
    expect(mockSetMarkdownFormattingToolbarModeSetting).toHaveBeenCalledWith("bottom");
    expect(segmentedSelected(view, "Last")).toBe(true);
    expect(switchControl(view).props.accessibilityState?.checked).toBe(false);
    expect(segmentedSelected(view, "Bottom")).toBe(true);
    await view.unmount();
  });
});
