import { watch } from "@legendapp/spark/files";
import { ownRegistration } from "@legend-apps/runtime-utils";
import { getDirectory } from "./markdownFiles";
import { SidebarSplitView } from "@legendapp/spark/ui/split-view";
import {
  MarkdownDocument,
  type MarkdownDocumentProps,
  type MarkdownSelectionAnchor,
} from "@legend-apps/markdown-document";
import { getLegendDisplayTheme, getLegendDisplayThemeAppearance, getMarkdownLayoutTheme } from "@legend-apps/theme";
import {
  canSplitPane,
  chooseFolders,
  closeDocumentTab,
  closeOtherPanes,
  closePane,
  closePaneTab,
  createPaneLayout,
  createWorkspaceFile,
  createWorkspaceFolder,
  DocumentTabBar,
  focusAdjacentPane,
  focusPane,
  getNewEntryDirectory,
  getPaneHeir,
  getPaneIds,
  layoutPanes,
  movePaneTab,
  openPaneTab,
  paneGap,
  renamePaneTab,
  setSplitFraction,
  splitPane,
  splitPaneWithTab,
  useDocumentWindow,
  useWorkspaceWindow,
  WorkspaceSidebar,
  type DocumentTabBarProps,
  type DocumentTabs,
  type PaneFrame,
  type PaneLayout,
} from "@legend-apps/workspace";
import { closeWindow } from "@legendapp/spark/windows";
import { getPaneCardColor, MarkdownPaneArea, MarkdownPaneChrome, PaneTabDropTarget, type TabDropZone } from "./MarkdownPaneArea";
import { useValue } from "@legendapp/state/react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { InteractionManager, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import {
  MarkdownE2EEditorSmoke,
  type MarkdownE2EEditorSmokeVariant,
} from "./MarkdownE2EEditorSmoke";
import {
  getMarkdownE2ERunFromLaunchArguments,
  isMarkdownDocumentE2EScenario,
  type MarkdownE2ELaunchScenario,
  MarkdownE2ERunner,
} from "./MarkdownE2ERunner";
import { MarkdownFloatingSurface } from "./MarkdownFloatingSurface";
import { MarkdownFormattingToolbar } from "./MarkdownFormattingToolbar";
import {
  getStartupMarkdownPath,
  useMarkdownAppExit,
  useMarkdownWindowCloseRequest,
  useRecentMarkdownDocumentOpener,
} from "./useMarkdownDocumentEvents";
import { useMarkdownDocumentSession } from "./useMarkdownDocumentSession";
import { useMarkdownKeyboardShortcuts } from "./useMarkdownKeyboardShortcuts";
import { useMarkdownMenus } from "./useMarkdownMenus";
import {
  useMarkdownEditorWindowOptions,
  useMarkdownSettingsWindow,
} from "./useMarkdownWindows";
import { editorWindowIdentifier } from "./appConstants";
import { getLaunchMarkdownFile, isMarkdownPath, shouldLaunchNewMarkdownDocument } from "./markdownFiles";
import type { MarkdownEditorWindowProps } from "./markdownWindows";
import {
  applyMarkdownThemeSetting,
  getMarkdownPaneLayoutSetting,
  getMarkdownSidebarFoldersSetting,
  getMarkdownSidebarOpenSetting,
  setMarkdownPaneLayoutSetting,
  setMarkdownSidebarFoldersSetting,
  setMarkdownSidebarOpenSetting,
  useMarkdownAppearanceSettings,
  useMarkdownAutosaveSetting,
  useMarkdownChromeTheme,
  useMarkdownDisplayThemeSetting,
  useMarkdownFormattingToolbarModeSetting,
  useMarkdownLayoutThemeSetting,
} from "./markdownSettings";
import {
  getMarkdownLayoutForAppearance,
  getMarkdownStyleForAppearance,
} from "./markdownAppearance";
import { getMarkdownMeasurementSignature } from "./markdownMeasurementSignature";
import { MarkdownLinkPopover } from "./MarkdownLinkPopover";
import { loadMarkdownUserThemesSync } from "./userThemes";
import { untitledMarkdownAdapter } from "./untitledMarkdownAdapter";
import { refreshMarkdownEditorMenuState } from "./markdownEditorActions";

const newMarkdownFileName = "Untitled.md";
/** A dragged tab carries its path under this type. */
const tabDragType = "application/x-legend-markdown-tab";

type MarkdownDocumentSession = ReturnType<typeof useMarkdownDocumentSession>;
type MarkdownFormattingToolbarMode = ReturnType<typeof useMarkdownFormattingToolbarModeSetting>;

function editorSmokeVariantForScenario(scenario: MarkdownE2ELaunchScenario): MarkdownE2EEditorSmokeVariant | null {
  if (scenario === "editor-large-document") return "largeDocument";
  if (scenario === "editor-selection-smoke") {
    return "selection";
  }
  if (scenario === "editor-soft-wrap-selection") {
    return "softWrap";
  }
  if (scenario === "editor-code-block-smoke") {
    return "codeBlock";
  }
  if (scenario === "editor-edit-navigation-smoke") {
    return "editNavigation";
  }
  if (scenario === "editor-navigation-smoke") {
    return "navigation";
  }
  if (scenario === "editor-theme-reflow-smoke") {
    return "themeReflow";
  }
  if (scenario === "editor-ui-smoke") {
    return "ui";
  }
  return null;
}

