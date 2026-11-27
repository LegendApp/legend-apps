import { act, fireEvent, render, within } from "@testing-library/react-native";
import { openFileDialog, saveFileDialog } from "@legendapp/spark/dialogs";
import { watch } from "@legendapp/spark/files";
import { beforeWindowClose } from "@legendapp/spark/windows";
import { observable } from "@legendapp/state";
import React from "react";
import { StyleSheet, Text } from "react-native";
import type { TestInstance } from "test-renderer";
import type { MarkdownDocumentProps } from "@legend-apps/markdown-document";
import { MarkdownEditorWindow } from "../MarkdownEditorWindow";
import { confirmDirtyDocumentTransition } from "../confirmDirtyDocumentTransition";
import { createMarkdownDraft, removeMarkdownDraft } from "../markdownDrafts";
import { newMarkdownDocumentLaunchArgument } from "../markdownFiles";
import { getLastMarkdownDocumentPath, getMarkdownStartupBehaviorSetting } from "../markdownSettings";
import { registerMarkdownWindowQuitGuard } from "../useMarkdownDocumentEvents";
import type { MarkdownDocumentSessionState } from "../useMarkdownDocumentSession";

const mockRegisterMarkdownWindowQuitGuard = jest.mocked(registerMarkdownWindowQuitGuard);
const mockBeforeWindowClose = jest.mocked(beforeWindowClose);
const { useMarkdownDocumentSession: mockUseMarkdownDocumentSession } = jest.requireMock<{
  useMarkdownDocumentSession: jest.Mock<typeof mockSession | ReturnType<typeof import("../useMarkdownDocumentSession").useMarkdownDocumentSession>, [import("../useMarkdownDocumentSession").MarkdownDocumentSessionOptions]>;
}>("../useMarkdownDocumentSession");
const mockWatchFiles = watch as jest.MockedFunction<typeof watch>;

const mockMarkdownE2EEditorSmoke = jest.fn((props: { autoSelectBlocks?: boolean; variant?: string }) => (
  <Text>{`editor-smoke:${props.variant}:${props.autoSelectBlocks ? "auto" : "manual"}`}</Text>
));
const mockMarkdownE2ERunner = jest.fn((props: { scenario: string }) => (
  <Text>{`document-runner:${props.scenario}`}</Text>
));
const mockMarkdownDocument = jest.fn((_props: unknown) => {
  const React = require("react");
  const { Text } = require("react-native");
  return React.createElement(Text, null, "markdown-document");
});
const mockInvalidateLayoutMeasurements = jest.fn();
const mockReloadDocument = jest.fn();
const mockCheckForExternalChanges = jest.fn(async () => {});
const mockSessionState$ = observable<MarkdownDocumentSessionState>({
  conflict: null,
  commandState: { canCommitAndBlur: false, canRedo: false, canUndo: false },
  documentSource: "file",
  filename: "test.md",
  isDirty: false,
  lastError: null,
  saveState: "idle",
});
const mockSession = {
  documentCommandsRef: {
    current: {
      invalidateLayoutMeasurements: mockInvalidateLayoutMeasurements,
      reload: mockReloadDocument,
      checkForExternalChanges: mockCheckForExternalChanges,
      commitAndBlurActiveBlock: jest.fn(),
    },
  },
  handleError: jest.fn(),
  handleDocumentLoaded: jest.fn(),
  handleDocumentLoadError: jest.fn(),
  openMarkdownDialog: jest.fn(),
  // Opening a file shows it, as the real session does, so the pane's active tab and its document agree.
  openSelectedFile: jest.fn((path: string) => mockSessionState$.assign({ documentSource: "file", filename: path })),
  prepareCurrentDocumentForClose: jest.fn(async () => true),
  saveCurrentDocument: jest.fn(async () => true),
  saveCurrentDocumentAs: jest.fn(async () => true),
  sessionState$: mockSessionState$,
  setConflict: jest.fn(),
  useDiskVersion: jest.fn(),
  overwriteWithLocal: jest.fn(),
  setCommandState: jest.fn(),
  setIsDirty: jest.fn(),
  setSaveState: jest.fn(),
};

jest.mock("@legendapp/spark/windows", () => ({
  addWindowListener: jest.fn(async () => ({ remove: jest.fn(async () => {}) })),
  beforeWindowClose: jest.fn(async () => ({ remove: jest.fn(async () => {}) })),
}));

jest.mock("@legendapp/spark/shortcuts/commands", () => ({ getDefaultHotkeyBindings: jest.requireActual("@legendapp/spark/shortcuts/commands").getDefaultHotkeyBindings, createHotkeyRouter: jest.fn(() => ({})), useRoutedHotkeys: jest.fn() }));

jest.mock("@legendapp/spark/files", () => ({
  list: jest.fn(async () => []),
  watch: jest.fn(async () => ({ remove: jest.fn(async () => {}) })),
}));


jest.mock("@legendapp/spark/dialogs", () => ({
  openFileDialog: jest.fn(),
  saveFileDialog: jest.fn(),
}));

jest.mock("@legend-apps/markdown-document", () => ({
  MarkdownDocument: (props: unknown) => mockMarkdownDocument(props),
  nativeMarkdownDocumentAdapter: {},
  isMarkdownFileConflictError: () => false,
}));

jest.mock("../MarkdownE2EEditorSmoke", () => ({
  MarkdownE2EEditorSmoke: (props: { autoSelectBlocks?: boolean; variant?: string }) => mockMarkdownE2EEditorSmoke(props),
}));

jest.mock("../MarkdownE2ERunner", () => {
  const actual = jest.requireActual("../MarkdownE2ERunner");
  return {
    ...actual,
    MarkdownE2ERunner: (props: { scenario: string }) => mockMarkdownE2ERunner(props),
  };
});

jest.mock("../MarkdownFormattingToolbar", () => ({
  MarkdownFormattingToolbar: () => {
    const React = require("react");
    const { Text } = require("react-native");
    return React.createElement(Text, null, "formatting-toolbar");
  },
}));

jest.mock("../MarkdownFloatingSurface", () => ({
  MarkdownFloatingSurface: ({ children }: { children: React.ReactNode }) => {
    const React = require("react");
    return React.createElement(React.Fragment, null, children);
  },
}));

jest.mock("../confirmDirtyDocumentTransition", () => ({
  confirmDirtyDocumentTransition: jest.fn(),
}));

jest.mock("../appMetadata", () => ({
  ...jest.requireActual("../appMetadata"),
  addRecentMarkdownFile: jest.fn(),
}));

