import { createElement as mockH, type ReactNode } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { createGitSettingsStore, type GitSettingsStore, type SettingsIO } from "../settings/store";

jest.mock("react-native", () => ({
  PlatformColor: (name: string) => name, StyleSheet: { create: (styles: unknown) => styles, hairlineWidth: 1 },
  Text: "Text", View: "View",
}));
jest.mock("@legend-apps/diff-parser", () => ({}));
jest.mock("@legend-apps/reorder-controls", () => ({
  DragDropProvider: ({ children }: { children: ReactNode }) => children,
  DraggableItem: ({ children }: { children: ReactNode }) => children,
  DroppableZone: ({ children }: { children: ReactNode }) => children,
}));
jest.mock("@legendapp/spark/ui", () => ({ Button: "Button", Select: "Select", SegmentedControl: "SegmentedControl", TextInput: "TextInput" }));
jest.mock("@legendapp/spark/shortcuts/commands", () => ({ HotkeyBindingsSettingsContent: "HotkeyBindingsSettingsContent", normalizeHotkeyBindings: (bindings: string[]) => bindings }));
// The shared settings window: every page's content in one list, as the other Legend apps use it.
jest.mock("@legendapp/spark/ui/settings", () => ({
  VirtualizedSettingsWindow: ({ children }: { children: ReactNode }) => children,
  SettingsPage: ({ children, title }: { children: ReactNode; title: string }) => mockH("page-section", { title }, children),
  SettingsSection: ({ children, title }: { children?: ReactNode; title?: string | null }) => mockH("section-box", { title }, children),
  SettingsRow: ({ label, children }: { label: string; children: ReactNode }) => mockH("settings-row", { label }, children),
  SettingsSwitchRow: "settings-switch-row",
}));

let mockStore: GitSettingsStore;
const files = new Map<string, string>();
jest.mock("../settings/store", () => {
  const actual = jest.requireActual("../settings/store");
  return { ...actual, acquireGitSettings: () => ({ store: Promise.resolve(mockStore), release() {} }) };
});

/** Host elements by name (the mocks render strings). */
const named = (renderer: ReactTestRenderer, type: string, test: (props: Record<string, unknown>) => boolean = () => true) =>
  renderer.root.findAll(node => (node.type as unknown) === type && test(node.props));

const io: SettingsIO = {
  read: async path => files.get(path),
  write: async (path, text) => { files.set(path, text); },
  mkdir: async () => {},
  watch: async () => ({ remove() {} }),
};

async function renderWindow() {
  files.clear();
  mockStore = createGitSettingsStore({ io, directory: "/support" });
  await mockStore.ready;
  const { GitSettingsWindow } = require("../settings/SettingsWindow") as typeof import("../settings/SettingsWindow");
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<GitSettingsWindow />); });
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 0)); });
  return renderer;
}

describe("Settings window", () => {
  it("is one list of every page's sections, with native switches for on/off settings", async () => {
    const renderer = await renderWindow();
    const pages = named(renderer, "page-section").map(node => node.props.title);
    expect(pages).toEqual(["General", "Layout", "Panels", "Theme", "Toolbar", "Context Menus", "Keyboard", "Customize with AI"]);
    // Every page shows its content (import/export, AI and docs stay reachable in the list).
    const rows = [...named(renderer, "settings-row"), ...named(renderer, "settings-switch-row")].map(node => node.props.label);
    expect(rows).toEqual(expect.arrayContaining(["Preset", "Import…", "Export…", "Active Layout", "Wrap", "Font", "Display", "Menu", "Request"]));
    expect(named(renderer, "settings-switch-row").length).toBeGreaterThan(5);
    const segments = named(renderer, "SegmentedControl").map(node => node.props);
    expect(segments).toEqual([expect.objectContaining({
      accessibilityLabel: "Appearance",
      options: [{ label: "Light", value: "light" }, { label: "Dark", value: "dark" }],
    })]);
  });

  it("lists a value the generated choices don't have, so every popup's value is one of its options (Spark's Select throws otherwise)", async () => {
    const renderer = await renderWindow();
    const preset = named(renderer, "Select", props => props.accessibilityLabel === "Preset")[0]!;
    await act(async () => { preset.props.onValueChange("fork"); await new Promise(resolve => setTimeout(resolve, 0)); });
    const selects = named(renderer, "Select");
    expect(selects.length).toBeGreaterThan(20);
    for (const select of selects) expect((select.props.options as { value: string }[]).map(option => option.value)).toContain(select.props.value);
    expect(named(renderer, "Select", props => props.accessibilityLabel === "Line Width")[0]!.props.value).toBe("1.5");
  });

  it("the Preset popup writes the preset and the window switches to it", async () => {
    const renderer = await renderWindow();
    const preset = named(renderer, "Select", props => props.accessibilityLabel === "Preset")[0]!;
    await act(async () => { preset.props.onValueChange("fork"); await new Promise(resolve => setTimeout(resolve, 0)); });
    expect(JSON.parse(files.get("/support/settings.json")!)).toMatchObject({ extends: "fork" });
    expect(mockStore.base$.peek()).toBe("fork");
    expect(named(renderer, "Select", props => props.accessibilityLabel === "Preset")[0]!.props.value).toBe("fork");
  });
});