type PaneCommands = Omit<Parameters<typeof useMarkdownMenus>[0]["paneCommands"], "closeTab">;
type PaneCommandState = Parameters<typeof useMarkdownMenus>[0]["paneCommandState"];

type PaneActions = {
  /** Whether the tab being dragged in this window can drop on that part of the pane. */
  canDropTab: (paneId: string, zone: TabDropZone) => boolean;
  closeTab: (paneId: string, path: string) => void;
  dragTab: (paneId: string, path: string) => void;
  /** Drops the dragged tab at a slot in the pane's bar, into the pane, or on an edge to split it. */
  dropTab: (paneId: string, drop: number | TabDropZone) => void;
  focus: (paneId: string) => void;
  openTab: (paneId: string, path: string) => void;
  register: (paneId: string, prepareForClose: () => Promise<boolean>) => () => void;
  renameTab: (paneId: string, from: string, to: string) => void;
};

type LayoutState = { animate: boolean; layout: PaneLayout };

function hasSavedPanes(layout: PaneLayout | undefined): layout is PaneLayout {
  return !!layout && (layout.root.kind === "split" || layout.panes[layout.focused].paths.length > 0);
}

export function MarkdownEditorWindow({ files, folders, launchArguments, windowId = editorWindowIdentifier, workspacePath }: MarkdownEditorWindowProps) {
  loadMarkdownUserThemesSync();
  const [startupArguments] = useState(() => files ?? launchArguments);
  // Only the main window is restored on launch, so it alone keeps its sidebar folders and panes.
  const keepsFolders = windowId === editorWindowIdentifier;
  const workspace = useWorkspaceWindow({
    files: files ?? [getLaunchMarkdownFile(launchArguments)].filter((path): path is string => path !== null),
    folders: folders ?? (keepsFolders && !workspacePath ? getMarkdownSidebarFoldersSetting() : undefined),
    workspacePath,
  }, {
    onSidebarOpenChange: setMarkdownSidebarOpenSetting,
    sidebarOpenSetting: getMarkdownSidebarOpenSetting(),
  });
  const { addFolders, openTab: openWorkspaceTab, renameTab: renameWorkspaceTab } = workspace;
  const workspaceFolders = workspace.state.folders;
  useEffect(() => {
    if (keepsFolders) setMarkdownSidebarFoldersSetting(workspaceFolders);
  }, [keepsFolders, workspaceFolders]);
  useDocumentWindow(windowId, workspace.toggleSidebar, refreshMarkdownEditorMenuState);
  const reportError = useCallback((error: unknown) => console.error(error), []);

  const [initialPanes] = useState(() => {
    const opensFiles = !!files || !!workspacePath || !!getLaunchMarkdownFile(launchArguments) || shouldLaunchNewMarkdownDocument(launchArguments);
    const saved = keepsFolders && !opensFiles ? getMarkdownPaneLayoutSetting() : undefined;
    return hasSavedPanes(saved) ? { layout: saved, restored: true } : { layout: createPaneLayout(workspace.state.tabs), restored: false };
  });
  const [{ animate, layout }, setLayoutState] = useState<LayoutState>({ animate: false, layout: initialPanes.layout });
  // Actions read the ref so consecutive calls see each other's changes before rendering.
  const layoutRef = useRef(layout);
  const setLayout = useCallback((change: (layout: PaneLayout) => PaneLayout, animated = true) => {
    const next = change(layoutRef.current);
    if (next === layoutRef.current) return;
    layoutRef.current = next;
    setLayoutState({ animate: animated, layout: next });
  }, []);
  useEffect(() => {
    if (!keepsFolders) return;
    const timeout = setTimeout(() => setMarkdownPaneLayoutSetting(layout), 250);
    return () => clearTimeout(timeout);
  }, [keepsFolders, layout]);

  const [areaSize, setAreaSize] = useState({ height: 0, width: 0 });
  const sidebarOpen = workspace.state.sidebarOpen;
  const { panes: frames, splits } = useMemo(() => layoutPanes(layout.root, {
    height: Math.max(0, areaSize.height - paneGap),
    width: Math.max(0, areaSize.width - 2 * paneGap),
    x: paneGap,
    y: 0,
  }), [areaSize, layout.root]);
  const framesRef = useRef(frames);
  framesRef.current = frames;
  const focusedFrame = frames.find(frame => frame.id === layout.focused);
  const canSplitRight = canSplitPane(focusedFrame, "horizontal");
  const canSplitDown = canSplitPane(focusedFrame, "vertical");
  const hasOtherPanes = layout.root.kind === "split";

  const paneClosers = useRef(new Map<string, () => Promise<boolean>>());
  /** Prepares each pane's shown document to close, in order, stopping at the first the user keeps. */
  const preparePanes = useCallback(async (ids: string[]) => {
    for (const id of ids) {
      if (!await (paneClosers.current.get(id)?.() ?? true)) return false;
    }
    return true;
  }, []);
  const tabDrag = useRef<{ paneId: string; path: string } | null>(null);
  const paneActions = useMemo<PaneActions>(() => ({
    canDropTab: (paneId, zone) => {
      const drag = tabDrag.current;
      if (!drag) return false;
      if (zone === "center") return drag.paneId !== paneId;
      const ownOnlyTab = drag.paneId === paneId && layoutRef.current.panes[paneId]?.paths.length === 1;
      return !ownOnlyTab && canSplitPane(framesRef.current.find(frame => frame.id === paneId), zone === "left" || zone === "right" ? "horizontal" : "vertical");
    },
    closeTab: (paneId, path) => setLayout(current => closePaneTab(current, paneId, path)),
    dragTab: (paneId, path) => { tabDrag.current = { paneId, path }; },
    dropTab: (paneId, drop) => {
      const drag = tabDrag.current;
      tabDrag.current = null;
      if (!drag) return;
      const { paneId: from, path } = drag;
      void (async () => {
        // The shown document leaves its pane, so save it first and the destination opens what the user sees.
        const leaves = layoutRef.current.panes[from]?.active === path && !(from === paneId && typeof drop === "number");
        if (leaves && !await preparePanes([from])) return;
        setLayout(current => typeof drop === "number" ? movePaneTab(current, from, path, paneId, drop)
          : drop === "center" ? movePaneTab(current, from, path, paneId, current.panes[paneId]?.paths.length ?? 0)
          : splitPaneWithTab(current, from, path, paneId, drop));
      })().catch(reportError);
    },
    focus: paneId => setLayout(current => focusPane(current, paneId), false),
    openTab: (paneId, path) => {
      openWorkspaceTab(path);
      setLayout(current => openPaneTab(current, paneId, path), false);
    },
    register: (paneId, prepareForClose) => {
      paneClosers.current.set(paneId, prepareForClose);
      return () => { if (paneClosers.current.get(paneId) === prepareForClose) paneClosers.current.delete(paneId); };
    },
    renameTab: (paneId, from, to) => {
      renameWorkspaceTab(from, to);
      setLayout(current => renamePaneTab(current, paneId, from, to), false);
    },
  }), [openWorkspaceTab, preparePanes, renameWorkspaceTab, reportError, setLayout]);
  const resize = useCallback((splitId: string, fraction: number, animated: boolean) => {
    setLayout(current => setSplitFraction(current, splitId, fraction), animated);
  }, [setLayout]);

  const displayThemeSetting = useMarkdownDisplayThemeSetting();
  const layoutThemeSetting = useMarkdownLayoutThemeSetting();
  const displayTheme = getLegendDisplayTheme(displayThemeSetting);
  const layoutTheme = getMarkdownLayoutTheme(layoutThemeSetting);
  const nativeWindowAppearance = getLegendDisplayThemeAppearance(displayThemeSetting);
  const backgroundStyle = useMemo(() => ({ backgroundColor: displayTheme.colors.background }), [displayTheme.colors.background]);
  const cardColor = getPaneCardColor(displayTheme.colors.background, nativeWindowAppearance);
  const cardStyle = useMemo(() => ({ backgroundColor: cardColor }), [cardColor]);
  const documentTheme = useMemo(() => ({ ...displayTheme.markdownDocument, backgroundColor: cardColor }), [cardColor, displayTheme.markdownDocument]);
  const formattingToolbarMode = useMarkdownFormattingToolbarModeSetting();
  const autosave = useMarkdownAutosaveSetting();
  const appearanceSettings = useMarkdownAppearanceSettings();
  const { titleBarHeight } = useMarkdownChromeTheme();
  const markdownStyle = useMemo(
    () => getMarkdownStyleForAppearance(displayTheme, layoutTheme, appearanceSettings),
    [appearanceSettings, displayTheme, layoutTheme],
  );
  const markdownLayout = useMemo(() => getMarkdownLayoutForAppearance(layoutTheme, appearanceSettings), [appearanceSettings, layoutTheme]);
  const measurementSignature = useMemo(
    () => getMarkdownMeasurementSignature(markdownLayout, markdownStyle),
    [markdownLayout, markdownStyle],
  );
  const openSettingsWindow = useMarkdownSettingsWindow({
    backgroundColor: displayTheme.colors.windowBackground,
    onError: reportError,
  });

  useEffect(() => {
    applyMarkdownThemeSetting();
  }, []);

  const closePaneById = useCallback(async (paneId: string) => {
    if (getPaneHeir(layoutRef.current, paneId) && await preparePanes([paneId])) {
      setLayout(current => closePane(current, paneId));
    }
  }, [preparePanes, setLayout]);
  const paneCommands = useMemo<PaneCommands>(() => ({
    closeOtherPanes: () => {
      const { focused, root } = layoutRef.current;
      preparePanes(getPaneIds(root).filter(id => id !== focused)).then(ready => {
        if (ready) setLayout(current => closeOtherPanes(current, focused));
      }).catch(reportError);
    },
    closePane: () => { closePaneById(layoutRef.current.focused).catch(reportError); },
    closeWindow: () => { closeWindow(windowId).catch(reportError); },
    focusNextPane: () => setLayout(current => focusAdjacentPane(current, 1), false),
    focusPreviousPane: () => setLayout(current => focusAdjacentPane(current, -1), false),
    splitDown: () => { if (canSplitDown) setLayout(current => splitPane(current, "vertical")); },
    splitRight: () => { if (canSplitRight) setLayout(current => splitPane(current, "horizontal")); },
  }), [canSplitDown, canSplitRight, closePaneById, preparePanes, reportError, setLayout, windowId]);
  const paneCommandState = useMemo(() => ({ canSplitDown, canSplitRight, hasOtherPanes }), [canSplitDown, canSplitRight, hasOtherPanes]);

  const focusedTabs = layout.panes[layout.focused];
  const currentFile = focusedTabs?.active ?? null;
  const openInFocusedPane = useCallback((path: string) => paneActions.openTab(layoutRef.current.focused, path), [paneActions]);
  const addFolder = useCallback(() => { chooseFolders().then(addFolders).catch(reportError); }, [addFolders, reportError]);
  const newEntryDirectory = getNewEntryDirectory(workspaceFolders, currentFile);
  const newFile = useCallback(() => {
    if (newEntryDirectory) createWorkspaceFile(newEntryDirectory, newMarkdownFileName).then(openInFocusedPane).catch(reportError);
  }, [newEntryDirectory, openInFocusedPane, reportError]);
  const newFolder = useCallback(() => {
    if (newEntryDirectory) createWorkspaceFolder(newEntryDirectory).catch(reportError);
  }, [newEntryDirectory, reportError]);
  const windowMenus = useMemo<WindowMenuOptions>(() => ({
    hasFolders: workspaceFolders.length > 0,
    onAddFolder: addFolder,
    onNewFile: newFile,
    onNewFolder: newFolder,
    onOpenSettings: openSettingsWindow,
    onSaveWorkspace: workspace.saveWorkspace,
  }), [addFolder, newFile, newFolder, openSettingsWindow, workspace.saveWorkspace, workspaceFolders.length]);

  const e2eRun = getMarkdownE2ERunFromLaunchArguments(launchArguments);
  useMarkdownWindowCloseRequest({
    windowId: e2eRun ? undefined : windowId,
    handleError: reportError,
    prepareWindowForClose: () => preparePanes(getPaneIds(layoutRef.current.root)),
  });

  const workspaceColors = displayTheme.colors;

  if (e2eRun) {
    const editorSmokeVariant = editorSmokeVariantForScenario(e2eRun.scenario);
    if (editorSmokeVariant) {
      return (
        <MarkdownE2EEditorSmoke
          autoSelectBlocks={e2eRun.scenario === "editor-selection-smoke"}
          variant={editorSmokeVariant}
        />
      );
    }
    if (isMarkdownDocumentE2EScenario(e2eRun.scenario)) {
      return (
        <MarkdownE2ERunner
          blockCount={e2eRun.blockCount}
          scenario={e2eRun.scenario}
          seed={e2eRun.seed}
        />
      );
    }
  }

  const hairlineColor = displayTheme.colors.border;
  const content = (
    <View style={styles.root}>
      <MarkdownPaneArea
        animate={animate}
        cardColor={cardColor}
        frames={frames}
        hairlineColor={hairlineColor}
        onResize={resize}
        onSizeChange={setAreaSize}
        renderPane={frame => (
          <MarkdownPane
            actions={paneActions}
            autosaveEnabled={autosave === "enabled"}
            backgroundStyle={cardStyle}
            colors={workspaceColors}
            commandState={paneCommandState}
            commands={paneCommands}
            dangerColor={displayTheme.colors.danger}
            focused={frame.id === layout.focused}
            formattingToolbarMode={formattingToolbarMode}
            frame={frame}
            markdownLayout={markdownLayout}
            markdownStyle={markdownStyle}
            measurementSignature={measurementSignature}
            nativeWindowAppearance={nativeWindowAppearance}
            onToggleSidebar={!sidebarOpen && frame.x === paneGap && frame.y === 0 ? workspace.toggleSidebar : undefined}
            startupArguments={frame.id === "p0" && !initialPanes.restored ? startupArguments ?? [] : undefined}
            tabs={layout.panes[frame.id]}
            theme={documentTheme}
            titleBarHeight={titleBarHeight}
            windowId={windowId}
            windowMenus={windowMenus}
          />
        )}
        root={layout.root}
        splits={splits}
        tabBarHeight={titleBarHeight}
      />
    </View>
  );

  return (
    <View style={styles.root}>
      <SidebarSplitView
        appearance={nativeWindowAppearance}
        content={content}
        contentGlassTint={{
          color: backgroundStyle.backgroundColor,
          // AppKit's sidebar glass frosts more than the content glass in dark mode.
          opacity: nativeWindowAppearance === "dark" ? 0.88 : 0.8,
        }}
        dividerColor="#00000000"
        sidebar={(
          <View style={styles.root}>
            <ChromeTint backgroundStyle={backgroundStyle} />
            <WorkspaceSidebar
              activePath={currentFile}
              colors={workspaceColors}
              files={workspace.state.files}
              folderMenu={{ newFileName: newMarkdownFileName, onRemoveFolder: workspace.removeFolder, windowId }}
              folders={workspaceFolders}
              isDocumentPath={isMarkdownPath}
              onAddFolder={addFolder}
              onError={reportError}
              onOpenFile={openInFocusedPane}
              onToggleSidebar={workspace.toggleSidebar}
              titleBarHeight={titleBarHeight}
            />
          </View>
        )}
        onSidebarCollapsedChange={collapsed => workspace.setSidebarOpen(!collapsed)}
        sidebarCollapsed={!sidebarOpen}
        sidebarWidth={220}
        style={styles.root}
      />
    </View>
  );
}

