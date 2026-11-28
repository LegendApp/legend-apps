import { watch } from "@legendapp/spark/files";
import { ownRegistration } from "@legend-apps/runtime-utils";
import { SidebarSplitView } from "@legendapp/spark/ui/split-view";
import {
  MarkdownDocument,
  nativeMarkdownDocumentAdapter,
  type MarkdownDocumentProps,
  type MarkdownSelectionAnchor,
} from "@legend-apps/markdown-document";
import { getLegendDisplayTheme, getLegendDisplayThemeAppearance, getMarkdownLayoutTheme } from "@legend-apps/theme";
import {
  canSplitPane,
  chooseFolders,
  closeOtherPanes,
  closePane,
  closePaneTab,
  createPaneLayout,
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
  type PaneAxis,
  type PaneFrame,
  type PaneLayout,
} from "@legend-apps/workspace";
import { closeWindow } from "@legendapp/spark/windows";
import { getPaneCardColor, MarkdownPaneArea, MarkdownPaneChrome, PaneTabDropTarget, type TabDropZone } from "./MarkdownPaneArea";
import { useValue } from "@legendapp/state/react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
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
  registerMarkdownWindowQuitGuard,
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
import { getDirectory, getLaunchMarkdownFile, isMarkdownPath, shouldLaunchNewMarkdownDocument } from "./markdownFiles";
import type { MarkdownEditorWindowProps } from "./markdownWindows";
import {
  applyMarkdownThemeSetting,
  getMarkdownPaneLayoutSetting,
  getMarkdownSidebarFoldersSetting,
  getMarkdownSidebarOpenSetting,
  getMarkdownStartupBehaviorSetting,
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
import { createMarkdownDraft, isMarkdownDraft, removeMarkdownDraft } from "./markdownDrafts";
import { createEmptyTab, getMarkdownTabTitle, isEmptyTab, MarkdownEmptyState } from "./MarkdownEmptyTab";
import { MarkdownOpenFilePanel, openFilePanelMinHeight } from "./MarkdownOpenFilePanel";
import { refreshMarkdownEditorMenuState } from "./markdownEditorActions";
import { createMarkdownAssistant } from "./markdownAssistant";
import { MarkdownAssistantPanel } from "./MarkdownAssistantPanel";

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

type CloseReason = "close" | "quit";
type PrepareTabForClose = (reason: CloseReason) => Promise<string | null>;

type PaneActions = {
  /** Whether the tab being dragged in this window can drop on that part of the pane. */
  canDropTab: (paneId: string, zone: TabDropZone) => boolean;
  closeTab: (paneId: string, path: string, editorKey: number | undefined) => void;
  dragTab: (paneId: string, path: string) => void;
  /** Drops the dragged tab at a slot in the pane's bar, into the pane, or on an edge to split it. */
  dropTab: (paneId: string, drop: number | TabDropZone) => void;
  focus: (paneId: string) => void;
  openTab: (paneId: string, path: string) => void;
  /** Opens a file from the tab `from` (null in an idle pane) unless that tab has since closed, moved or been replaced. */
  openFrom: (paneId: string, from: string | null, editorKey: number | undefined, file: string) => void;
  register: (paneId: string, prepareForClose: (reason: CloseReason, path?: string) => Promise<boolean>) => () => void;
  renameTab: (paneId: string, from: string, to: string) => void;
};

type TabRename = { paneId: string; from: string; to: string };

type LayoutState = {
  animate: boolean;
  layout: PaneLayout;
  editorKeys: Record<string, ReadonlyMap<string, number>>;
  nextEditorKey: number;
};

function updateLayoutState(layout: PaneLayout, animate: boolean, previous?: LayoutState, rename?: TabRename): LayoutState {
  if (previous?.layout.panes === layout.panes) return { ...previous, animate, layout };
  let nextEditorKey = previous?.nextEditorKey ?? 0;
  const editorKeys = Object.fromEntries(Object.entries(layout.panes).map(([paneId, tabs]) => {
    const previousKeys = previous?.editorKeys[paneId];
    const previousTabs = previous?.layout.panes[paneId];
    if (previousKeys && tabs === previousTabs) return [paneId, previousKeys];

    const keys = new Map<string, number>();
    for (const path of tabs.paths) {
      let key = previousKeys?.get(path);
      if (key === undefined && rename?.paneId === paneId && rename.to === path && !previousTabs?.paths.includes(path)) {
        key = previousKeys?.get(rename.from);
      }
      if (key !== undefined || path === tabs.active) keys.set(path, key ?? nextEditorKey++);
    }
    return [paneId, keys];
  }));
  return { animate, layout, editorKeys, nextEditorKey };
}

/** Drafts and empty tabs are not files the workspace or the restored panes keep. */
function isFileTab(path: string) {
  return !isMarkdownDraft(path) && !isEmptyTab(path);
}

function layoutWithoutDrafts(layout: PaneLayout): PaneLayout {
  return {
    ...layout,
    panes: Object.fromEntries(Object.entries(layout.panes).map(([id, tabs]) => {
      const paths = tabs.paths.filter(isFileTab);
      const active = tabs.active && paths.includes(tabs.active) ? tabs.active : paths[0] ?? null;
      return [id, { active, paths }];
    })),
  };
}

function splitMarkdownPane(layout: PaneLayout, axis: PaneAxis) {
  const next = splitPane(layout, axis);
  const path = next.panes[next.focused]?.active;
  if (next !== layout && path && !isFileTab(path)) {
    next.panes[next.focused] = { active: null, paths: [] };
  }
  return next;
}

function hasSavedPanes(layout: PaneLayout | undefined): layout is PaneLayout {
  return !!layout && (layout.root.kind === "split" || layout.panes[layout.focused].paths.length > 0);
}

export function MarkdownEditorWindow({ files, folders, launchArguments, windowId = editorWindowIdentifier, workspacePath }: MarkdownEditorWindowProps) {
  loadMarkdownUserThemesSync();
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
    const opensFiles = !!files || !!folders || !!workspacePath || !!getLaunchMarkdownFile(launchArguments) || shouldLaunchNewMarkdownDocument(launchArguments);
    const saved = keepsFolders && !opensFiles ? getMarkdownPaneLayoutSetting() : undefined;
    if (hasSavedPanes(saved)) return saved;
    const initialLayout = createPaneLayout(workspace.state.tabs);
    const startupPath = !keepsFolders || files || folders || workspacePath ? null : getStartupMarkdownPath(launchArguments);
    return startupPath ? openPaneTab(initialLayout, initialLayout.focused, startupPath) : initialLayout;
  });
  useEffect(() => {
    const path = initialPanes.panes[initialPanes.focused].active;
    if (path && isFileTab(path)) openWorkspaceTab(path);
  }, [initialPanes, openWorkspaceTab]);
  const [layoutState, setLayoutState] = useState(() => updateLayoutState(initialPanes, false));
  const { animate, layout, editorKeys } = layoutState;
  // Actions read the ref so consecutive calls see each other's changes before rendering.
  const layoutStateRef = useRef(layoutState);
  const setLayout = useCallback((
    change: (layout: PaneLayout) => PaneLayout,
    animated = true,
    rename?: TabRename,
  ) => {
    const previous = layoutStateRef.current;
    const next = change(previous.layout);
    if (next === previous.layout) return;
    const state = updateLayoutState(next, animated, previous, rename);
    layoutStateRef.current = state;
    setLayoutState(state);
  }, []);
  useEffect(() => {
    if (!keepsFolders) return;
    const timeout = setTimeout(() => setMarkdownPaneLayoutSetting(layoutWithoutDrafts(layout)), 250);
    return () => clearTimeout(timeout);
  }, [keepsFolders, layout]);

  const [areaSize, setAreaSize] = useState({ height: 0, width: 0 });
  const sidebarOpen = workspace.state.sidebarOpen;
  const { titleBarHeight } = useMarkdownChromeTheme();
  const paneMinHeight = titleBarHeight + openFilePanelMinHeight;
  const { panes: frames, splits } = useMemo(() => layoutPanes(layout.root, {
    height: Math.max(0, areaSize.height - paneGap),
    width: Math.max(0, areaSize.width - 2 * paneGap),
    x: paneGap,
    y: 0,
  }, paneMinHeight), [areaSize, layout.root, paneMinHeight]);
  const framesRef = useRef(frames);
  framesRef.current = frames;
  const focusedFrame = frames.find(frame => frame.id === layout.focused);
  const canSplitRight = canSplitPane(focusedFrame, "horizontal", paneMinHeight);
  const canSplitDown = canSplitPane(focusedFrame, "vertical", paneMinHeight);
  const hasOtherPanes = layout.root.kind === "split";

  const paneClosers = useRef(new Map<string, (reason: CloseReason, path?: string) => Promise<boolean>>());
  const preparePanes = useCallback(async (ids: string[], reason: CloseReason = "close", path?: string) => {
    for (const id of ids) {
      if (!await (paneClosers.current.get(id)?.(reason, path) ?? true)) return false;
    }
    return true;
  }, []);
  const discardWindowDrafts = useCallback(() => {
    const paths = new Set(Object.values(layoutStateRef.current.layout.panes).flatMap(tabs => tabs.paths));
    for (const path of paths) removeMarkdownDraft(path);
  }, []);
  const tabDrag = useRef<{ paneId: string; path: string } | null>(null);
  const paneActions = useMemo<PaneActions>(() => {
    const openTab = (paneId: string, path: string) => {
      if (isFileTab(path)) openWorkspaceTab(path);
      setLayout(current => openPaneTab(current, paneId, path), false);
    };
    const renameTab = (paneId: string, from: string, to: string) => {
      if (isFileTab(from)) renameWorkspaceTab(from, to);
      else if (isFileTab(to)) openWorkspaceTab(to);
      setLayout(current => {
        const tabs = current.panes[paneId];
        return from !== to && tabs?.paths.includes(from) ? renamePaneTab(current, paneId, from, to) : current;
      }, false, { paneId, from, to });
    };
    return {
      canDropTab: (paneId, zone) => {
        const drag = tabDrag.current;
        if (!drag) return false;
        if (zone === "center") return drag.paneId !== paneId;
        const ownOnlyTab = drag.paneId === paneId && layoutStateRef.current.layout.panes[paneId]?.paths.length === 1;
        return !ownOnlyTab && canSplitPane(framesRef.current.find(frame => frame.id === paneId), zone === "left" || zone === "right" ? "horizontal" : "vertical", paneMinHeight);
      },
      closeTab: (paneId, path, editorKey) => {
        const current = layoutStateRef.current;
        if (!current.layout.panes[paneId]?.paths.includes(path) || current.editorKeys[paneId].get(path) !== editorKey) return;
        removeMarkdownDraft(path);
        setLayout(layout => closePaneTab(layout, paneId, path));
      },
      dragTab: (paneId, path) => { tabDrag.current = { paneId, path }; },
      dropTab: (paneId, drop) => {
        const drag = tabDrag.current;
        tabDrag.current = null;
        if (!drag) return;
        const { paneId: from, path } = drag;
        void (async () => {
          // The shown document leaves its pane, so save it first and the destination opens what the user sees.
          const leaves = !(from === paneId && typeof drop === "number");
          if (leaves && !await preparePanes([from], "close", path)) return;
          setLayout(current => typeof drop === "number" ? movePaneTab(current, from, path, paneId, drop)
            : drop === "center" ? movePaneTab(current, from, path, paneId, current.panes[paneId]?.paths.length ?? 0)
            : splitPaneWithTab(current, from, path, paneId, drop));
        })().catch(reportError);
      },
      focus: paneId => setLayout(current => focusPane(current, paneId), false),
      openTab,
      // An empty tab becomes the file, or gives way to the file's tab already in its pane.
      openFrom: (paneId, from, editorKey, file) => {
        const { editorKeys, layout } = layoutStateRef.current;
        const tabs = layout.panes[paneId];
        if (!tabs || (from === null ? tabs.active !== null : editorKeys[paneId].get(from) !== editorKey)) return;
        if (from === null || !isEmptyTab(from)) openTab(paneId, file);
        else if (tabs.paths.includes(file)) {
          openTab(paneId, file);
          setLayout(current => closePaneTab(current, paneId, from));
        } else renameTab(paneId, from, file);
      },
      register: (paneId, prepareForClose) => {
        paneClosers.current.set(paneId, prepareForClose);
        return () => { if (paneClosers.current.get(paneId) === prepareForClose) paneClosers.current.delete(paneId); };
      },
      renameTab,
    };
  }, [openWorkspaceTab, paneMinHeight, preparePanes, renameWorkspaceTab, reportError, setLayout]);
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
  const [assistant] = useState(createMarkdownAssistant);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const toggleAssistant = useCallback(() => {
    if (assistantOpen) assistant.close();
    setAssistantOpen(!assistantOpen);
  }, [assistant, assistantOpen]);
  useEffect(() => () => assistant.close(), [assistant]);
  // While the Assistant's After is selected, the editor shows its proposal over the stored settings.
  const preview = useValue(assistant.preview$);
  const storedToolbarMode = useMarkdownFormattingToolbarModeSetting();
  const formattingToolbarMode = preview?.formattingToolbarMode ?? storedToolbarMode;
  const autosave = useMarkdownAutosaveSetting();
  const storedAppearance = useMarkdownAppearanceSettings();
  const appearanceSettings = useMemo(() => preview ? { ...storedAppearance, ...preview } : storedAppearance, [preview, storedAppearance]);
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
    if (getPaneHeir(layoutStateRef.current.layout, paneId) && await preparePanes([paneId])) {
      setLayout(current => closePane(current, paneId));
    }
  }, [preparePanes, setLayout]);
  const paneCommands = useMemo<PaneCommands>(() => ({
    closeOtherPanes: () => {
      const { focused, root } = layoutStateRef.current.layout;
      preparePanes(getPaneIds(root).filter(id => id !== focused)).then(ready => {
        if (ready) setLayout(current => closeOtherPanes(current, focused));
      }).catch(reportError);
    },
    closePane: () => { closePaneById(layoutStateRef.current.layout.focused).catch(reportError); },
    closeWindow: () => { closeWindow(windowId).catch(reportError); },
    focusNextPane: () => setLayout(current => focusAdjacentPane(current, 1), false),
    focusPreviousPane: () => setLayout(current => focusAdjacentPane(current, -1), false),
    splitDown: () => { if (canSplitDown) setLayout(current => splitMarkdownPane(current, "vertical")); },
    splitRight: () => { if (canSplitRight) setLayout(current => splitMarkdownPane(current, "horizontal")); },
  }), [canSplitDown, canSplitRight, closePaneById, preparePanes, reportError, setLayout, windowId]);
  const paneCommandState = useMemo(() => ({ canSplitDown, canSplitRight, hasOtherPanes }), [canSplitDown, canSplitRight, hasOtherPanes]);

  const focusedTabs = layout.panes[layout.focused];
  const activePath = focusedTabs?.active ?? null;
  const currentFile = activePath && isFileTab(activePath) ? activePath : null;
  const openInFocusedPane = useCallback((path: string) => paneActions.openTab(layoutStateRef.current.layout.focused, path), [paneActions]);
  const addFolder = useCallback(() => { chooseFolders().then(addFolders).catch(reportError); }, [addFolders, reportError]);
  const newEntryDirectory = getNewEntryDirectory(workspaceFolders, currentFile);
  const newFile = useCallback(async () => {
    openInFocusedPane(createMarkdownDraft());
  }, [openInFocusedPane]);
  const newFolder = useCallback(() => {
    if (newEntryDirectory) createWorkspaceFolder(newEntryDirectory).catch(reportError);
  }, [newEntryDirectory, reportError]);
  const windowMenus = useMemo<WindowMenuOptions>(() => ({
    hasFolders: workspaceFolders.length > 0,
    onAddFolder: addFolder,
    onNewFile: newFile,
    onNewFolder: newFolder,
    onNewTab: () => openInFocusedPane(createEmptyTab()),
    onOpenSettings: openSettingsWindow,
    onSaveWorkspace: workspace.saveWorkspace,
    onToggleAssistant: toggleAssistant,
    composerFocused$: assistant.state$.composerFocused,
  }), [addFolder, assistant, newFile, newFolder, openInFocusedPane, openSettingsWindow, toggleAssistant, workspace.saveWorkspace, workspaceFolders.length]);

  const e2eRun = getMarkdownE2ERunFromLaunchArguments(launchArguments);
  const newOnLaunch = useRef(shouldLaunchNewMarkdownDocument(launchArguments) || (
    keepsFolders && !files && !folders && !workspacePath && initialPanes.root.kind === "pane" &&
    !initialPanes.panes[initialPanes.focused].active && getMarkdownStartupBehaviorSetting() === "newDocument"
  ));
  useEffect(() => {
    if (!newOnLaunch.current) return;
    newOnLaunch.current = false;
    newFile().catch(reportError);
  }, [newFile, reportError]);
  useMarkdownWindowCloseRequest({
    windowId: e2eRun ? undefined : windowId,
    handleError: reportError,
    prepareWindowForClose: async () => {
      if (!await preparePanes(getPaneIds(layoutStateRef.current.layout.root))) return false;
      discardWindowDrafts();
      return true;
    },
  });
  useEffect(() => e2eRun ? undefined : registerMarkdownWindowQuitGuard({
    prepare: () => preparePanes(getPaneIds(layoutStateRef.current.layout.root), "quit"),
    discardDrafts: discardWindowDrafts,
  }), [discardWindowDrafts, e2eRun, preparePanes]);

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
    <View style={styles.row}>
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
            editorKeys={editorKeys[frame.id]}
            focused={frame.id === layout.focused}
            folders={workspaceFolders}
            formattingToolbarMode={formattingToolbarMode}
            frame={frame}
            markdownLayout={markdownLayout}
            markdownStyle={markdownStyle}
            measurementSignature={measurementSignature}
            nativeWindowAppearance={nativeWindowAppearance}
            onToggleSidebar={!sidebarOpen && frame.x === paneGap && frame.y === 0 ? workspace.toggleSidebar : undefined}
            tabs={layout.panes[frame.id]}
            theme={documentTheme}
            titleBarHeight={titleBarHeight}
            windowId={windowId}
            windowMenus={windowMenus}
          />
        )}
        paneMinHeight={paneMinHeight}
        root={layout.root}
        splits={splits}
        tabBarHeight={titleBarHeight}
      />
      {assistantOpen ? <MarkdownAssistantPanel assistant={assistant} onClose={toggleAssistant} /> : null}
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

