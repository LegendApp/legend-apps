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
  useMarkdownFormattingToolbarModeSetting: () => mockSettings.formattingToolbarMode,
  useMarkdownStartupBehaviorSetting: () => mockSettings.startupBehavior,
  useMarkdownToolbarLayoutSetting: (layoutId: "selection" | "top") => mockSettings.toolbarLayouts[layoutId],
}));

function radioChecked(view: RenderResult, label: string) {
  return radioOption(view, label).props.accessibilityState?.checked;
}

function radioOption(view: RenderResult, label: string) {
  const radioText = view.getByText(label);
  const radio = radioText.parent;
  if (!radio) {
    throw new Error(`Missing radio parent for ${label}`);
  }
  return radio;
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

  it("updates startup autosave and toolbar mode radio settings", async () => {
    const view = await render(<GeneralSettingsPage />);

    expect(radioChecked(view, "New Document")).toBe(true);
    expect(radioChecked(view, "Enabled")).toBe(true);
    expect(radioChecked(view, "Above Selection")).toBe(true);

    await fireEvent.press(radioOption(view, "Last Document"));
    await fireEvent.press(radioOption(view, "Disabled"));
    await fireEvent.press(radioOption(view, "Bottom Toolbar"));
    await view.rerender(<GeneralSettingsPage />);

    expect(mockSetMarkdownStartupBehaviorSetting).toHaveBeenCalledWith("lastDocument");
    expect(mockSetMarkdownAutosaveSetting).toHaveBeenCalledWith("disabled");
    expect(mockSetMarkdownFormattingToolbarModeSetting).toHaveBeenCalledWith("bottom");
    expect(radioChecked(view, "Last Document")).toBe(true);
    expect(radioChecked(view, "Disabled")).toBe(true);
    expect(radioChecked(view, "Bottom Toolbar")).toBe(true);
    await view.unmount();
  });
});
