import { watch } from "@legendapp/spark/files";
import { GlassView } from "@legendapp/spark/ui/glass";
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
  chooseFolders,
  closeDocumentTab,
  createWorkspaceFile,
  createWorkspaceFolder,
  DocumentTabBar,
  getNewEntryDirectory,
  useDocumentWindow,
  useWorkspaceWindow,
  WorkspaceSidebar,
} from "@legend-apps/workspace";
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
  useMarkdownAppExit,
  useMarkdownStartupDocument,
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
import { getLaunchMarkdownFile, isMarkdownPath } from "./markdownFiles";
import type { MarkdownEditorWindowProps } from "./markdownWindows";
import {
  applyMarkdownThemeSetting,
  getMarkdownSidebarFoldersSetting,
  getMarkdownSidebarOpenSetting,
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

export function MarkdownEditorWindow({ files, folders, launchArguments, windowId = editorWindowIdentifier, workspacePath }: MarkdownEditorWindowProps) {
  loadMarkdownUserThemesSync();
  const [startupArguments] = useState(() => files ?? launchArguments);
  // Only the main window is restored on launch, so it alone keeps its sidebar folders.
  const keepsFolders = windowId === editorWindowIdentifier;
  const workspace = useWorkspaceWindow({
    files: files ?? [getLaunchMarkdownFile(launchArguments)].filter((path): path is string => path !== null),
    folders: folders ?? (keepsFolders && !workspacePath ? getMarkdownSidebarFoldersSetting() : undefined),
    workspacePath,
  }, {
    onSidebarOpenChange: setMarkdownSidebarOpenSetting,
    sidebarOpenSetting: getMarkdownSidebarOpenSetting(),
  });
  const { addFolders, openTab, renameTab } = workspace;
  const workspaceFolders = workspace.state.folders;
  useEffect(() => {
    if (keepsFolders) setMarkdownSidebarFoldersSetting(workspaceFolders);
  }, [keepsFolders, workspaceFolders]);
  // Tabs follow the session: opening a file adds its tab and Save As renames it.
  const session = useMarkdownDocumentSession({
    onFileOpened: openTab,
    onFileSavedAs: useCallback((from: string | null, to: string) => from ? renameTab(from, to) : openTab(to), [openTab, renameTab]),
  });
  useDocumentWindow(windowId, workspace.toggleSidebar, refreshMarkdownEditorMenuState);
  const [findVisible, setFindVisible] = useState(false);
  const [findQuery, setFindQuery] = useState("");
  const [findStatus, setFindStatus] = useState("");
  const showFind = useCallback(() => setFindVisible(true), []);
  const [isLinkPopoverOpen, setIsLinkPopoverOpen] = useState(false);
  const hasObservedLayoutInputsRef = useRef(false);
  const e2eRun = getMarkdownE2ERunFromLaunchArguments(launchArguments);
  const displayThemeSetting = useMarkdownDisplayThemeSetting();
  const layoutThemeSetting = useMarkdownLayoutThemeSetting();
  const displayTheme = getLegendDisplayTheme(displayThemeSetting);
  const layoutTheme = getMarkdownLayoutTheme(layoutThemeSetting);
  const nativeWindowAppearance = getLegendDisplayThemeAppearance(displayThemeSetting);
  const backgroundStyle = useMemo(() => ({ backgroundColor: displayTheme.colors.background }), [displayTheme.colors.background]);
  const formattingToolbarMode = useMarkdownFormattingToolbarModeSetting();
  const autosave = useMarkdownAutosaveSetting();
  const appearanceSettings = useMarkdownAppearanceSettings();
  const { titleBarHeight } = useMarkdownChromeTheme();
  const markdownStyle = useMemo(
    () => getMarkdownStyleForAppearance(displayTheme, layoutTheme, appearanceSettings),
    [appearanceSettings, displayTheme, layoutTheme],
  );
  const markdownLayout = useMemo(() => {
    const layout = getMarkdownLayoutForAppearance(layoutTheme, appearanceSettings);
    return {
      ...layout,
      content: {
        ...layout.content,
        verticalPadding: Math.max(titleBarHeight + 12, layout.content?.verticalPadding ?? 48),
      },
    };
  }, [appearanceSettings, layoutTheme, titleBarHeight]);
  const measurementSignature = useMemo(
    () => getMarkdownMeasurementSignature(markdownLayout, markdownStyle),
    [markdownLayout, markdownStyle],
  );
  const openSettingsWindow = useMarkdownSettingsWindow({
    backgroundColor: displayTheme.colors.windowBackground,
    onError: session.handleError,
  });
  const { documentCommandsRef } = session;
  const find = useCallback(async (backwards = false) => {
    try {
      const found = await documentCommandsRef.current?.find(findQuery, backwards);
      setFindStatus(found ? "Match selected" : "No matches");
    } catch (error) { session.handleError(error); }
  }, [documentCommandsRef, findQuery, session.handleError]);
  const insertLink = useCallback(() => {
    setIsLinkPopoverOpen(true);
  }, []);
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
      session.documentCommandsRef.current?.invalidateLayoutMeasurements();
    } else {
      hasObservedLayoutInputsRef.current = true;
    }
  }, [measurementSignature, session.documentCommandsRef]);

  useEffect(() => {
    applyMarkdownThemeSetting();
  }, []);

  useMarkdownStartupDocument({
    launchArguments: startupArguments,
    openSelectedFile: session.openSelectedFile,
    openUntitledDocument: session.openUntitledDocument,
  });

  useRecentMarkdownDocumentOpener({
    flushCurrentDocumentBeforeTransition: session.flushCurrentDocumentBeforeTransition,
    openSelectedFile: session.openSelectedFile,
    windowId,
  });

  useMarkdownAppExit({
    autosaveEnabled: autosave === "enabled",
    handleError: session.handleError,
    prepareCurrentDocumentForClose: session.prepareCurrentDocumentForClose,
  });

  useMarkdownWindowCloseRequest({
    autosaveEnabled: autosave === "enabled",
    handleError: session.handleError,
    prepareCurrentDocumentForClose: session.prepareCurrentDocumentForClose,
    windowId,
  });

  useMarkdownKeyboardShortcuts({
    documentCommandsRef: session.documentCommandsRef,
    sessionState$: session.sessionState$,
    windowId,
  });

  const currentFile = useValue(() => session.sessionState$.documentSource.get() === "file" ? session.sessionState$.filename.get() : null);
  const { prepareCurrentDocumentForClose, openSelectedFile, openUntitledDocument, handleError } = session;
  const switchToFile = useCallback(async (path: string) => {
    if (path !== currentFile && await prepareCurrentDocumentForClose({ autosaveEnabled: autosave === "enabled", reason: "open" })) {
      openSelectedFile(path);
    }
  }, [autosave, currentFile, openSelectedFile, prepareCurrentDocumentForClose]);
  const addFolder = useCallback(() => { chooseFolders().then(addFolders).catch(handleError); }, [addFolders, handleError]);
  const newEntryDirectory = getNewEntryDirectory(workspaceFolders, currentFile);
  const newFile = useCallback(() => {
    if (newEntryDirectory) createWorkspaceFile(newEntryDirectory, newMarkdownFileName).then(switchToFile).catch(handleError);
  }, [handleError, newEntryDirectory, switchToFile]);
  const newFolder = useCallback(() => {
    if (newEntryDirectory) createWorkspaceFolder(newEntryDirectory).catch(handleError);
  }, [handleError, newEntryDirectory]);

  useMarkdownMenus({
    hasFolders: workspaceFolders.length > 0,
    onAddFolder: addFolder,
    onNewFile: newFile,
    onNewFolder: newFolder,
    documentCommandsRef: session.documentCommandsRef,
    onError: session.handleError,
    onInsertLink: insertLink,
    onFind: showFind,
    onNewDocument: session.newMarkdownDocument,
    onOpenDocument: session.openMarkdownDialog,
    onOpenSettings: openSettingsWindow,
    onSaveDocument: session.saveCurrentDocument,
    onSaveDocumentAs: session.saveCurrentDocumentAs,
    onSaveWorkspace: workspace.saveWorkspace,
    sessionState$: session.sessionState$,
    windowId,
  });

  useMarkdownEditorWindowOptions({
    appearance: nativeWindowAppearance,
    backgroundColor: displayTheme.colors.windowBackground,
    onError: session.handleError,
    sessionState$: session.sessionState$,
    windowId,
  });

  const closeFileTab = useCallback(async (path: string) => {
    if (path !== currentFile) {
      workspace.closeTab(path);
      return;
    }
    if (!await prepareCurrentDocumentForClose({ autosaveEnabled: autosave === "enabled", reason: "close" })) return;
    const next = closeDocumentTab({ active: path, paths: workspace.state.tabs.paths }, path).active;
    workspace.closeTab(path);
    if (next) openSelectedFile(next);
    else openUntitledDocument();
  }, [autosave, currentFile, openSelectedFile, openUntitledDocument, prepareCurrentDocumentForClose, workspace]);
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

  const content = (
    <View style={styles.root}>
      {findVisible && <View style={{ marginTop: titleBarHeight }} className="flex-row items-center gap-3 border-b border-border bg-background px-4 py-2">
        <TextInput accessibilityLabel="Find in document" autoFocus className="flex-1 text-foreground"
          value={findQuery} onChangeText={setFindQuery} onSubmitEditing={() => { void find(); }} placeholder="Find…" />
        <Pressable accessibilityRole="button" accessibilityLabel="Previous match" onPress={() => { void find(true); }}><Text className="text-foreground">Previous</Text></Pressable>
        <Pressable accessibilityRole="button" accessibilityLabel="Next match" onPress={() => { void find(); }}><Text className="text-foreground">Next</Text></Pressable>
        <Text className="text-muted">{findStatus}</Text>
        <Pressable accessibilityRole="button" accessibilityLabel="Close Find" onPress={() => setFindVisible(false)}><Text className="text-foreground">Done</Text></Pressable>
      </View>}
      <MarkdownEditorSessionContent
        autosaveEnabled={autosave === "enabled"}
        backgroundStyle={backgroundStyle}
        dangerColor={displayTheme.colors.danger}
        foregroundColor={displayTheme.colors.foreground}
        formattingToolbarMode={formattingToolbarMode}
        topChromeInset={findVisible ? 0 : titleBarHeight}
        isLinkPopoverOpen={isLinkPopoverOpen}
        markdownLayout={markdownLayout}
        markdownStyle={markdownStyle}
        onApplyLink={applyLink}
        onCancelLink={() => setIsLinkPopoverOpen(false)}
        onInsertLink={insertLink}
        renderSelectionToolbar={renderSelectionToolbar}
        session={session}
        theme={displayTheme.markdownDocument}
      />
      <View pointerEvents="box-none" style={[styles.titlebar, { height: titleBarHeight }]}>
        <View pointerEvents="none" style={StyleSheet.absoluteFillObject}>
          <GlassView glassStyle="clear" style={styles.glass} />
          <View style={[StyleSheet.absoluteFillObject, backgroundStyle, { opacity: 0.8 }]} />
        </View>
        <DocumentTabBar
          activePath={currentFile}
          colors={workspaceColors}
          onClose={path => { closeFileTab(path).catch(handleError); }}
          onSelect={path => { switchToFile(path).catch(handleError); }}
          onToggleSidebar={workspace.state.sidebarOpen ? undefined : workspace.toggleSidebar}
          sidebarOpen={workspace.state.sidebarOpen}
          paths={workspace.state.tabs.paths}
          titleBarHeight={titleBarHeight}
        />
      </View>
    </View>
  );

  return (
    <View style={[styles.root, backgroundStyle]}>
      <MarkdownFileWatcher session={session} />
      <SidebarSplitView
        appearance={nativeWindowAppearance}
        content={content}
        sidebar={(
          <WorkspaceSidebar
            activePath={currentFile}
            colors={workspaceColors}
            files={workspace.state.files}
            folderMenu={{ newFileName: newMarkdownFileName, onRemoveFolder: workspace.removeFolder, windowId }}
            folders={workspaceFolders}
            isDocumentPath={isMarkdownPath}
            onAddFolder={addFolder}
            onError={handleError}
            onOpenFile={path => { switchToFile(path).catch(handleError); }}
            onToggleSidebar={workspace.toggleSidebar}
            titleBarHeight={titleBarHeight}
          />
        )}
        onSidebarCollapsedChange={collapsed => workspace.setSidebarOpen(!collapsed)}
        sidebarCollapsed={!workspace.state.sidebarOpen}
        sidebarWidth={220}
        style={styles.root}
      />
    </View>
  );
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
  /** Insets banners and the top toolbar below the title bar; 0 while the find bar shows. */
  topChromeInset: number;
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
  topChromeInset,
}: MarkdownEditorSessionContentProps) {
  const filename = useValue(session.sessionState$.filename);
  const documentSource = useValue(session.sessionState$.documentSource);
  const isUntitledDocument = documentSource === "untitled";
  const hasTopChrome = useValue(() => !!session.sessionState$.conflict.get() || !!session.sessionState$.lastError.get())
    || formattingToolbarMode === "top";

  if (!filename) {
    return null;
  }

  return (
    <View style={[styles.root, backgroundStyle, hasTopChrome && { paddingTop: topChromeInset }]}>
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
  titlebar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    justifyContent: "center",
    overflow: "hidden",
  },
  glass: {
    // Keep the rounded glass edges outside the clipped titlebar band.
    position: "absolute",
    top: -48,
    bottom: -48,
    left: -48,
    right: -48,
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
});