function ChromeTint({ backgroundStyle }: { backgroundStyle: { backgroundColor: string } }) {
  return <View pointerEvents="none" style={[StyleSheet.absoluteFillObject, backgroundStyle, { opacity: 0.8 }]} />;
}

type WindowMenuOptions = Pick<Parameters<typeof useMarkdownMenus>[0], "hasFolders" | "onAddFolder" | "onNewFile" | "onNewFolder" | "onOpenSettings" | "onSaveWorkspace">;

type MarkdownPaneProps = {
  actions: PaneActions;
  autosaveEnabled: boolean;
  backgroundStyle: { backgroundColor: string };
  colors: DocumentTabBarProps["colors"];
  commandState: PaneCommandState;
  commands: PaneCommands;
  dangerColor: string;
  focused: boolean;
  formattingToolbarMode: MarkdownFormattingToolbarMode;
  frame: PaneFrame;
  markdownLayout: MarkdownDocumentProps["markdownLayout"];
  markdownStyle: MarkdownDocumentProps["markdownStyle"];
  measurementSignature: string;
  nativeWindowAppearance: "dark" | "light";
  /** Set for the top-leading pane while the sidebar is hidden: it shows the toggle and clears the traffic lights. */
  onToggleSidebar?: () => void;
  /** The launch arguments for the window's first pane when nothing was restored. */
  startupArguments?: string[];
  tabs: DocumentTabs;
  theme: MarkdownDocumentProps["theme"];
  titleBarHeight: number;
  windowId: string;
  windowMenus: WindowMenuOptions;
};

