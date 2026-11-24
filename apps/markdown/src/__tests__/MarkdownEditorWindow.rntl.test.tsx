import { act, fireEvent, render, within } from "@testing-library/react-native";
import { watch } from "@legendapp/spark/files";
import { beforeWindowClose } from "@legendapp/spark/windows";
import { observable } from "@legendapp/state";
import React from "react";
import { StyleSheet, Text } from "react-native";
import type { TestInstance } from "test-renderer";
import { MarkdownEditorWindow } from "../MarkdownEditorWindow";
import { newMarkdownDocumentLaunchArgument } from "../markdownFiles";
import { getLastMarkdownDocumentPath, getMarkdownStartupBehaviorSetting } from "../markdownSettings";
import { useMarkdownAppExit } from "../useMarkdownDocumentEvents";
import type { MarkdownDocumentSessionState } from "../useMarkdownDocumentSession";

const mockUseMarkdownAppExit = useMarkdownAppExit as jest.MockedFunction<typeof useMarkdownAppExit>;
const mockBeforeWindowClose = jest.mocked(beforeWindowClose);
const { useMarkdownDocumentSession: mockUseMarkdownDocumentSession } = jest.requireMock<{
  useMarkdownDocumentSession: jest.Mock<typeof mockSession, []>;
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
  documentSource: "untitled",
  filename: "test.md",
  isDirty: false,
  lastError: null,
  saveState: "idle",
});
const mockSession = {
  clearDocumentError: jest.fn(),
  documentCommandsRef: {
    current: {
      invalidateLayoutMeasurements: mockInvalidateLayoutMeasurements,
      reload: mockReloadDocument,
      checkForExternalChanges: mockCheckForExternalChanges,
    },
  },
  flushCurrentDocumentBeforeTransition: jest.fn(async () => true),
  handleError: jest.fn(),
  handleDocumentLoaded: jest.fn(),
  handleDocumentLoadError: jest.fn(),
  newMarkdownDocument: jest.fn(),
  openMarkdownDialog: jest.fn(),
  // Opening a file shows it, as the real session does, so the pane's active tab and its document agree.
  openSelectedFile: jest.fn((path: string) => mockSessionState$.assign({ documentSource: "file", filename: path })),
  openUntitledDocument: jest.fn(),
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

jest.mock("@legendapp/spark/ui/glass", () => ({
  GlassView: (props: object) => require("react").createElement(require("react-native").View, { ...props, testID: "mock-glass" }),
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

jest.mock("../useMarkdownDocumentSession", () => ({
  useMarkdownDocumentSession: jest.fn(() => mockSession),
}));

jest.mock("../useMarkdownDocumentEvents", () => ({
  getStartupMarkdownPath: jest.requireActual("../useMarkdownDocumentEvents").getStartupMarkdownPath,
  useMarkdownAppExit: jest.fn(),
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
  setMarkdownSidebarFoldersSetting: jest.fn(),
  setMarkdownSidebarOpenSetting: jest.fn(),
  useMarkdownAppearanceSettings: () => ({}),
  useMarkdownAutosaveSetting: () => "enabled",
  useMarkdownChromeTheme: () => mockChromeTheme,
  useMarkdownDisplayThemeSetting: () => "system",
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
    jest.mocked(getLastMarkdownDocumentPath).mockReturnValue(null);
    jest.mocked(getMarkdownStartupBehaviorSetting).mockReturnValue("newDocument");
    mockCheckForExternalChanges.mockClear();
    (globalThis as typeof globalThis & { __DEV__?: boolean }).__DEV__ = true;
    mockMarkdownE2EEditorSmoke.mockClear();
    mockMarkdownE2ERunner.mockClear();
    mockMarkdownDocument.mockClear();
    mockInvalidateLayoutMeasurements.mockClear();
    mockReloadDocument.mockClear();
    mockWatchFiles.mockClear();
    mockWatchFiles.mockResolvedValue({ remove: jest.fn(async () => {}) });
    mockUseMarkdownAppExit.mockClear();
    mockBeforeWindowClose.mockClear();
    mockSessionState$.assign({
      conflict: null,
      commandState: { canCommitAndBlur: false, canRedo: false, canUndo: false },
      documentSource: "untitled",
      filename: "test.md",
      isDirty: false,
      lastError: null,
      saveState: "idle",
    });
  });

  it("puts the pane cards on one Liquid Glass chrome that meets AppKit's sidebar glass through a clear divider", async () => {
    const view = await render(<MarkdownEditorWindow files={["/Alpha.md", "/Beta.md"]} />);
    const glass = () => view.getByTestId("mock-glass");
    expect(view.getAllByTestId("mock-glass")).toHaveLength(1);
    const surface = glass().parent!;
    expect(surface.props.pointerEvents).toBe("none");
    expect(glass().props.glassStyle).toBeUndefined();
    expect((surface.children[1] as TestInstance).props.style).toEqual(expect.arrayContaining([{ opacity: 0.8 }]));
    // The split view sits over the glass, divider clear, with the pane cards in its content.
    const splitView = surface.parent!.children[1] as TestInstance;
    expect(splitView.props.dividerColor).toBe("#00000000");
    expect(within(splitView).getAllByLabelText("Beta.md").some(node => node.props.accessibilityRole === "tab")).toBe(true);
    expect(within(splitView).getByTestId("markdown-pane-p0")).toBeTruthy();
    // AppKit already draws the sidebar in glass: the sidebar takes only the tint, and this glass starts at its edge.
    const sidebar = splitView.children[0] as TestInstance;
    expect(within(sidebar).getByText("Add Folder…")).toBeTruthy();
    expect(StyleSheet.flatten((sidebar.children[0] as TestInstance).props.style).opacity).toBe(0.8);
    const left = () => StyleSheet.flatten(glass().parent!.props.style).left;
    expect(left()).toBe(0);
    await act(async () => splitView.props.onResize({ contentX: 221, sidebarWidth: 220, sidebarX: 0 }));
    expect(left()).toBe(220);
    await act(async () => splitView.props.onResize({ contentX: 0, sidebarWidth: 0, sidebarX: 0 }));
    expect(left()).toBe(0);
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
    const view = await render(<MarkdownEditorWindow />);
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
    const view = await render(<MarkdownEditorWindow />);

    expect(mockUseMarkdownAppExit).toHaveBeenCalledWith({
      autosaveEnabled: true,
      handleError: mockSession.handleError,
      prepareCurrentDocumentForClose: mockSession.prepareCurrentDocumentForClose,
    });
    await view.unmount();
  });

  it("switches and closes file tabs through the dirty-document flow", async () => {
    // The sidebar lists the same files, so tabs are found by role.
    const tab = (view: Awaited<ReturnType<typeof render>>, label: string) => view.queryAllByLabelText(label).find(node => node.props.accessibilityRole === "tab");
    mockSessionState$.assign({ documentSource: "file", filename: "/docs/a.md" });
    const view = await render(<MarkdownEditorWindow files={["/docs/a.md", "/docs/b.md"]} />);
    // Single-file windows start with the sidebar hidden even though the setting is open.
    expect(view.getByLabelText("Show Sidebar")).toBeTruthy();

    await act(async () => fireEvent.press(tab(view, "b.md")!));
    expect(mockSession.prepareCurrentDocumentForClose).toHaveBeenLastCalledWith({ autosaveEnabled: true, reason: "open" });
    expect(mockSession.openSelectedFile).toHaveBeenLastCalledWith("/docs/b.md");

    mockSession.prepareCurrentDocumentForClose.mockClear();
    mockSession.prepareCurrentDocumentForClose.mockResolvedValueOnce(false);
    await act(async () => fireEvent.press(view.getByLabelText("Close b.md")));
    expect(tab(view, "b.md")).toBeTruthy();
    await act(async () => fireEvent.press(view.getByLabelText("Close b.md")));
    expect(mockSession.prepareCurrentDocumentForClose).toHaveBeenCalledTimes(2);
    expect(mockSession.prepareCurrentDocumentForClose).toHaveBeenLastCalledWith({ autosaveEnabled: true, reason: "close" });
    expect(tab(view, "b.md")).toBeUndefined();
    expect(mockSession.openSelectedFile).toHaveBeenLastCalledWith("/docs/a.md");

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

  it("leaves a clean untitled document blank and focused", async () => {
    mockSessionState$.assign({
      documentSource: "untitled",
      isDirty: false,
      lastError: null,
    });

    const view = await render(<MarkdownEditorWindow />);

    expect(view.queryByText("Untitled")).toBeNull();
    expect(view.queryByText("Start writing")).toBeNull();
    expect(mockMarkdownDocument).toHaveBeenLastCalledWith(expect.objectContaining({ autoFocusFirstBlock: true }));
    await view.unmount();
  });

  it("opens an untitled pane on a new-document launch even when the startup setting restores the last document", async () => {
    jest.mocked(getMarkdownStartupBehaviorSetting).mockReturnValue("lastDocument");
    jest.mocked(getLastMarkdownDocumentPath).mockReturnValue("/tmp/recent.md");
    mockSession.openSelectedFile.mockClear();
    mockSession.openUntitledDocument.mockClear();

    const view = await render(<MarkdownEditorWindow launchArguments={[newMarkdownDocumentLaunchArgument]} />);

    expect(mockSession.openUntitledDocument).toHaveBeenCalledTimes(1);
    expect(mockSession.openSelectedFile).not.toHaveBeenCalled();
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
    const view = await render(<MarkdownEditorWindow />);
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
    const view = await render(<MarkdownEditorWindow />);
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
      return { left: style.left.value, top: style.top.value, width: style.width.value };
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
      expect(paneStyle(view, "p0")).toEqual({ left: 6, top: 0, width: 594 });
      expect(paneStyle(view, "p1")).toEqual({ left: 606, top: 0, width: 594 });
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