jest.mock("@legendapp/spark/app/documents", () => ({
  ...jest.requireActual("@legendapp/spark/app/documents"),
  noteRecentDocument: jest.fn(),
}));

jest.mock("../markdownDrafts", () => ({
  createMarkdownDraft: jest.fn(),
  isMarkdownDraft: (path: string) => path.startsWith("/test-drafts/"),
  removeMarkdownDraft: jest.fn(),
}));

let mockOpenFilePanel: { folders: readonly string[]; onBrowse: () => void; onDismiss: () => void; onOpen: (path: string) => void } | null = null;
jest.mock("../MarkdownOpenFilePanel", () => ({
  MarkdownOpenFilePanel: (props: typeof mockOpenFilePanel) => { mockOpenFilePanel = props; return null; },
  openFilePanelMinHeight: jest.requireActual("../MarkdownOpenFilePanel").openFilePanelMinHeight,
}));

jest.mock("../useMarkdownDocumentSession", () => ({
  useMarkdownDocumentSession: jest.fn(() => mockSession),
}));

jest.mock("../useMarkdownDocumentEvents", () => ({
  getStartupMarkdownPath: jest.requireActual("../useMarkdownDocumentEvents").getStartupMarkdownPath,
  registerMarkdownWindowQuitGuard: jest.fn(),
  useMarkdownWindowCloseRequest: jest.requireActual("../useMarkdownDocumentEvents").useMarkdownWindowCloseRequest,
  useRecentMarkdownDocumentOpener: jest.fn(),
}));

jest.mock("../useMarkdownMenus", () => ({
  useMarkdownMenus: jest.fn(),
}));

jest.mock("../useMarkdownWindows", () => ({
  useMarkdownEditorWindowOptions: jest.fn(),
  useMarkdownSettingsWindow: () => jest.fn(),
}));

const mockChromeTheme = { titleBarHeight: 36 };
let mockDisplayTheme = "system";
let mockSidebarFolders: string[] = [];
let mockSavedPaneLayout: unknown;

jest.mock("../markdownSettings", () => ({
  applyMarkdownThemeSetting: jest.fn(),
  getLastMarkdownDocumentPath: jest.fn(),
  getMarkdownStartupBehaviorSetting: jest.fn(),
  getMarkdownPaneLayoutSetting: () => jest.requireActual("@legend-apps/workspace").parsePaneLayout(mockSavedPaneLayout),
  setMarkdownPaneLayoutSetting: jest.fn(),
  getMarkdownSidebarFoldersSetting: () => mockSidebarFolders,
  getMarkdownSidebarOpenSetting: () => true,
  setLastMarkdownDocumentPath: jest.fn(),
  setMarkdownSidebarFoldersSetting: jest.fn(),
  setMarkdownSidebarOpenSetting: jest.fn(),
  useMarkdownAppearanceSettings: () => ({}),
  useMarkdownAutosaveSetting: () => "enabled",
  useMarkdownChromeTheme: () => mockChromeTheme,
  useMarkdownDisplayThemeSetting: () => mockDisplayTheme,
  useMarkdownFormattingToolbarModeSetting: () => "selection",
  useMarkdownLayoutThemeSetting: () => "default",
  useMarkdownHotkeySettings: () => ({}),
}));

jest.mock("@legendapp/list/react-native", () => ({ LegendList: () => null }));

jest.mock("../userThemes", () => ({
  loadMarkdownUserThemesSync: jest.fn(),
}));