/** One document pane: its own tabs, session and editor. The focused pane drives the menus, hotkeys and window title. */
function MarkdownPane({
  actions,
  autosaveEnabled,
  backgroundStyle,
  colors,
  commandState,
  commands,
  dangerColor,
  focused,
  formattingToolbarMode,
  frame,
  markdownLayout,
  markdownStyle,
  measurementSignature,
  nativeWindowAppearance,
  onToggleSidebar,
  startupArguments,
  tabs,
  theme,
  titleBarHeight,
  windowId,
  windowMenus,
}: MarkdownPaneProps) {
  const paneId = frame.id;
  const isOnlyPane = !commandState.hasOtherPanes;
  const session = useMarkdownDocumentSession({
    onFileOpened: useCallback((path: string) => actions.openTab(paneId, path), [actions, paneId]),
    onFileSavedAs: useCallback((from: string | null, to: string) => from ? actions.renameTab(paneId, from, to) : actions.openTab(paneId, to), [actions, paneId]),
  });
  const { documentCommandsRef, handleError, openSelectedFile, openUntitledDocument, prepareCurrentDocumentForClose } = session;
  const [findVisible, setFindVisible] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findStatus, setFindStatus] = useState("");
  const [isLinkPopoverOpen, setIsLinkPopoverOpen] = useState(false);
  const hasObservedLayoutInputsRef = useRef(false);
  const currentFile = () => session.sessionState$.documentSource.peek() === "file" ? session.sessionState$.filename.peek() : null;

  const prepareForClose = useCallback((reason: "close" | "open") => prepareCurrentDocumentForClose({ autosaveEnabled, reason }), [autosaveEnabled, prepareCurrentDocumentForClose]);
  useEffect(() => actions.register(paneId, () => prepareForClose("close")), [actions, paneId, prepareForClose]);

  // The pane shows its active tab: tab clicks, the sidebar, a split and a merged-in pane all set it.
  const active = tabs.active;
  const startupRef = useRef(startupArguments);
  useEffect(() => {
    const startup = startupRef.current;
    startupRef.current = undefined;
    if (!active) {
      if (startup) {
        const path = getStartupMarkdownPath(startup);
        if (path) openSelectedFile(path);
        else openUntitledDocument();
      } else if (!session.sessionState$.filename.peek()) {
        openUntitledDocument();
      }
      return;
    }
    const shown = currentFile();
    if (active === shown) return;
    if (!shown) {
      openSelectedFile(active);
      return;
    }
    // Loading a document holds the JS thread, so let a pane glide finish first (Animated timings are interactions).
    const task = InteractionManager.runAfterInteractions(() => {
      prepareForClose("open").then(ready => {
        if (ready) openSelectedFile(active);
        else actions.openTab(paneId, shown);
      }).catch(handleError);
    });
    return () => task.cancel();
  // Only a change of active tab switches documents.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  const closeTab = useCallback(async (path: string) => {
    if (path !== currentFile()) {
      actions.closeTab(paneId, path);
      return;
    }
    if (!await prepareForClose("close")) return;
    // Show the next tab first, so the pane does not prepare the closed document a second time.
    const next = closeDocumentTab(tabs, path).active;
    if (next) openSelectedFile(next);
    // A split pane left without tabs closes; the last pane falls back to an untitled document.
    else if (isOnlyPane) openUntitledDocument();
    actions.closeTab(paneId, path);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actions, isOnlyPane, openSelectedFile, openUntitledDocument, paneId, prepareForClose, tabs]);

  /** ⌘W: closes the active tab, then an empty split pane, then the window. */
  const closeActiveTab = useCallback(() => {
    if (tabs.active) closeTab(tabs.active).catch(handleError);
    else if (!isOnlyPane) commands.closePane();
    else commands.closeWindow();
  }, [closeTab, commands, handleError, isOnlyPane, tabs.active]);

  const find = useCallback(async (backwards = false) => {
    try {
      const found = await documentCommandsRef.current?.find(findQuery, backwards);
      setFindStatus(found ? "Match selected" : "No matches");
    } catch (error) { handleError(error); }
  }, [documentCommandsRef, findQuery, handleError]);
  const insertLink = useCallback(() => setIsLinkPopoverOpen(true), []);
  const applyLink = useCallback((url: string) => {
    documentCommandsRef.current?.insertLink({ url });
    setIsLinkPopoverOpen(false);
  }, [documentCommandsRef]);
  const renderSelectionToolbar = useCallback(
    (anchor: MarkdownSelectionAnchor) => (
      <MarkdownFloatingSurface anchor={anchor} coordinateSpace="content">
        <MarkdownFormattingToolbar commandsRef={documentCommandsRef} floating onInsertLink={insertLink} />
      </MarkdownFloatingSurface>
    ),
    [documentCommandsRef, insertLink],
  );

  useEffect(() => {
    if (hasObservedLayoutInputsRef.current) {
      documentCommandsRef.current?.invalidateLayoutMeasurements();
    } else {
      hasObservedLayoutInputsRef.current = true;
    }
  }, [measurementSignature, documentCommandsRef]);

  useMarkdownAppExit({ autosaveEnabled, handleError, prepareCurrentDocumentForClose });

  return (
    <MarkdownPaneChrome
      cardColor={backgroundStyle.backgroundColor}
      frame={frame}
      hairlineColor={colors.border}
      tabBar={(
        <View onStartShouldSetResponderCapture={() => { actions.focus(paneId); return false; }} style={styles.root}>
          <DocumentTabBar
            activePath={tabs.active}
            colors={colors}
            focused={focused}
            onClose={path => { actions.focus(paneId); closeTab(path).catch(handleError); }}
            onSelect={path => { actions.focus(paneId); actions.openTab(paneId, path); }}
            onToggleSidebar={onToggleSidebar}
            sidebarOpen={!onToggleSidebar}
            paths={tabs.paths}
            separated={false}
            tabDrag={{ onDragStart: path => actions.dragTab(paneId, path), onDrop: index => actions.dropTab(paneId, index), type: tabDragType }}
            titleBarHeight={titleBarHeight}
          />
        </View>
      )}
      tabBarHeight={titleBarHeight}
    >
      <PaneTabDropTarget accepts={zone => actions.canDropTab(paneId, zone)} color={colors.primary ?? colors.foreground} onDrop={zone => actions.dropTab(paneId, zone)} type={tabDragType}>
        {/* Clicking anywhere in a pane focuses it without taking the click from the editor. */}
        <View onStartShouldSetResponderCapture={() => { actions.focus(paneId); return false; }} style={styles.root} testID={`markdown-pane-${paneId}`}>
          {focused ? (
            <FocusedPaneBindings
              closeActiveTab={closeActiveTab}
              commandState={commandState}
              commands={commands}
              nativeWindowAppearance={nativeWindowAppearance}
              onFind={() => setFindVisible(true)}
              onInsertLink={insertLink}
              session={session}
              windowId={windowId}
              windowMenus={windowMenus}
            />
          ) : null}
          <MarkdownFileWatcher session={session} />
          {findVisible && <View className="flex-row items-center gap-3 border-b border-border bg-background px-4 py-2">
            <TextInput accessibilityLabel="Find in document" autoFocus className="flex-1 text-foreground"
              value={findQuery} onChangeText={setFindQuery} onSubmitEditing={() => { void find(); }} placeholder="Find…" />
            <Pressable accessibilityRole="button" accessibilityLabel="Previous match" onPress={() => { void find(true); }}><Text className="text-foreground">Previous</Text></Pressable>
            <Pressable accessibilityRole="button" accessibilityLabel="Next match" onPress={() => { void find(); }}><Text className="text-foreground">Next</Text></Pressable>
            <Text className="text-muted">{findStatus}</Text>
            <Pressable accessibilityRole="button" accessibilityLabel="Close Find" onPress={() => setFindVisible(false)}><Text className="text-foreground">Done</Text></Pressable>
          </View>}
          <MarkdownEditorSessionContent
            autosaveEnabled={autosaveEnabled}
            backgroundStyle={backgroundStyle}
            dangerColor={dangerColor}
            foregroundColor={colors.foreground}
            formattingToolbarMode={formattingToolbarMode}
            isLinkPopoverOpen={isLinkPopoverOpen}
            markdownLayout={markdownLayout}
            markdownStyle={markdownStyle}
            onApplyLink={applyLink}
            onCancelLink={() => setIsLinkPopoverOpen(false)}
            onInsertLink={insertLink}
            renderSelectionToolbar={renderSelectionToolbar}
            session={session}
            theme={theme}
          />
        </View>
      </PaneTabDropTarget>
    </MarkdownPaneChrome>
  );
}

