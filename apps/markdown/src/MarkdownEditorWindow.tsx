import { useWatchedDocumentReload } from "@legendapp/spark/app/documents";
import { SidebarSplitView } from "@legendapp/spark/ui/split-view";
import {
  MarkdownDocument,
  nativeMarkdownDocumentAdapter,
  type MarkdownDocumentProps,
  type MarkdownSelectionAnchor,
} from "@legend-apps/markdown-document";
import { getLegendDisplayTheme, getLegendDisplayThemeAppearance, getMarkdownLayoutTheme } from "@legend-apps/theme";
import {
  closeDocumentTab,
  DocumentTabBar,
  useDocumentWindow,
  useWorkspaceWindow,
  WorkspaceSidebar,
} from "@legend-apps/workspace";
import { useValue } from "@legendapp/state/react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
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
import { editorWindowIdentifier, markdownFileTypes } from "./appConstants";
import { getLaunchMarkdownFile, isMarkdownPath } from "./markdownFiles";
import type { MarkdownEditorWindowProps } from "./markdownWindows";
import {
  applyMarkdownThemeSetting,
  getMarkdownSidebarOpenSetting,
  setMarkdownSidebarOpenSetting,
  useMarkdownAppearanceSettings,
  useMarkdownAutosaveSetting,
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
  // The session reports workspace errors once it exists.
  const reportWorkspaceError = useRef<(error: unknown) => void>(console.error);
  const workspace = useWorkspaceWindow({
    files: files ?? [getLaunchMarkdownFile(launchArguments)].filter((path): path is string => path !== null),
    folders,
    workspacePath,
  }, {
    fileTypes: markdownFileTypes,
    onError: useCallback((error: unknown) => reportWorkspaceError.current(error), []),
    onSidebarOpenChange: setMarkdownSidebarOpenSetting,
    sidebarOpenSetting: getMarkdownSidebarOpenSetting(),
  });
  const { openTab, renameTab } = workspace;
  // Tabs follow the session: opening a file adds its tab and Save As renames it.
  const session = useMarkdownDocumentSession({
    onFileOpened: openTab,
    onFileSavedAs: useCallback((from: string | null, to: string) => from ? renameTab(from, to) : openTab(to), [openTab, renameTab]),
  });
  useDocumentWindow(windowId, workspace.toggleSidebar, refreshMarkdownEditorMenuState);
  useEffect(() => { reportWorkspaceError.current = session.handleError; }, [session.handleError]);
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
  const markdownStyle = useMemo(
    () => getMarkdownStyleForAppearance(displayTheme, layoutTheme, appearanceSettings),
    [appearanceSettings, displayTheme, layoutTheme],
  );
  const markdownLayout = useMemo(
    () => getMarkdownLayoutForAppearance(layoutTheme, appearanceSettings),
    [appearanceSettings, layoutTheme],
  );
  const measurementSignature = useMemo(
    () => getMarkdownMeasurementSignature(markdownLayout, markdownStyle),
    [markdownLayout, markdownStyle],
  );
  const openSettingsWindow = useMarkdownSettingsWindow({
    backgroundColor: displayTheme.colors.windowBackground,
    onError: session.handleError,
  });
  const { documentCommandsRef } = session;
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
  });

  useMarkdownMenus({
    documentCommandsRef: session.documentCommandsRef,
    onError: session.handleError,
    onInsertLink: insertLink,
    onNewDocument: session.newMarkdownDocument,
    onOpenDocument: session.openMarkdownDialog,
    onOpenSettings: openSettingsWindow,
    onSaveDocument: session.saveCurrentDocument,
    onSaveDocumentAs: session.saveCurrentDocumentAs,
    onSaveWorkspace: workspace.saveWorkspace,
    onToggleSidebar: workspace.toggleSidebar,
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

  const currentFile = useValue(() => session.sessionState$.documentSource.get() === "file" ? session.sessionState$.filename.get() : null);
  const { prepareCurrentDocumentForClose, openSelectedFile, openUntitledDocument, handleError } = session;
  const switchToFile = useCallback(async (path: string) => {
    if (path !== currentFile && await prepareCurrentDocumentForClose({ autosaveEnabled: autosave === "enabled", reason: "open" })) {
      openSelectedFile(path);
    }
  }, [autosave, currentFile, openSelectedFile, prepareCurrentDocumentForClose]);
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
      <DocumentTabBar
        activePath={currentFile}
        colors={workspaceColors}
        onClose={path => { closeFileTab(path).catch(handleError); }}
        onSelect={path => { switchToFile(path).catch(handleError); }}
        onToggleSidebar={workspace.toggleSidebar}
        sidebarOpen={workspace.state.sidebarOpen}
        paths={workspace.state.tabs.paths}
      />
      <MarkdownEditorSessionContent
        autosaveEnabled={autosave === "enabled"}
        backgroundStyle={backgroundStyle}
        dangerColor={displayTheme.colors.danger}
        foregroundColor={displayTheme.colors.foreground}
        formattingToolbarMode={formattingToolbarMode}
        isLinkPopoverOpen={isLinkPopoverOpen}
        markdownLayout={markdownLayout}
        markdownStyle={markdownStyle}
        mutedColor={displayTheme.colors.muted}
        onApplyLink={applyLink}
        onCancelLink={() => setIsLinkPopoverOpen(false)}
        onInsertLink={insertLink}
        renderSelectionToolbar={renderSelectionToolbar}
        session={session}
        theme={displayTheme.markdownDocument}
      />
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
            folders={workspace.state.folders}
            isDocumentPath={isMarkdownPath}
            onAddFile={workspace.chooseFiles}
            onAddFolder={workspace.chooseFolders}
            onError={handleError}
            onOpenFile={path => { switchToFile(path).catch(handleError); }}
          />
        )}
        sidebarCollapsed={!workspace.state.sidebarOpen}
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
  useWatchedDocumentReload({ onError: console.error, onReload: checkDocument, path: watchedFilePath });

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
  mutedColor: string;
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
  mutedColor,
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
        <MarkdownUntitledPlaceholder
          foregroundColor={foregroundColor}
          isUntitledDocument={isUntitledDocument}
          mutedColor={mutedColor}
          session={session}
        />
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

function MarkdownUntitledPlaceholder({
  foregroundColor,
  isUntitledDocument,
  mutedColor,
  session,
}: {
  foregroundColor: string;
  isUntitledDocument: boolean;
  mutedColor: string;
  session: MarkdownDocumentSession;
}) {
  const isDirty = useValue(session.sessionState$.isDirty);
  const lastError = useValue(session.sessionState$.lastError);

  if (!isUntitledDocument || isDirty || lastError) {
    return null;
  }

  return (
    <View pointerEvents="none" style={styles.placeholder}>
      <Text style={[styles.placeholderTitle, { color: foregroundColor }]}>Untitled</Text>
      <Text style={[styles.placeholderText, { color: mutedColor }]}>Start writing</Text>
    </View>
  );
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
  const adapter = isUntitledDocument ? untitledMarkdownAdapter : nativeMarkdownDocumentAdapter;
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
  placeholder: {
    left: 40,
    position: "absolute",
    top: 48,
    zIndex: 1,
  },
  placeholderText: {
    fontSize: 14,
    lineHeight: 20,
  },
  placeholderTitle: {
    fontSize: 22,
    fontWeight: "600",
    lineHeight: 30,
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
