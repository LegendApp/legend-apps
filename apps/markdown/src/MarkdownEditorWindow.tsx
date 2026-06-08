import {
  MarkdownDocument,
  type MarkdownDocumentCommandState,
  type MarkdownSelectionAnchor,
} from "@legend-desktop/markdown-document";
import { getLegendTheme } from "@legend-desktop/theme";
import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { StyleSheet, Text, View } from "react-native";
import { MarkdownE2EEditorSmoke } from "./MarkdownE2EEditorSmoke";
import {
  getMarkdownE2ERunFromLaunchArguments,
  isMarkdownDocumentE2EScenario,
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
import {
  applyMarkdownThemeSetting,
  getMarkdownAppearanceSettings,
  getMarkdownAutosaveSetting,
  getMarkdownFormattingToolbarModeSetting,
  getMarkdownThemeSetting,
  subscribeToMarkdownSettings,
} from "./markdownSettings";
import {
  getMarkdownLayoutForAppearance,
  getMarkdownStyleForAppearance,
} from "./markdownAppearance";
import { loadMarkdownUserThemesSync } from "./userThemes";
type MarkdownEditorWindowProps = {
  launchArguments?: string[];
};

export function MarkdownEditorWindow({ launchArguments }: MarkdownEditorWindowProps) {
  loadMarkdownUserThemesSync();
  const session = useMarkdownDocumentSession();
  const e2eRun = getMarkdownE2ERunFromLaunchArguments(launchArguments);
  const themeSetting = useSyncExternalStore(
    subscribeToMarkdownSettings,
    getMarkdownThemeSetting,
    getMarkdownThemeSetting,
  );
  const theme = getLegendTheme(themeSetting);
  const backgroundStyle = useMemo(() => ({ backgroundColor: theme.colors.background }), [theme.colors.background]);
  const formattingToolbarMode = useSyncExternalStore(
    subscribeToMarkdownSettings,
    getMarkdownFormattingToolbarModeSetting,
    getMarkdownFormattingToolbarModeSetting,
  );
  const autosave = useSyncExternalStore(
    subscribeToMarkdownSettings,
    getMarkdownAutosaveSetting,
    getMarkdownAutosaveSetting,
  );
  const appearanceSettings = useSyncExternalStore(
    subscribeToMarkdownSettings,
    getMarkdownAppearanceSettings,
    getMarkdownAppearanceSettings,
  );
  const markdownStyle = useMemo(
    () => getMarkdownStyleForAppearance(theme, appearanceSettings),
    [appearanceSettings, theme],
  );
  const markdownLayout = useMemo(
    () => getMarkdownLayoutForAppearance(theme, appearanceSettings),
    [appearanceSettings, theme],
  );
  const [selectionAnchor, setSelectionAnchor] = useState<MarkdownSelectionAnchor | null>(null);
  const [documentCommandState, setDocumentCommandState] = useState<MarkdownDocumentCommandState>({
    canRedo: false,
    canUndo: false,
  });
  const currentFilePath = session.isUntitledDocument ? null : session.filename;
  const openSettingsWindow = useMarkdownSettingsWindow({
    backgroundColor: theme.colors.windowBackground,
    onError: session.handleError,
  });

  const handleSelectionAnchorChange = useCallback((anchor: MarkdownSelectionAnchor | null) => {
    setSelectionAnchor(anchor);
  }, []);

  const renderSelectionToolbar = useCallback(
    (anchor: MarkdownSelectionAnchor) => (
      <MarkdownFloatingSurface anchor={anchor}>
        <MarkdownFormattingToolbar commandsRef={session.documentCommandsRef} floating />
      </MarkdownFloatingSurface>
    ),
    [session.documentCommandsRef],
  );

  useEffect(() => {
    applyMarkdownThemeSetting();
  }, []);

  useMarkdownStartupDocument({
    launchArguments,
    openSelectedFile: session.openSelectedFile,
    openUntitledDocument: session.openUntitledDocument,
  });

  useRecentMarkdownDocumentOpener({
    flushCurrentDocumentBeforeTransition: session.flushCurrentDocumentBeforeTransition,
    handleError: session.handleError,
    openSelectedFile: session.openSelectedFile,
  });

  useMarkdownAppExit({
    flushCurrentDocumentBeforeTransition: session.flushCurrentDocumentBeforeTransition,
    handleError: session.handleError,
  });

  useMarkdownWindowCloseRequest({
    autosaveEnabled: autosave === "enabled",
    handleError: session.handleError,
    prepareCurrentDocumentForClose: session.prepareCurrentDocumentForClose,
  });

  useMarkdownKeyboardShortcuts({
    documentCommandsRef: session.documentCommandsRef,
  });

  useMarkdownMenus({
    currentFilePath,
    documentCommandsRef: session.documentCommandsRef,
    documentCommandState,
    hasDocument: session.hasDocument,
    isDirty: session.isDirty,
    onError: session.handleError,
    onNewDocument: session.newMarkdownDocument,
    onOpenDocument: session.openMarkdownDialog,
    onOpenSettings: openSettingsWindow,
    onSaveDocument: session.saveCurrentDocument,
    onSaveDocumentAs: session.saveCurrentDocumentAs,
    saveState: session.saveState,
  });

  useMarkdownEditorWindowOptions({
    backgroundColor: theme.colors.windowBackground,
    filename: session.filename,
    isDirty: session.isDirty,
    isUntitledDocument: session.isUntitledDocument,
    onError: session.handleError,
  });

  if (e2eRun) {
    if (e2eRun.scenario === "editor-ui-smoke") {
      return <MarkdownE2EEditorSmoke />;
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

  if (!session.hasDocument || !session.filename) {
    return null;
  }

  return (
    <View style={[styles.root, backgroundStyle]}>
      {session.lastError ? (
        <Text style={[styles.error, { color: theme.colors.danger }]}>{session.lastError}</Text>
      ) : null}
      {formattingToolbarMode === "top" ? (
        <MarkdownFormattingToolbar commandsRef={session.documentCommandsRef} />
      ) : null}
      <View style={styles.documentFrame}>
        <MarkdownDocument
          adapter={session.activeAdapter}
          autoFocusFirstBlock={session.isUntitledDocument}
          commandsRef={session.documentCommandsRef}
          filename={session.filename}
          markdownLayout={markdownLayout}
          markdownStyle={markdownStyle}
          onCommandStateChange={setDocumentCommandState}
          onDirtyChange={session.setIsDirty}
          onError={session.handleError}
          onLoadError={session.handleDocumentLoadError}
          onLoaded={session.handleDocumentLoaded}
          onSaveStateChange={session.setSaveState}
          onSelectionAnchorChange={handleSelectionAnchorChange}
          renderSelectionToolbar={renderSelectionToolbar}
          savePolicy={{ autosave: !session.isUntitledDocument && autosave === "enabled" }}
          selectionToolbarAnchor={formattingToolbarMode === "selection" ? selectionAnchor : null}
          style={[styles.document, backgroundStyle]}
          theme={theme.markdownDocument}
        />
      </View>
    </View>
  );
}

export default MarkdownEditorWindow;

const styles = StyleSheet.create({
  document: {
    flex: 1,
  },
  documentFrame: {
    flex: 1,
  },
  error: {
    fontSize: 13,
    paddingHorizontal: 24,
    paddingVertical: 8,
    textAlign: "center",
  },
  root: {
    flex: 1,
  },
});