function FocusedPaneBindings({ closeActiveTab, commandState, commands, nativeWindowAppearance, onFind, onInsertLink, session, windowId, windowMenus }: {
  closeActiveTab: () => void;
  commandState: PaneCommandState;
  commands: PaneCommands;
  nativeWindowAppearance: "dark" | "light";
  onFind: () => void;
  onInsertLink: () => void;
  session: MarkdownDocumentSession;
  windowId: string;
  windowMenus: WindowMenuOptions;
}) {
  useRecentMarkdownDocumentOpener({
    flushCurrentDocumentBeforeTransition: session.flushCurrentDocumentBeforeTransition,
    openSelectedFile: session.openSelectedFile,
    windowId,
  });
  useMarkdownKeyboardShortcuts({
    documentCommandsRef: session.documentCommandsRef,
    sessionState$: session.sessionState$,
    windowId,
  });
  useMarkdownMenus({
    ...windowMenus,
    documentCommandsRef: session.documentCommandsRef,
    onError: session.handleError,
    onFind,
    onInsertLink,
    onNewDocument: session.newMarkdownDocument,
    onOpenDocument: session.openMarkdownDialog,
    onSaveDocument: session.saveCurrentDocument,
    onSaveDocumentAs: session.saveCurrentDocumentAs,
    paneCommands: useMemo(() => ({ ...commands, closeTab: closeActiveTab }), [closeActiveTab, commands]),
    paneCommandState: commandState,
    sessionState$: session.sessionState$,
    windowId,
  });
  useMarkdownEditorWindowOptions({
    appearance: nativeWindowAppearance,
    onError: session.handleError,
    sessionState$: session.sessionState$,
    windowId,
  });
  return null;
}

