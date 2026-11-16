import { openFileDialog } from "@legendapp/spark/dialogs";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { SidebarSplitView } from "@legendapp/spark/ui/split-view";
import { setWindowOptions } from "@legendapp/spark/windows";
import { addMacOSWindowListener } from "@legendapp/spark/windows/macos";
import { App } from "../App";

jest.mock("react-native", () => ({
  PlatformColor: (name: string) => name,
  StyleSheet: { create: (styles: unknown) => styles },
  Text: "Text", View: "View",
}));
jest.mock("@legendapp/spark/dialogs", () => ({ openFileDialog: jest.fn(async () => ({ canceled: true })) }));
jest.mock("@legendapp/spark/menus", () => ({ useMenu: jest.fn() }));
jest.mock("@legendapp/spark/ui/sidebar", () => ({ Sidebar: "Sidebar", SidebarItem: "SidebarItem" }));
jest.mock("@legendapp/spark/ui/split-view", () => ({
  SidebarSplitView: ({ sidebar, content }: any) => <>{sidebar}{content}</>,
}));
jest.mock("@legendapp/spark/windows", () => ({ setWindowOptions: jest.fn(async () => {}) }));
jest.mock("@legendapp/spark/windows/macos", () => ({
  addMacOSWindowListener: jest.fn(async () => ({ remove: jest.fn(async () => {}) })),
}));

it("renders the empty window, toggles its sidebar, opens the folder panel and cleans up", async () => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  let renderer!: ReactTestRenderer;
  await act(async () => { renderer = create(<App />); });
  expect(JSON.stringify(renderer.toJSON())).toContain("No repository open");
  expect(setWindowOptions).toHaveBeenCalledWith("main", expect.objectContaining({
    title: "Legend Git",
    macos: expect.objectContaining({ toolbar: expect.objectContaining({ items: expect.arrayContaining([
      expect.objectContaining({ id: "open-repository", type: "button" }),
    ]) }) }),
  }));
  const listener = jest.mocked(addMacOSWindowListener).mock.calls[0][1];
  await act(async () => { listener({ type: "toolbarAction", windowId: "main", itemId: "toggle-sidebar" }); });
  expect(renderer.root.findByType(SidebarSplitView).props.sidebarCollapsed).toBe(true);
  await act(async () => { renderer.root.findByType(SidebarSplitView).props.onSidebarCollapsedChange(false); });
  expect(renderer.root.findByType(SidebarSplitView).props.sidebarCollapsed).toBe(false);
  await act(async () => { listener({ type: "toolbarAction", windowId: "main", itemId: "open-repository" }); });
  expect(openFileDialog).toHaveBeenCalledWith({ windowId: "main", selection: "directories", multiple: false, title: "Open Repository" });
  const registration = await jest.mocked(addMacOSWindowListener).mock.results[0].value;
  await act(async () => { renderer.unmount(); });
  expect(registration.remove).toHaveBeenCalledTimes(1);
});

it("resolves the shared git workspace package without loading native capabilities", () => {
  expect(require.resolve("@legend-apps/git-core")).toMatch(/packages\/git-core\/src\/index\.ts$/);
});
