import { fireEvent, render } from "@testing-library/react-native";
import React from "react";
import {
  getMarkdownContentWidthSetting,
  getMarkdownDocumentDensitySetting,
  getMarkdownFontSizeSetting,
  getMarkdownLineHeightSetting,
} from "../markdownSettings";
import { AppearanceSettingsContent } from "../settings/AppearanceSettingsPage";

jest.mock("../userThemes", () => ({
  loadMarkdownUserThemesSync: () => ({
    displayThemes: { issues: [] },
    layoutThemes: { issues: [] },
  }),
}));

it("keeps Font segmented and exposes the longer choices in borderless native menus", async () => {
  const view = await render(<AppearanceSettingsContent />);
  const menus = view.container.queryAll((node) => node.type === "NativeSelect");
  const changes = [
    ["Font Size", "XL", "xlarge", getMarkdownFontSizeSetting],
    ["Line Height", "Relaxed", "relaxed", getMarkdownLineHeightSetting],
    ["Maximum Width", "Full", "full", getMarkdownContentWidthSetting],
    ["Density", "Spacious", "spacious", getMarkdownDocumentDensitySetting],
  ] as const;

  for (const [label, optionLabel, value, getSetting] of changes) {
    const menu = menus.find((node) => node.props.accessibilityLabel === label);
    if (!menu) throw new Error(`Missing native select for ${label}`);
    expect(menu.props.borderless).toBe(true);
    expect(JSON.parse(menu.props.itemsJson)).toContainEqual({ label: optionLabel, value });
    await fireEvent(menu, "valueChange", { nativeEvent: { value } });
    expect(getSetting()).toBe(value);
  }

  const segments = view.container.queryAll((node) => node.type === "NativeSegmentedControl");
  expect(segments.map((control) => control.props.accessibilityLabel)).toEqual(["Font"]);
  await view.unmount();
});