export default MarkdownEditorWindow;

function MarkdownFileWatcher({ session }: { session: MarkdownDocumentSession }) {
  const filename = useValue(session.sessionState$.filename);
  const documentSource = useValue(session.sessionState$.documentSource);
  const watchedFilePath = filename && documentSource !== "untitled" ? filename : null;
  const checkDocument = useCallback(() => {
    session.documentCommandsRef.current?.checkForExternalChanges().catch(session.handleError);
  }, [session.documentCommandsRef, session.handleError]);
  useEffect(() => {
    if (!watchedFilePath) return;
    let active = true;
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const subscription = ownRegistration(watch(getDirectory(watchedFilePath) ?? "/", () => {
      if (!active) return;
      clearTimeout(timeout);
      timeout = setTimeout(checkDocument, 100);
    }, { recursive: true }), session.handleError);
    return () => {
      active = false;
      clearTimeout(timeout);
      void subscription.remove().catch(session.handleError);
    };
  }, [checkDocument, session.handleError, watchedFilePath]);

  return null;
}

type MarkdownEditorSessionContentProps = {
  autosaveEnabled: boolean;
  backgroundStyle: { backgroundColor: string };
  dangerColor: string;
  foregroundColor: string;
  formattingToolbarMode: MarkdownFormattingToolbarMode;
  isLinkPopoverOpen: boolean;
  markdownLayout: MarkdownDocumentProps["markdownLayout"];
  markdownStyle: MarkdownDocumentProps["markdownStyle"];
  onApplyLink: (url: string) => void;
  onCancelLink: () => void;
  onInsertLink: () => void;
  renderSelectionToolbar: NonNullable<MarkdownDocumentProps["renderSelectionToolbar"]>;
  session: MarkdownDocumentSession;
  theme: MarkdownDocumentProps["theme"];
};