describe("MarkdownEditorWindow e2e launch routing", () => {
  beforeEach(() => {
    mockDisplayTheme = "system";
    jest.mocked(getLastMarkdownDocumentPath).mockReturnValue(null);
    jest.mocked(getMarkdownStartupBehaviorSetting).mockReturnValue("lastDocument");
    mockCheckForExternalChanges.mockClear();
    (globalThis as typeof globalThis & { __DEV__?: boolean }).__DEV__ = true;
    mockMarkdownE2EEditorSmoke.mockClear();
    mockMarkdownE2ERunner.mockClear();
    mockMarkdownDocument.mockClear();
    mockSession.openSelectedFile.mockClear();
    mockSession.prepareCurrentDocumentForClose.mockClear();
    jest.mocked(createMarkdownDraft).mockReset();
    jest.mocked(removeMarkdownDraft).mockClear();
    mockInvalidateLayoutMeasurements.mockClear();
    mockReloadDocument.mockClear();
    mockWatchFiles.mockClear();
    mockWatchFiles.mockResolvedValue({ remove: jest.fn(async () => {}) });
    mockRegisterMarkdownWindowQuitGuard.mockClear();
    mockBeforeWindowClose.mockClear();
    mockSessionState$.assign({
      conflict: null,
      commandState: { canCommitAndBlur: false, canRedo: false, canUndo: false },
      documentSource: "file",
      filename: "test.md",
      isDirty: false,
      lastError: null,
      saveState: "idle",
    });
  });

  it.each([["light", 0.8], ["dark", 0.88]])("configures native %s glass behind the pane cards", async (theme, opacity) => {
    mockDisplayTheme = theme;
    const view = await render(<MarkdownEditorWindow files={["/Alpha.md", "/Beta.md"]} />);
    const splitView = view.root!.children[0] as TestInstance;
    expect(splitView.props.contentGlassTint).toEqual({ color: expect.stringMatching(/^#[\da-f]{6}$/i), opacity });
    expect(splitView.props.dividerColor).toBe("#00000000");
    expect(splitView.props.onResize).toBeUndefined();
    expect(within(splitView).getAllByLabelText("Beta.md").some(node => node.props.accessibilityRole === "tab")).toBe(true);
    expect(within(splitView).getByTestId("markdown-pane-p0")).toBeTruthy();
    const sidebar = splitView.children[0] as TestInstance;
    expect(within(sidebar).getByText("Add Folder…")).toBeTruthy();
    expect(StyleSheet.flatten((sidebar.children[0] as TestInstance).props.style).opacity).toBe(0.8);
    await view.unmount();
  });

  it("scopes document and commit hotkeys to the current document window", async () => {
    const { useRoutedHotkeys } = jest.requireMock("@legendapp/spark/shortcuts/commands");
    useRoutedHotkeys.mockClear();
    const view = await render(<MarkdownEditorWindow windowId="markdown-editor-3" />);
    for (const id of ["focusFirstBlock", "commit"]) {
      expect(useRoutedHotkeys).toHaveBeenCalledWith(expect.objectContaining({
        definitions: expect.arrayContaining([expect.objectContaining({ id })]),
        scope: { kind: "window", windowId: "markdown-editor-3" },
      }));
    }
    await view.unmount();
  });

  it("preserves the editor selection only while the link popover is open", async () => {
    const view = await render(<MarkdownEditorWindow files={["/tmp/test.md"]} />);
    const { useMarkdownMenus } = jest.requireMock("../useMarkdownMenus");
    const documentProps = () => mockMarkdownDocument.mock.calls.at(-1)![0] as { preserveEditingOnBlur: boolean };
    expect(documentProps().preserveEditingOnBlur).toBe(false);
    await act(async () => useMarkdownMenus.mock.calls.at(-1)[0].onInsertLink());
    expect(documentProps().preserveEditingOnBlur).toBe(true);
    expect(view.getByTestId("markdown-document-input-surface").props.pointerEvents).toBe("none");
    await fireEvent.press(view.getByLabelText("Cancel"));
    expect(documentProps().preserveEditingOnBlur).toBe(false);
    expect(view.getByTestId("markdown-document-input-surface").props.pointerEvents).toBe("auto");
    await view.unmount();
  });

  it.each([
    ["editor-ui-smoke", "ui", false],
    ["editor-selection-smoke", "selection", true],
    ["editor-soft-wrap-selection", "softWrap", false],
    ["editor-code-block-smoke", "codeBlock", false],
    ["editor-edit-navigation-smoke", "editNavigation", false],
    ["editor-navigation-smoke", "navigation", false],
    ["editor-theme-reflow-smoke", "themeReflow", false],
  ])("routes %s to the editor smoke harness", async (scenario, variant, autoSelectBlocks) => {
    const view = await render(<MarkdownEditorWindow launchArguments={[`--markdown-e2e=${scenario}`]} />);

    expect(view.getByText(`editor-smoke:${variant}:${autoSelectBlocks ? "auto" : "manual"}`)).toBeTruthy();
    expect(mockMarkdownE2EEditorSmoke).toHaveBeenCalledWith({ autoSelectBlocks, variant });
    expect(mockMarkdownE2ERunner).not.toHaveBeenCalled();
    await view.unmount();
  });

  it("routes document scenarios to the document e2e runner", async () => {
    const view = await render(<MarkdownEditorWindow launchArguments={["--markdown-e2e=far-down-structural-edits"]} />);

    expect(view.getByText("document-runner:far-down-structural-edits")).toBeTruthy();
    expect(mockMarkdownE2ERunner).toHaveBeenCalledWith(expect.objectContaining({
      scenario: "far-down-structural-edits",
    }));
    expect(mockMarkdownE2EEditorSmoke).not.toHaveBeenCalled();
    await view.unmount();
  });

  it("uses the autosave-aware close preparation for app quit", async () => {
    const view = await render(<MarkdownEditorWindow files={["/docs/a.md"]} />);

    const quit = mockRegisterMarkdownWindowQuitGuard.mock.lastCall?.[0];
    expect(await quit?.prepare()).toBe(true);
    expect(mockSession.prepareCurrentDocumentForClose).toHaveBeenCalledWith({ autosaveEnabled: true, reason: "quit" });
    await view.unmount();
  });

  it("keeps a file tab open when switching and confirms on close", async () => {
    // The sidebar lists the same files, so tabs are found by role.
    const tab = (view: Awaited<ReturnType<typeof render>>, label: string) => view.queryAllByLabelText(label).find(node => node.props.accessibilityRole === "tab");
    mockSessionState$.assign({ documentSource: "file", filename: "/docs/a.md" });
    const view = await render(<MarkdownEditorWindow files={["/docs/a.md", "/docs/b.md"]} />);
    // Single-file windows start with the sidebar hidden even though the setting is open.
    expect(view.getByLabelText("Show Sidebar")).toBeTruthy();

    await act(async () => fireEvent.press(tab(view, "b.md")!));
    expect(mockSession.prepareCurrentDocumentForClose).not.toHaveBeenCalled();
    expect(mockSession.openSelectedFile).toHaveBeenLastCalledWith("/docs/b.md");

    mockSession.prepareCurrentDocumentForClose.mockClear();
    mockSession.prepareCurrentDocumentForClose.mockResolvedValueOnce(false);
    await act(async () => fireEvent.press(view.getByLabelText("Close b.md")));
    expect(tab(view, "b.md")).toBeTruthy();
    await act(async () => fireEvent.press(view.getByLabelText("Close b.md")));
    expect(mockSession.prepareCurrentDocumentForClose).toHaveBeenCalledTimes(2);
    expect(mockSession.prepareCurrentDocumentForClose).toHaveBeenLastCalledWith({ autosaveEnabled: true, reason: "close" });
    expect(tab(view, "b.md")).toBeUndefined();
    expect(mockSession.openSelectedFile.mock.calls).toEqual([["/docs/a.md"], ["/docs/b.md"]]);

    await act(async () => fireEvent.press(view.getByLabelText("Show Sidebar")));
    expect(view.getByLabelText("Hide Sidebar")).toBeTruthy();
    expect(view.getByLabelText("Hide Sidebar").props.tooltip).toBe("Hide Sidebar");
    expect(view.queryByLabelText("Add File")).toBeNull();
    expect(view.queryByLabelText("Add Folder")).toBeNull();
    await view.unmount();
  });

  it("restores and saves the main window's sidebar folders, and leaves other windows' folders alone", async () => {
    const { setMarkdownSidebarFoldersSetting } = jest.requireMock("../markdownSettings");
    const { useMarkdownMenus } = jest.requireMock("../useMarkdownMenus");
    mockSidebarFolders = ["/notes"];
    try {
      const view = await render(<MarkdownEditorWindow />);
      expect(view.getByLabelText("notes")).toBeTruthy();
      expect(view.queryByText("Add Folder…")).toBeNull();
      expect(setMarkdownSidebarFoldersSetting).toHaveBeenLastCalledWith(["/notes"]);
      expect(useMarkdownMenus).toHaveBeenLastCalledWith(expect.objectContaining({ hasFolders: true }));
      await view.unmount();

      setMarkdownSidebarFoldersSetting.mockClear();
      const other = await render(<MarkdownEditorWindow windowId="markdown-editor-2" />);
      expect(other.queryByLabelText("notes")).toBeNull();
      expect(other.getByText("Add Folder…")).toBeTruthy();
      expect(useMarkdownMenus).toHaveBeenLastCalledWith(expect.objectContaining({ hasFolders: false }));
      expect(setMarkdownSidebarFoldersSetting).not.toHaveBeenCalled();
      await other.unmount();
    } finally {
      mockSidebarFolders = [];
    }
  });

  it("opens two real draft tabs without confirming the existing document", async () => {
    const { useMarkdownMenus } = jest.requireMock("../useMarkdownMenus");
    const newDocument = () => useMarkdownMenus.mock.calls.at(-1)[0].onNewDocument();
    jest.mocked(createMarkdownDraft)
      .mockReturnValueOnce("/test-drafts/Untitled.md")
      .mockReturnValueOnce("/test-drafts/Untitled 2.md");
    const view = await render(<MarkdownEditorWindow />);
    expect(view.getByLabelText("New File")).toBeTruthy();
    expect(mockMarkdownDocument).not.toHaveBeenCalled();

    await act(async () => newDocument());
    await act(async () => { mockSessionState$.isDirty.set(true); });
    await act(async () => newDocument());
    expect(mockSession.openSelectedFile.mock.calls).toEqual([["/test-drafts/Untitled.md"], ["/test-drafts/Untitled 2.md"]]);
    expect(mockSession.prepareCurrentDocumentForClose).not.toHaveBeenCalled();
    const tab = (label: string) => view.getAllByLabelText(label).find(node => node.props.accessibilityRole === "tab")!;
    expect(tab("Untitled 2.md").props.accessibilityState.selected).toBe(true);
    await fireEvent.press(tab("Untitled.md"));
    expect(tab("Untitled.md").props.accessibilityState.selected).toBe(true);
    expect(mockSession.openSelectedFile).toHaveBeenCalledTimes(2);
    expect(removeMarkdownDraft).not.toHaveBeenCalled();

    await view.unmount();
  });

  describe("empty tabs", () => {
    const { useMarkdownMenus } = jest.requireMock("../useMarkdownMenus");
    const menus = () => useMarkdownMenus.mock.calls.at(-1)[0];
    const tabs = (view: Awaited<ReturnType<typeof render>>) => view.queryAllByLabelText(/./).filter(node => node.props.accessibilityRole === "tab")
      .map(node => `${node.props.accessibilityLabel}${node.props.accessibilityState.selected ? "*" : ""}`);
    const button = (view: Awaited<ReturnType<typeof render>>, label: string) => view.getAllByLabelText(label).find(node => node.props.accessibilityRole === "button")!;
    const showPanel = async (view: Awaited<ReturnType<typeof render>>) => {
      mockOpenFilePanel = null;
      await act(async () => fireEvent.press(button(view, "Open File")));
      return mockOpenFilePanel!;
    };

    beforeEach(() => {
      mockSession.openMarkdownDialog.mockReset().mockResolvedValue(undefined);
      mockSessionState$.assign({ documentSource: "file", filename: "/docs/a.md", isDirty: true });
    });
    afterEach(() => {
      mockSessionState$.isDirty.set(false);
      mockSidebarFolders = [];
    });

    it("opens a New Tab beside a dirty document without preparing it, and New File turns it into a draft", async () => {
      const view = await render(<MarkdownEditorWindow files={["/docs/a.md"]} />);
      mockSession.openSelectedFile.mockClear();
      await act(async () => fireEvent.press(button(view, "New Tab")));
      expect(tabs(view)).toEqual(["a.md", "New Tab*"]);
      expect(mockSession.prepareCurrentDocumentForClose).not.toHaveBeenCalled();
      expect(mockSession.openSelectedFile).not.toHaveBeenCalled();
      expect(button(view, "New File").props.accessibilityHint).toBe("⌘N");
      expect(button(view, "Open File").props.accessibilityHint).toBe("⌘O");

      jest.mocked(createMarkdownDraft).mockReturnValueOnce("/test-drafts/Untitled.md");
      await act(async () => menus().onNewDocument());
      expect(tabs(view)).toEqual(["a.md", "Untitled.md*"]);
      expect(mockSession.openSelectedFile).toHaveBeenCalledWith("/test-drafts/Untitled.md");
      expect(mockSession.prepareCurrentDocumentForClose).not.toHaveBeenCalled();
      await view.unmount();
    });

    it("searches the folders from an empty tab: a result replaces it, an open file's tab takes over, and dismissing keeps it", async () => {
      mockSidebarFolders = ["/notes", "/work"];
      const view = await render(<MarkdownEditorWindow />);
      await act(async () => fireEvent.press(button(view, "New Tab")));
      let panel = await showPanel(view);
      expect(panel.folders).toEqual(["/notes", "/work"]);
      await act(async () => panel.onDismiss());
      mockOpenFilePanel = null;
      expect(tabs(view)).toEqual(["New Tab*"]);

      // Cmd+O runs the same Open File.
      mockOpenFilePanel = null;
      await act(async () => menus().onOpenDocument());
      await act(async () => mockOpenFilePanel!.onOpen("/work/deep/plan.md"));
      expect(tabs(view)).toEqual(["plan.md*"]);
      expect(mockSession.openSelectedFile).toHaveBeenLastCalledWith("/work/deep/plan.md");

      await act(async () => fireEvent.press(button(view, "New Tab")));
      panel = await showPanel(view);
      await act(async () => panel.onOpen("/work/deep/plan.md"));
      expect(tabs(view)).toEqual(["plan.md*"]);

      // The footer's Open File hands over to the system picker; canceling it leaves the empty tab.
      await act(async () => fireEvent.press(button(view, "New Tab")));
      panel = await showPanel(view);
      await act(async () => panel.onBrowse());
      expect(mockSession.openMarkdownDialog).toHaveBeenCalledTimes(1);
      expect(tabs(view)).toEqual(["plan.md", "New Tab*"]);
      expect(mockSession.openSelectedFile).toHaveBeenCalledTimes(1);
      await view.unmount();
    });

    it("opens the system picker without folders, and its file replaces the empty tab", async () => {
      const view = await render(<MarkdownEditorWindow files={["/docs/a.md"]} />);
      await act(async () => fireEvent.press(button(view, "New Tab")));
      mockOpenFilePanel = null;
      await act(async () => fireEvent.press(button(view, "Open File")));
      expect(mockOpenFilePanel).toBeNull();
      expect(mockSession.openMarkdownDialog).toHaveBeenCalledTimes(1);
      expect(tabs(view)).toEqual(["a.md", "New Tab*"]);

      // The empty tab's session renders last and opens what the picker chose in its place.
      await act(async () => (mockUseMarkdownDocumentSession.mock.calls.at(-1) as unknown as [{ onOpenFile: (path: string) => void }])[0].onOpenFile("/elsewhere/b.md"));
      expect(tabs(view)).toEqual(["a.md", "b.md*"]);
      await view.unmount();
    });

    it("drops a picker result once its empty tab is replaced, leaving the sidebar alone", async () => {
      const view = await render(<MarkdownEditorWindow />);
      await act(async () => fireEvent.press(button(view, "New Tab")));
      await act(async () => menus().onOpenDocument());
      const latePick = mockUseMarkdownDocumentSession.mock.calls.at(-1)![0].onOpenFile;
      jest.mocked(createMarkdownDraft).mockReturnValueOnce("/test-drafts/Untitled.md");
      await act(async () => menus().onNewDocument());
      await act(async () => latePick("/outside/late.md"));
      expect(tabs(view)).toEqual(["Untitled.md*"]);
      expect(view.queryByText("late.md")).toBeNull();
      await view.unmount();
    });

    it("drops a picker result for an already open file once its empty tab has closed", async () => {
      mockSessionState$.isDirty.set(false);
      const view = await render(<MarkdownEditorWindow files={["/docs/a.md", "/docs/b.md"]} />);
      await act(async () => fireEvent.press(button(view, "New Tab")));
      await act(async () => fireEvent.press(button(view, "Open File")));
      const latePick = mockUseMarkdownDocumentSession.mock.calls.at(-1)![0].onOpenFile;
      await act(async () => fireEvent.press(view.getByLabelText("Close New Tab")));
      await act(async () => fireEvent.press(view.getAllByLabelText("a.md").find(node => node.props.accessibilityRole === "tab")!));
      await act(async () => latePick("/docs/b.md"));
      expect(tabs(view)).toEqual(["a.md*", "b.md"]);
      await view.unmount();
    });

    it("closes the Open File panel once its empty tab is replaced", async () => {
      mockSidebarFolders = ["/notes"];
      const view = await render(<MarkdownEditorWindow />);
      await act(async () => fireEvent.press(button(view, "New Tab")));
      const panel = await showPanel(view);
      mockOpenFilePanel = null;
      jest.mocked(createMarkdownDraft).mockReturnValueOnce("/test-drafts/Untitled.md");
      await act(async () => menus().onNewDocument());
      expect(mockOpenFilePanel).toBeNull();
      await act(async () => panel.onOpen("/notes/late.md"));
      expect(tabs(view)).toEqual(["Untitled.md*"]);
      await view.unmount();
    });
  });

  it("opens a draft tab for the New startup setting", async () => {
    jest.mocked(getMarkdownStartupBehaviorSetting).mockReturnValue("newDocument");
    jest.mocked(createMarkdownDraft).mockReturnValue("/test-drafts/Untitled.md");
    const view = await render(<MarkdownEditorWindow />);

    expect(createMarkdownDraft).toHaveBeenCalledTimes(1);
    expect(mockSession.openSelectedFile).toHaveBeenCalledWith("/test-drafts/Untitled.md");
    await view.unmount();
  });

  it("creates a draft tab on a new-document launch even when startup restores the last document", async () => {
    jest.mocked(getMarkdownStartupBehaviorSetting).mockReturnValue("lastDocument");
    jest.mocked(getLastMarkdownDocumentPath).mockReturnValue("/tmp/recent.md");
    jest.mocked(createMarkdownDraft).mockReturnValue("/test-drafts/Untitled.md");

    const view = await render(<MarkdownEditorWindow launchArguments={[newMarkdownDocumentLaunchArgument]} />);

    expect(createMarkdownDraft).toHaveBeenCalledTimes(1);
    expect(mockSession.openSelectedFile).toHaveBeenCalledWith("/test-drafts/Untitled.md");
    expect(mockSession.openSelectedFile).not.toHaveBeenCalledWith("/tmp/recent.md");
    await view.unmount();
  });

  it("sizes the title bar from the chrome theme", async () => {
    mockChromeTheme.titleBarHeight = 44;
    try {
      const view = await render(<MarkdownEditorWindow />);

      // The sidebar header holds the toggle and spans the title bar.
      expect(StyleSheet.flatten(view.getByLabelText("Hide Sidebar").parent?.props.style).height).toBe(44);
      await view.unmount();
    } finally {
      mockChromeTheme.titleBarHeight = 36;
    }
  });

  it("keeps session chrome state changes out of the document render path", async () => {
    const view = await render(<MarkdownEditorWindow files={["/tmp/test.md"]} />);
    const initialDocumentRenderCount = mockMarkdownDocument.mock.calls.length;

    await act(async () => {
      mockSessionState$.assign({
        isDirty: true,
        lastError: "Unable to save",
        saveState: "saving",
      });
    });

    expect(view.getByText("Unable to save")).toBeTruthy();
    expect(mockMarkdownDocument).toHaveBeenCalledTimes(initialDocumentRenderCount);
    await view.unmount();
  });

  it.each(["idle", "saving", "error"] as const)("checks file contents even while %s or dirty", async (saveState) => {
    jest.useFakeTimers();
    mockSessionState$.assign({ documentSource: "file", filename: "/tmp/test.md", isDirty: true, saveState });
    const view = await render(<MarkdownEditorWindow />);
    expect(mockWatchFiles).toHaveBeenCalledWith("/tmp", expect.any(Function), { recursive: true });
    const changed = mockWatchFiles.mock.calls[0]?.[1];
    await act(async () => {
      changed?.("/tmp/test.md");
      jest.advanceTimersByTime(100);
    });
    expect(mockCheckForExternalChanges).toHaveBeenCalledTimes(1);
    expect(mockReloadDocument).not.toHaveBeenCalled();
    await view.unmount();
    jest.useRealTimers();
  });

  it("offers all conflict resolutions and hides Use disk for deleted files", async () => {
    mockSessionState$.conflict.set("changed");
    const view = await render(<MarkdownEditorWindow files={["/tmp/test.md"]} />);
    await fireEvent.press(view.getByText("Use disk"));
    await fireEvent.press(view.getByText("Overwrite with local"));
    await fireEvent.press(view.getByText("Save local separately"));
    expect(mockSession.useDiskVersion).toHaveBeenCalledTimes(1);
    expect(mockSession.overwriteWithLocal).toHaveBeenCalledTimes(1);
    expect(mockSession.saveCurrentDocumentAs).toHaveBeenCalledWith(true);
    await act(async () => { mockSessionState$.conflict.set("missing"); });
    expect(view.queryByText("Use disk")).toBeNull();
    expect(view.getByText(/removed from disk/)).toBeTruthy();
    await view.unmount();
  });

  describe("split panes", () => {
    const menus = () => jest.requireMock("../useMarkdownMenus").useMarkdownMenus.mock.calls.at(-1)[0];
    const measure = async (view: Awaited<ReturnType<typeof render>>) => {
      await act(async () => fireEvent(view.getByTestId("markdown-pane-area"), "layout", { nativeEvent: { layout: { height: 800, width: 1206 } } }));
    };
    // The animated rect around a pane's tab row and card carries its frame.
    const paneRect = (view: Awaited<ReturnType<typeof render>>, paneId: string) => {
      let node = view.getByTestId(`markdown-pane-${paneId}`).parent;
      while (node && node.type !== "Animated.View") node = node.parent;
      return node!;
    };
    const paneStyle = (view: Awaited<ReturnType<typeof render>>, paneId: string) => {
      const node = paneRect(view, paneId);
      const style = StyleSheet.flatten(node!.props.style) as Record<string, { value: number }>;
      return { height: style.height.value, left: style.left.value, top: style.top.value, width: style.width.value };
    };

    beforeEach(() => {
      mockSavedPaneLayout = undefined;
      jest.requireMock("../markdownSettings").setMarkdownPaneLayoutSetting.mockClear();
      mockSessionState$.assign({ documentSource: "file", filename: "/docs/a.md" });
    });

    it("splits right into a focused pane on the same document, and closes it back into its neighbour", async () => {
      jest.useFakeTimers();
      const view = await render(<MarkdownEditorWindow files={["/docs/a.md", "/docs/b.md"]} />);
      expect(menus().paneCommandState).toEqual({ canSplitDown: false, canSplitRight: false, hasOtherPanes: false });
      await measure(view);
      expect(menus().paneCommandState).toEqual({ canSplitDown: true, canSplitRight: true, hasOtherPanes: false });

      await act(async () => menus().paneCommands.splitRight());
      expect(view.getByTestId("markdown-pane-p1")).toBeTruthy();
      expect(menus().paneCommandState.hasOtherPanes).toBe(true);
      // The sidebar hides for single-file windows, so the cards keep a 6 pt gutter on every side but the top.
      expect(paneStyle(view, "p0")).toEqual({ height: 794, left: 6, top: 0, width: 594 });
      expect(paneStyle(view, "p1")).toEqual({ height: 794, left: 606, top: 0, width: 594 });
      await fireEvent.press(view.getByLabelText("Show Sidebar"));
      expect(view.getByLabelText("Hide Sidebar")).toBeTruthy();
      expect(paneStyle(view, "p0").left).toBe(6);

      const tabsOf = (paneId: string) => within(paneRect(view, paneId)).queryAllByLabelText(/\.md$/).filter(node => node.props.accessibilityRole === "tab").map(node => node.props.accessibilityLabel);
      expect(tabsOf("p1")).toEqual(["a.md"]);

      await act(async () => { jest.advanceTimersByTime(300); });
      const { setMarkdownPaneLayoutSetting } = jest.requireMock("../markdownSettings");
      expect(setMarkdownPaneLayoutSetting).toHaveBeenLastCalledWith(expect.objectContaining({ focused: "p1", root: expect.objectContaining({ axis: "horizontal" }) }));

      await act(async () => menus().paneCommands.closePane());
      expect(view.queryByTestId("markdown-pane-p1")).toBeNull();
      expect(paneStyle(view, "p0").width).toBe(1194);
      expect(menus().paneCommandState.hasOtherPanes).toBe(false);
      await view.unmount();
      jest.useRealTimers();
    });

    it("checks both dirty panes before allowing their window to close", async () => {
      const { createPaneLayout, openPaneTab, splitPane } = jest.requireActual("@legend-apps/workspace");
      const layout = createPaneLayout({ active: "/docs/a.md", paths: ["/docs/a.md"] });
      mockSavedPaneLayout = openPaneTab(splitPane(layout, "horizontal"), "p1", "/docs/b.md");

      const makeDirtySession = (filename: string) => {
        const sessionState$ = observable({ ...mockSessionState$.peek(), filename, isDirty: true });
        return {
          ...mockSession,
          sessionState$,
          prepareCurrentDocumentForClose: jest.fn(async () => {
            sessionState$.isDirty.set(false);
            return true;
          }),
        };
      };
      const first = makeDirtySession("/docs/a.md");
      const second = makeDirtySession("/docs/b.md");
      second.prepareCurrentDocumentForClose.mockResolvedValueOnce(false);
      const sessions = [first, second];
      mockUseMarkdownDocumentSession.mockImplementation(() => {
        const [session] = React.useState(() => sessions.shift()!);
        return session;
      });

      let guard: Parameters<typeof beforeWindowClose>[1] | undefined;
      const remove = jest.fn(async () => { guard = undefined; });
      mockBeforeWindowClose.mockImplementation(async (_windowId, handler) => {
        if (guard) throw Object.assign(new Error("Window already has a close guard"), { code: "E_BUSY" });
        guard = handler;
        return { remove };
      });

      const view = await render(<MarkdownEditorWindow />);
      try {
        await act(async () => { expect(await guard!()).toBe(false); });
        expect(first.prepareCurrentDocumentForClose).toHaveBeenCalledWith({ autosaveEnabled: true, reason: "close" });
        expect(second.prepareCurrentDocumentForClose).toHaveBeenCalledWith({ autosaveEnabled: true, reason: "close" });
        expect(first.sessionState$.isDirty.peek()).toBe(false);
        expect(second.sessionState$.isDirty.peek()).toBe(true);

        await act(async () => { expect(await guard!()).toBe(true); });
        expect(second.sessionState$.isDirty.peek()).toBe(false);
        expect(mockBeforeWindowClose).toHaveBeenCalledTimes(1);
        expect(mockBeforeWindowClose).toHaveBeenCalledWith("markdown-editor", expect.any(Function), expect.any(Object));
      } finally {
        await view.unmount();
        mockSavedPaneLayout = undefined;
        mockUseMarkdownDocumentSession.mockImplementation(() => mockSession);
        mockBeforeWindowClose.mockResolvedValue({ remove: jest.fn(async () => {}) });
      }
      expect(remove).toHaveBeenCalledTimes(1);
    });

    it("restores saved panes, tabs and focus in the main window", async () => {
      const { createPaneLayout, openPaneTab, splitPane } = jest.requireActual("@legend-apps/workspace");
      const saved = splitPane(splitPane(createPaneLayout({ active: "/docs/a.md", paths: ["/docs/a.md"] }), "horizontal"), "vertical");
      mockSavedPaneLayout = JSON.parse(JSON.stringify({ ...openPaneTab(saved, "p2", "/docs/c.md"), focused: "p1" }));
      const view = await render(<MarkdownEditorWindow />);
      expect(["p0", "p1", "p2"].map(id => !!view.queryByTestId(`markdown-pane-${id}`))).toEqual([true, true, true]);
      await measure(view);
      expect(paneStyle(view, "p2").top).toBe(397);
      expect(mockSession.openSelectedFile).toHaveBeenCalledWith("/docs/c.md");
      await view.unmount();

      // Another window never takes the main window's panes.
      const other = await render(<MarkdownEditorWindow windowId="markdown-editor-2" />);
      expect(other.queryByTestId("markdown-pane-p1")).toBeNull();
      await other.unmount();
    });

    it("drags tabs between panes: onto a bar slot, onto an edge to split, closing an emptied pane", async () => {
      jest.useFakeTimers();
      const { createPaneLayout, openPaneTab, splitPane } = jest.requireActual("@legend-apps/workspace");
      const saved = openPaneTab(splitPane(createPaneLayout({ active: "/docs/a.md", paths: ["/docs/a.md", "/docs/b.md"] }), "horizontal"), "p1", "/docs/c.md");
      mockSavedPaneLayout = JSON.parse(JSON.stringify({ ...saved, panes: { ...saved.panes, p1: { active: "/docs/c.md", paths: ["/docs/c.md"] } } }));
      const view = await render(<MarkdownEditorWindow />);
      await measure(view);
      type Node = ReturnType<typeof paneRect>;
      const findAll = (node: Node, match: (node: Node) => boolean): Node[] => [
        ...(match(node) ? [node] : []),
        ...node.children.flatMap(child => typeof child === "string" ? [] : findAll(child as Node, match)),
      ];
      const drag = (paneId: string, path: string) => act(async () => {
        findAll(paneRect(view, paneId), node => node.props.source?.data?.["application/x-legend-markdown-tab"] === path)[0].props.onDragStart();
      });
      const targets = (paneId: string) => findAll(paneRect(view, paneId), node => typeof node.props.onDrop === "function");
      const tabsOf = (paneId: string) => within(paneRect(view, paneId)).queryAllByLabelText(/\.md$/).filter(node => node.props.accessibilityRole === "tab").map(node => node.props.accessibilityLabel);

      // Onto p1's right edge: p1 splits and the new pane holds just the tab.
      await drag("p0", "/docs/b.md");
      const card = targets("p1").find(node => node.props.onLayout)!;
      await act(async () => card.props.onLayout({ nativeEvent: { layout: { height: 770, width: 594 } } }));
      await act(async () => card.props.onDragOver({ operation: "move", x: 580, y: 300 }));
      await act(async () => card.props.onDrop({ operation: "move", x: 580, y: 300 }));
      expect(tabsOf("p0")).toEqual(["a.md"]);
      expect(tabsOf("p2")).toEqual(["b.md"]);
      expect(paneStyle(view, "p2").left).toBeGreaterThan(paneStyle(view, "p1").left);

      // Onto p0's bar before a.md: p1 loses its last tab and closes; its shown document is saved first.
      mockSession.prepareCurrentDocumentForClose.mockClear();
      await drag("p1", "/docs/c.md");
      await act(async () => targets("p0").find(node => !node.props.onLayout)!.props.onDrop({ operation: "move", x: -10, y: 10 }));
      expect(mockSession.prepareCurrentDocumentForClose).toHaveBeenCalledWith({ autosaveEnabled: true, reason: "close" });
      expect(view.queryByTestId("markdown-pane-p1")).toBeNull();
      expect(tabsOf("p0")).toEqual(["c.md", "a.md"]);

      await act(async () => { jest.advanceTimersByTime(300); });
      const { setMarkdownPaneLayoutSetting } = jest.requireMock("../markdownSettings");
      expect(setMarkdownPaneLayoutSetting).toHaveBeenLastCalledWith(expect.objectContaining({
        focused: "p0",
        panes: { p0: { active: "/docs/c.md", paths: ["/docs/c.md", "/docs/a.md"] }, p2: { active: "/docs/b.md", paths: ["/docs/b.md"] } },
      }));
      await view.unmount();
    });

    it("resizes live while dragging a divider and evens a split on double-click", async () => {
      const view = await render(<MarkdownEditorWindow files={["/docs/a.md"]} />);
      await measure(view);
      await act(async () => menus().paneCommands.splitRight());
      const divider = view.getByLabelText("Resize panes side by side");
      await act(async () => {
        divider.props.onPanResponderGrant();
        divider.props.onPanResponderMove({}, { dx: -120, dy: 0 });
      });
      expect(paneStyle(view, "p0").width).toBe(474);
      await act(async () => divider.props.onPanResponderMove({}, { dx: -2000, dy: 0 }));
      expect(paneStyle(view, "p0").width).toBe(220);
      await act(async () => divider.props.onPanResponderMove({}, { dx: 2000, dy: 0 }));
      expect(paneStyle(view, "p1").width).toBe(220);
      await act(async () => divider.props.onPanResponderRelease());
      for (let click = 0; click < 2; click++) {
        await act(async () => {
          divider.props.onPanResponderGrant();
          divider.props.onPanResponderRelease();
        });
      }
      expect(paneStyle(view, "p0").width).toBe(594);
      await view.unmount();
    });

    it("keeps a stacked pane tall enough for Open File under the chrome theme's tab bar", async () => {
      for (const [titleBarHeight, minHeight] of [[36, 156], [80, 200]]) {
        mockChromeTheme.titleBarHeight = titleBarHeight;
        const view = await render(<MarkdownEditorWindow files={["/docs/a.md"]} />);
        await measure(view);
        await act(async () => menus().paneCommands.splitDown());
        const divider = view.getByLabelText("Resize stacked panes");
        await act(async () => {
          divider.props.onPanResponderGrant();
          divider.props.onPanResponderMove({}, { dx: 0, dy: 2000 });
        });
        expect(paneStyle(view, "p1").height).toBe(minHeight);
        await view.unmount();
      }
      mockChromeTheme.titleBarHeight = 36;
    });

    it("closes a split pane once Close Tab empties it, keeping focus on the neighbour", async () => {
      const view = await render(<MarkdownEditorWindow files={["/docs/a.md", "/docs/b.md"]} />);
      await measure(view);
      await act(async () => menus().paneCommands.splitDown());
      expect(view.getByTestId("markdown-pane-p1")).toBeTruthy();
      await act(async () => menus().paneCommands.closeTab());
      expect(view.queryByTestId("markdown-pane-p1")).toBeNull();
      expect(menus().paneCommandState.hasOtherPanes).toBe(false);
      await view.unmount();
    });
  });
});

describe("MarkdownEditorWindow save identity", () => {
  const { useMarkdownMenus } = jest.requireMock("../useMarkdownMenus");
  const menu = () => useMarkdownMenus.mock.lastCall[0] as Parameters<typeof import("../useMarkdownMenus").useMarkdownMenus>[0];
  const saveAs = jest.fn(async (_path: string) => {});
  const draft = "/test-drafts/Untitled.md";
  const destination = "/docs/copy.md";
  const tab = (view: Awaited<ReturnType<typeof render>>, label: string) =>
    view.queryAllByLabelText(label).find(node => node.props.accessibilityRole === "tab");

  beforeEach(() => {
    (globalThis as typeof globalThis & { __DEV__?: boolean }).__DEV__ = true;
    mockUseMarkdownDocumentSession.mockImplementation(jest.requireActual("../useMarkdownDocumentSession").useMarkdownDocumentSession);
    mockMarkdownDocument.mockImplementation(props => {
      const { commandsRef, filename } = props as MarkdownDocumentProps;
      React.useEffect(() => {
        if (!commandsRef || typeof commandsRef === "function") return;
        commandsRef.current = { saveAs, commitAndBlurActiveBlock: jest.fn() } as unknown as NonNullable<typeof commandsRef.current>;
        return () => { commandsRef.current = null; };
      }, [commandsRef]);
      return <Text>{`document:${filename}`}</Text>;
    });
    jest.mocked(createMarkdownDraft).mockReturnValue(draft);
    jest.mocked(saveFileDialog).mockReset();
    jest.mocked(removeMarkdownDraft).mockClear();
    saveAs.mockClear();
  });

  afterEach(() => {
    mockUseMarkdownDocumentSession.mockImplementation(() => mockSession);
    mockMarkdownDocument.mockImplementation(() => <Text>markdown-document</Text>);
    mockSavedPaneLayout = undefined;
  });

  it.each(["draft", "file"] as const)("preserves the mounted document after saving a %s under a new path", async source => {
    const original = source === "draft" ? draft : "/docs/original.md";
    const view = await render(<MarkdownEditorWindow files={source === "draft" ? [] : [original]} />);
    if (source === "draft") await act(async () => menu().onNewDocument());
    const document = view.getByText(`document:${original}`);
    const save = source === "draft" ? menu().onSaveDocument : menu().onSaveDocumentAs;
    await act(async () => { menu().sessionState$.isDirty.set(true); });
    jest.mocked(saveFileDialog).mockResolvedValueOnce({ canceled: true });
    await act(async () => { expect(await save()).toBe(false); });
    expect(view.getByText(`document:${original}`)).toBe(document);
    expect(menu().sessionState$.isDirty.peek()).toBe(true);

    jest.mocked(saveFileDialog).mockResolvedValueOnce({ canceled: false, path: destination });
    await act(async () => { expect(await save()).toBe(true); });
    expect(view.getByText(`document:${destination}`)).toBe(document);
    expect(tab(view, "copy.md")?.props.accessibilityState.selected).toBe(true);
    expect(menu().sessionState$.isDirty.peek()).toBe(false);
    expect(saveAs).toHaveBeenCalledWith(destination);
    if (source === "draft") expect(removeMarkdownDraft).toHaveBeenCalledWith(draft);
    else expect(removeMarkdownDraft).not.toHaveBeenCalled();

    await fireEvent.press(view.getByLabelText("Close copy.md"));
    expect(view.queryByText(`document:${destination}`)).toBeNull();
    jest.mocked(openFileDialog).mockResolvedValueOnce({ canceled: false, paths: [destination] });
    await act(async () => menu().onOpenDocument());
    expect(view.getByText(`document:${destination}`)).not.toBe(document);
    await view.unmount();
  });

  it.each([true, false])("keeps the destination when closing a draft into it (visited: %s)", async visited => {
    const view = await render(<MarkdownEditorWindow files={[destination, ...(visited ? [] : ["/docs/other.md"])]} />);
    const document = view.queryByText(`document:${destination}`);
    await act(async () => menu().onNewDocument());
    await act(async () => { menu().sessionState$.isDirty.set(true); });
    jest.mocked(confirmDirtyDocumentTransition).mockResolvedValueOnce("cancel");
    await fireEvent.press(view.getByLabelText("Close Untitled.md"));
    expect(tab(view, "Untitled.md")?.props.accessibilityState.selected).toBe(true);

    jest.mocked(confirmDirtyDocumentTransition).mockResolvedValueOnce("save");
    jest.mocked(saveFileDialog).mockResolvedValueOnce({ canceled: false, path: destination });
    await fireEvent.press(view.getByLabelText("Close Untitled.md"));
    expect(tab(view, "Untitled.md")).toBeUndefined();
    expect(tab(view, "copy.md")?.props.accessibilityState.selected).toBe(true);
    const savedDocument = view.getByText(`document:${destination}`);
    if (visited) expect(savedDocument).toBe(document);
    expect(saveAs).toHaveBeenCalledWith(destination);
    expect(removeMarkdownDraft).toHaveBeenCalledWith(draft);
    await view.unmount();
  });

  it("renames a restored tab independently of the same path in another pane", async () => {
    const { createPaneLayout, openPaneTab, focusPane, splitPane } = jest.requireActual("@legend-apps/workspace");
    const original = "/docs/original.md";
    const split = splitPane(createPaneLayout({ active: original, paths: [original] }), "horizontal");
    mockSavedPaneLayout = focusPane(openPaneTab(split, split.focused, destination), "p0");
    const view = await render(<MarkdownEditorWindow />);
    const left = within(view.getByTestId("markdown-pane-p0"));
    const right = within(view.getByTestId("markdown-pane-p1"));
    const sourceDocument = left.getByText(`document:${original}`);
    const otherDocument = right.getByText(`document:${destination}`);

    jest.mocked(saveFileDialog).mockResolvedValueOnce({ canceled: false, path: destination });
    await act(async () => { expect(await menu().onSaveDocumentAs()).toBe(true); });
    expect(left.getByText(`document:${destination}`)).toBe(sourceDocument);
    expect(right.getByText(`document:${destination}`)).toBe(otherDocument);

    jest.mocked(openFileDialog).mockResolvedValueOnce({ canceled: false, paths: [original] });
    await act(async () => menu().onOpenDocument());
    expect(left.getByText(`document:${original}`)).not.toBe(sourceDocument);
    expect(left.getByText(`document:${destination}`, { includeHiddenElements: true })).toBe(sourceDocument);
    await view.unmount();
  });
});