type WindowMenuOptions = Pick<Parameters<typeof useMarkdownMenus>[0], "composerFocused$" | "hasFolders" | "onAddFolder" | "onNewFile" | "onNewFolder" | "onNewTab" | "onOpenSettings" | "onSaveWorkspace" | "onToggleAssistant">;

type MarkdownPaneProps = {
  actions: PaneActions;
  autosaveEnabled: boolean;
  backgroundStyle: { backgroundColor: string };
  colors: DocumentTabBarProps["colors"];
  commandState: PaneCommandState;
  commands: PaneCommands;
  dangerColor: string;
  editorKeys: ReadonlyMap<string, number>;
  focused: boolean;
  /** The window's root folders, which Open File searches. */
  folders: readonly string[];
  formattingToolbarMode: MarkdownFormattingToolbarMode;
  frame: PaneFrame;
  markdownLayout: MarkdownDocumentProps["markdownLayout"];
  markdownStyle: MarkdownDocumentProps["markdownStyle"];
  measurementSignature: string;
  nativeWindowAppearance: "dark" | "light";
  /** Set for the top-leading pane while the sidebar is hidden: it shows the toggle and clears the traffic lights. */
  onToggleSidebar?: () => void;
  /** The launch arguments for the window's first pane when nothing was restored. */
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
  editorKeys,
  focused,
  folders,
  formattingToolbarMode,
  frame,
  markdownLayout,
  markdownStyle,
  measurementSignature,
  nativeWindowAppearance,
  onToggleSidebar,
  tabs,
  theme,
  titleBarHeight,
  windowId,
  windowMenus,
}: MarkdownPaneProps) {
  const paneId = frame.id;
  const isOnlyPane = !commandState.hasOtherPanes;
  const active = tabs.active;
  const tabClosers = useRef(new Map<string, PrepareTabForClose>());
  const registerTab = useCallback((path: string, prepare: PrepareTabForClose) => {
    tabClosers.current.set(path, prepare);
    return () => { if (tabClosers.current.get(path) === prepare) tabClosers.current.delete(path); };
  }, []);
  useEffect(() => actions.register(paneId, async (reason, path) => {
    const prepares = path === undefined ? [...tabClosers.current.values()] : [tabClosers.current.get(path)];
    for (const prepare of prepares) {
      if (prepare && !await prepare(reason)) return false;
    }
    return true;
  }), [actions, paneId]);

  const openTab = useCallback((path: string) => actions.openTab(paneId, path), [actions, paneId]);
  const renameTab = useCallback((from: string, to: string) => actions.renameTab(paneId, from, to), [actions, paneId]);
  const openFrom = useCallback(
    (from: string | null, file: string) => actions.openFrom(paneId, from, from === null ? undefined : editorKeys.get(from), file),
    [actions, editorKeys, paneId],
  );
  const newDocument = useCallback(async (from: string | null) => { openFrom(from, createMarkdownDraft()); }, [openFrom]);
  // Open File searches the root folders in a panel over this pane; without folders, or from the panel's footer, it is the system picker.
  const activeKey = active === null ? undefined : editorKeys.get(active);
  const [openFile, setOpenFile] = useState<{ browse: () => Promise<void>; from: string | null; key: number | undefined } | null>(null);
  const openFileCurrent = focused && openFile?.from === active && openFile.key === activeKey;
  useEffect(() => { if (!openFileCurrent) setOpenFile(null); }, [openFileCurrent]);
  const showOpenFile = useCallback(async (from: string | null, browse: () => Promise<void>) => {
    if (folders.length > 0) setOpenFile({ browse, from, key: from === null ? undefined : editorKeys.get(from) });
    else await browse();
  }, [editorKeys, folders.length]);
  const closeTab = useCallback(async (path: string) => {
    const prepare = tabClosers.current.get(path);
    const closingPath = prepare ? await prepare("close") : path;
    if (!closingPath) return;
    actions.closeTab(paneId, closingPath, editorKeys.get(path));
  }, [actions, editorKeys, paneId]);
  const reportError = useCallback((error: unknown) => console.error(error), []);

  const closeActiveTab = useCallback(() => {
    if (active) closeTab(active).catch(reportError);
    else if (!isOnlyPane) commands.closePane();
    else commands.closeWindow();
  }, [active, closeTab, commands, isOnlyPane, reportError]);

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
            onClose={path => { actions.focus(paneId); closeTab(path).catch(reportError); }}
            onNewTab={() => { actions.focus(paneId); openTab(createEmptyTab()); }}
            onSelect={path => { actions.focus(paneId); actions.openTab(paneId, path); }}
            onToggleSidebar={onToggleSidebar}
            sidebarOpen={!onToggleSidebar}
            paths={tabs.paths}
            separated={false}
            tabDrag={{ onDragStart: path => actions.dragTab(paneId, path), onDrop: index => actions.dropTab(paneId, index), type: tabDragType }}
            title={getMarkdownTabTitle}
            titleBarHeight={titleBarHeight}
          />
        </View>
      )}
      tabBarHeight={titleBarHeight}
    >
      <PaneTabDropTarget accepts={zone => actions.canDropTab(paneId, zone)} color={colors.primary ?? colors.foreground} onDrop={zone => actions.dropTab(paneId, zone)} type={tabDragType}>
        {/* Clicking anywhere in a pane focuses it without taking the click from the editor. */}
        <View onStartShouldSetResponderCapture={() => { actions.focus(paneId); return false; }} style={styles.root} testID={`markdown-pane-${paneId}`}>
          {(active ? tabs.paths.filter(path => editorKeys.has(path)) : [null]).map(path => (
            <MarkdownTabEditor
              key={path === null ? "idle" : editorKeys.get(path)}
              path={path}
              visible={path === active}
              focused={focused && path === active}
              autosaveEnabled={autosaveEnabled}
              backgroundStyle={backgroundStyle}
              closeActiveTab={closeActiveTab}
              commandState={commandState}
              commands={commands}
              dangerColor={dangerColor}
              foregroundColor={colors.foreground}
              formattingToolbarMode={formattingToolbarMode}
              markdownLayout={markdownLayout}
              markdownStyle={markdownStyle}
              measurementSignature={measurementSignature}
              nativeWindowAppearance={nativeWindowAppearance}
              newDocument={newDocument}
              openFrom={openFrom}
              registerTab={registerTab}
              renameTab={renameTab}
              showOpenFile={showOpenFile}
              theme={theme}
              windowId={windowId}
              windowMenus={windowMenus}
            />
          ))}
          {openFile && openFileCurrent ? (
            <MarkdownOpenFilePanel
              folders={folders}
              onBrowse={() => { setOpenFile(null); openFile.browse().catch(reportError); }}
              onDismiss={() => setOpenFile(null)}
              onError={reportError}
              onOpen={file => { setOpenFile(null); actions.openFrom(paneId, openFile.from, openFile.key, file); }}
              windowId={windowId}
            />
          ) : null}
        </View>
      </PaneTabDropTarget>
    </MarkdownPaneChrome>
  );
}