function MarkdownEditorSessionContent({
  autosaveEnabled,
  backgroundStyle,
  dangerColor,
  foregroundColor,
  formattingToolbarMode,
  isLinkPopoverOpen,
  markdownLayout,
  markdownStyle,
  onApplyLink,
  onCancelLink,
  onInsertLink,
  renderSelectionToolbar,
  session,
  theme,
}: MarkdownEditorSessionContentProps) {
  const filename = useValue(session.sessionState$.filename);
  const documentSource = useValue(session.sessionState$.documentSource);
  const isUntitledDocument = documentSource === "untitled";

  if (!filename) {
    return null;
  }

  return (
    <View style={[styles.root, backgroundStyle]}>
      <MarkdownConflictBanner color={foregroundColor} session={session} />
      <MarkdownSessionError color={dangerColor} session={session} />
      {formattingToolbarMode === "top" ? (
        <MarkdownFormattingToolbar commandsRef={session.documentCommandsRef} onInsertLink={onInsertLink} />
      ) : null}
      <View style={styles.documentFrame}>
        <MarkdownDocumentSurface
          preserveEditingOnBlur={isLinkPopoverOpen}
          autosaveEnabled={autosaveEnabled}
          backgroundStyle={backgroundStyle}
          filename={filename}
          isUntitledDocument={isUntitledDocument}
          markdownLayout={markdownLayout}
          markdownStyle={markdownStyle}
          renderSelectionToolbar={renderSelectionToolbar}
          session={session}
          selectionToolbarEnabled={formattingToolbarMode === "selection"}
          theme={theme}
        />
        {isLinkPopoverOpen ? (
          <MarkdownLinkPopover
            onCancel={onCancelLink}
            onSubmit={onApplyLink}
          />
        ) : null}
      </View>
      {formattingToolbarMode === "bottom" ? (
        <MarkdownFormattingToolbar
          commandsRef={session.documentCommandsRef}
          onInsertLink={onInsertLink}
          placement="bottom"
          style={styles.bottomToolbar}
        />
      ) : null}
    </View>
  );
}

