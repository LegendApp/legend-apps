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
jest.mock("@legend-apps/design-system", () => ({ SwitchControl: "SwitchControl" }));
jest.mock("@legendapp/spark/ui", () => ({ Button: "Button", Select: "Select", SegmentedControl: "SegmentedControl", TextInput: "TextInput" }));
jest.mock("@legendapp/spark/shortcuts/commands", () => ({ HotkeyBindingsSettingsContent: "HotkeyBindingsSettingsContent", normalizeHotkeyBindings: (bindings: string[]) => bindings }));
// The shared settings window: every page's content in one list, as the other Legend apps use it.
jest.mock("@legendapp/spark/settings/window", () => ({
  VirtualizedSettingsWindow: ({ pages }: { pages: { id: string; title: string; render(): ReactNode }[] }) =>
    pages.map(page => mockH("page-section", { key: page.id, title: page.title }, page.render())),
  SettingsSection: ({ children, title }: { children?: ReactNode; title?: string | null }) => mockH("section-box", { title }, children),
  SettingsRow: ({ title, control }: { title: string; control: ReactNode }) => mockH("settings-row", { title }, control),
  SettingsCard: ({ children }: { children: ReactNode }) => mockH("settings-card", null, children),
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
    const rows = named(renderer, "settings-row").map(node => node.props.title);
    expect(rows).toEqual(expect.arrayContaining(["Preset", "Import…", "Export…", "Active Layout", "Wrap", "Font", "Display", "Menu", "Request"]));
    expect(named(renderer, "SwitchControl").length).toBeGreaterThan(5);
    // No two-segment Off/On stand-ins.
    expect(named(renderer, "SegmentedControl", props => props.accessibilityLabel !== "Appearance")).toEqual([]);
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