function MarkdownTabEditor({
  path,
  visible,
  focused,
  autosaveEnabled,
  backgroundStyle,
  closeActiveTab,
  commandState,
  commands,
  dangerColor,
  foregroundColor,
  formattingToolbarMode,
  markdownLayout,
  markdownStyle,
  measurementSignature,
  nativeWindowAppearance,
  newDocument,
  openFrom,
  registerTab,
  renameTab,
  showOpenFile,
  theme,
  windowId,
  windowMenus,
}: Pick<MarkdownPaneProps, "autosaveEnabled" | "backgroundStyle" | "commandState" | "commands" | "dangerColor" |
  "focused" | "formattingToolbarMode" | "markdownLayout" | "markdownStyle" | "measurementSignature" |
  "nativeWindowAppearance" | "theme" | "windowId" | "windowMenus"> & {
  path: string | null;
  visible: boolean;
  foregroundColor: string;
  closeActiveTab: () => void;
  newDocument: (from: string | null) => Promise<void>;
  openFrom: (from: string | null, file: string) => void;
  registerTab: (path: string, prepare: PrepareTabForClose) => () => void;
  renameTab: (from: string, to: string) => void;
  showOpenFile: (from: string | null, browse: () => Promise<void>) => Promise<void>;
}) {
  // A picker can answer after this editor unmounts, and the idle pane's next editor shares its null path.
  const live = useRef(false);
  useEffect(() => {
    live.current = true;
    return () => { live.current = false; };
  }, []);
  const openFile = useCallback((file: string) => { if (live.current) openFrom(path, file); }, [openFrom, path]);
  const newFile = useCallback(() => newDocument(path), [newDocument, path]);
  const session = useMarkdownDocumentSession({ onOpenFile: openFile, onFileSavedAs: renameTab, windowId });
  const { documentCommandsRef, handleError, openMarkdownDialog, openSelectedFile, prepareCurrentDocumentForClose, sessionState$ } = session;
  const openDocument = useCallback(() => showOpenFile(path, openMarkdownDialog), [openMarkdownDialog, path, showOpenFile]);
  const documentPath = isEmptyTab(path) ? null : path;
  useEffect(() => {
    if (documentPath) openSelectedFile(documentPath);
  }, [documentPath, openSelectedFile]);
  useEffect(() => {
    if (!documentPath) return;
    return registerTab(documentPath, async reason => {
      const ready = await prepareCurrentDocumentForClose({ autosaveEnabled, reason });
      return ready ? sessionState$.filename.peek() : null;
    });
  }, [autosaveEnabled, documentPath, prepareCurrentDocumentForClose, registerTab, sessionState$]);
  useEffect(() => {
    if (!visible) documentCommandsRef.current?.commitAndBlurActiveBlock();
  }, [documentCommandsRef, visible]);

  const [findVisible, setFindVisible] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findStatus, setFindStatus] = useState("");
  const [isLinkPopoverOpen, setIsLinkPopoverOpen] = useState(false);
  const hasObservedLayoutInputsRef = useRef(false);
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

  return (
    <View collapsable={false} style={visible ? styles.root : styles.hiddenTab}>
      {focused ? (
        <FocusedPaneBindings
          closeActiveTab={closeActiveTab}
          commandState={commandState}
          commands={commands}
          nativeWindowAppearance={nativeWindowAppearance}
          onFind={() => setFindVisible(true)}
          onInsertLink={insertLink}
          onOpenDocument={openDocument}
          onOpenFile={openFile}
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
      {!documentPath ? (
        <View style={styles.idlePane}>
          <MarkdownEmptyState onNewFile={() => { newFile().catch(handleError); }} onOpenFile={() => { openDocument().catch(handleError); }} />
          <MarkdownSessionError color={dangerColor} session={session} />
        </View>
      ) : (
        <MarkdownEditorSessionContent
          autosaveEnabled={autosaveEnabled}
          focused={focused}
          backgroundStyle={backgroundStyle}
          dangerColor={dangerColor}
          foregroundColor={foregroundColor}
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
      )}
    </View>
  );
}

function FocusedPaneBindings({ closeActiveTab, commandState, commands, nativeWindowAppearance, onFind, onInsertLink, onOpenDocument, onOpenFile, session, windowId, windowMenus }: {
  closeActiveTab: () => void;
  commandState: PaneCommandState;
  commands: PaneCommands;
  nativeWindowAppearance: "dark" | "light";
  onFind: () => void;
  onInsertLink: () => void;
  onOpenDocument: () => Promise<void>;
  onOpenFile: (path: string) => void;
  session: MarkdownDocumentSession;
  windowId: string;
  windowMenus: WindowMenuOptions;
}) {
  useRecentMarkdownDocumentOpener({
    openSelectedFile: onOpenFile,
    windowId,
  });
  useMarkdownKeyboardShortcuts({
    composerFocused$: windowMenus.composerFocused$,
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
    onOpenDocument,
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
  const watchedFilePath = filename && documentSource !== "draft" ? filename : null;
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
  focused: boolean;
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
  focused,
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
  const isDraft = documentSource === "draft";

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
          focused={focused}
          isDraft={isDraft}
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
  focused: boolean;
  isDraft: boolean;
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
  focused,
  isDraft,
  markdownLayout,
  markdownStyle,
  renderSelectionToolbar,
  selectionToolbarEnabled,
  session,
  theme,
}: MarkdownDocumentSurfaceProps) {
  const documentStyle = useMemo(() => [styles.document, backgroundStyle], [backgroundStyle]);
  const savePolicy = useMemo(
    () => ({ autosave: !isDraft && autosaveEnabled }),
    [autosaveEnabled, isDraft],
  );

  return (
    <View pointerEvents={preserveEditingOnBlur ? "none" : "auto"} style={styles.document} testID="markdown-document-input-surface">
      <MarkdownDocument
        preserveEditingOnBlur={preserveEditingOnBlur}
        adapter={nativeMarkdownDocumentAdapter}
        commandsRef={session.documentCommandsRef}
        filename={filename}
        markdownLayout={markdownLayout}
        markdownStyle={markdownStyle}
        onCommandStateChange={session.setCommandState}
        onDirtyChange={session.setIsDirty}
        onError={session.handleError}
        onLoadError={session.handleDocumentLoadError}
        onLoaded={({ sourceSize }) => {
          session.handleDocumentLoaded();
          if (sourceSize === 0 && focused) session.documentCommandsRef.current?.focusFirstBlock();
        }}
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
  hiddenTab: {
    display: "none",
  },
  idlePane: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
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
  row: {
    flex: 1,
    flexDirection: "row",
  },
});