function MarkdownConflictBanner({ color, session }: { color: string; session: MarkdownDocumentSession }) {
  const conflict = useValue(session.sessionState$.conflict);
  const saving = useValue(() => session.sessionState$.saveState.get() === "saving");
  if (!conflict) return null;
  return (
    <View className="gap-2 border-b border-amber-500 px-4 py-3" accessibilityRole="alert">
      <Text style={{ color }}>
        {conflict === "missing" ? "This file was removed from disk." : "This file changed on disk."}
        {" Your local version is preserved. Autosave is paused."}
      </Text>
      <View className="flex-row flex-wrap gap-4">
        {conflict !== "missing" && (
          <Pressable accessibilityRole="button" disabled={saving} onPress={session.useDiskVersion}>
            <Text style={{ color }}>Use disk</Text>
          </Pressable>
        )}
        <Pressable accessibilityRole="button" disabled={saving} onPress={session.overwriteWithLocal}>
          <Text style={{ color }}>Overwrite with local</Text>
        </Pressable>
        <Pressable accessibilityRole="button" disabled={saving} onPress={() => session.saveCurrentDocumentAs(true)}>
          <Text style={{ color }}>Save local separately</Text>
        </Pressable>
      </View>
    </View>
  );
}

function MarkdownSessionError({
  color,
  session,
}: {
  color: string;
  session: MarkdownDocumentSession;
}) {
  const lastError = useValue(session.sessionState$.lastError);

  if (!lastError) {
    return null;
  }

  return <Text style={[styles.error, { color }]}>{lastError}</Text>;
}

type MarkdownDocumentSurfaceProps = {
  preserveEditingOnBlur: boolean;
  autosaveEnabled: boolean;
  backgroundStyle: { backgroundColor: string };
  filename: string;
  isUntitledDocument: boolean;
  markdownLayout: MarkdownDocumentProps["markdownLayout"];
  markdownStyle: MarkdownDocumentProps["markdownStyle"];
  renderSelectionToolbar: NonNullable<MarkdownDocumentProps["renderSelectionToolbar"]>;
  selectionToolbarEnabled: boolean;
  session: MarkdownDocumentSession;
  theme: MarkdownDocumentProps["theme"];
};

const MarkdownDocumentSurface = memo(function MarkdownDocumentSurface({
  preserveEditingOnBlur,
  autosaveEnabled,
  backgroundStyle,
  filename,
  isUntitledDocument,
  markdownLayout,
  markdownStyle,
  renderSelectionToolbar,
  selectionToolbarEnabled,
  session,
  theme,
}: MarkdownDocumentSurfaceProps) {
  const adapter = untitledMarkdownAdapter;
  const documentStyle = useMemo(() => [styles.document, backgroundStyle], [backgroundStyle]);
  const savePolicy = useMemo(
    () => ({ autosave: !isUntitledDocument && autosaveEnabled }),
    [autosaveEnabled, isUntitledDocument],
  );

  return (
    <View pointerEvents={preserveEditingOnBlur ? "none" : "auto"} style={styles.document} testID="markdown-document-input-surface">
      <MarkdownDocument
        preserveEditingOnBlur={preserveEditingOnBlur}
        adapter={adapter}
        autoFocusFirstBlock={isUntitledDocument}
        commandsRef={session.documentCommandsRef}
        filename={filename}
        markdownLayout={markdownLayout}
        markdownStyle={markdownStyle}
        onCommandStateChange={session.setCommandState}
        onDirtyChange={session.setIsDirty}
        onError={session.handleError}
        onLoadError={session.handleDocumentLoadError}
        onLoaded={session.handleDocumentLoaded}
        onConflictChange={session.setConflict}
        onSaveStateChange={session.setSaveState}
        renderSelectionToolbar={renderSelectionToolbar}
        savePolicy={savePolicy}
        selectionToolbarEnabled={selectionToolbarEnabled}
        style={documentStyle}
        theme={theme}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  document: {
    flex: 1,
  },
  documentFrame: {
    flex: 1,
    position: "relative",
  },
  bottomToolbar: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    zIndex: 1,
  },
  error: {
    fontSize: 13,
    paddingHorizontal: 24,
    paddingVertical: 8,
    textAlign: "center",
  },
  root: {
    flex: 1,
    position: "relative",
  },
});
