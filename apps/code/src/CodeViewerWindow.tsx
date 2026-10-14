import { createDocumentTransitionGuard } from "@legendapp/spark/app/documents";
import { beforeQuit } from "@legendapp/spark/app";
import { SidebarSplitView } from "@legendapp/spark/ui/split-view";
import { beforeWindowClose } from "@legendapp/spark/windows";
import { ownRegistration } from "@legend-apps/runtime-utils";
import { noteRecentDocument } from "@legendapp/spark/app/documents";
import { prepareDocument, SourceDocumentEditor, type SourceDocumentEditorHandle } from "@legend-apps/source-editor";
import { getLegendDisplayTheme } from "@legend-apps/theme";
import { DocumentTabBar, useDocumentWindow, useWorkspaceWindow, WorkspaceSidebar } from "@legend-apps/workspace";
import { useValue } from "@legendapp/state/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { codeViewerWindowIdentifier } from "./appConstants";
import { getCodeLanguage, getLaunchCodeFile, openCodeFileDialog } from "./codeFiles";
import {
  getCodeSidebarOpenSetting,
  setCodeSidebarOpenSetting,
  useCodeFontFamilySetting,
  useCodeFontSizeSetting,
  useCodeSyntaxHighlightingEnabledSetting,
  useCodeSyntaxTheme,
  useCodeSyntaxThemeSetting,
} from "./codeSettings";
import { codeAutomaticPairs$, codeViewerWindows } from "./codeViewerRequests";
import { setCodeViewerWindowOptions, type CodeViewerWindowProps } from "./codeWindows";

const editorCommands = ["save", "saveAs", "find", "goToLine", "indent", "outdent", "duplicateLine", "moveLineUp", "moveLineDown", "toggleComment"];

/** A tab's React key outlives Save As, so renaming its path does not remount the native editor. */
type CodeTabDocument = { key: string; preparedDocumentId?: string };

/** Removes a tab's document, or moves it to `to` after Save As. */
function moveTabDocument(documents: Record<string, CodeTabDocument>, from: string, to?: string) {
  const { [from]: document, ...rest } = documents;
  return document && to ? { ...rest, [to]: document } : rest;
}

export function CodeViewerWindow({ files, folders, launchArguments, preparedDocumentId, windowId = codeViewerWindowIdentifier, workspacePath }: CodeViewerWindowProps) {
  const fontFamily = useCodeFontFamilySetting();
  const fontSize = useCodeFontSizeSetting();
  const selectedSyntaxTheme = useCodeSyntaxThemeSetting();
  const syntaxHighlightingEnabled = useCodeSyntaxHighlightingEnabledSetting();
  const syntaxTheme = useCodeSyntaxTheme();
  const displayTheme = getLegendDisplayTheme(syntaxTheme.appearance);
  const launchFile = useMemo(() => files?.[0] ?? getLaunchCodeFile(launchArguments), [files, launchArguments]);
  const [error, setError] = useState<string | null>(null);
  const reportError = useCallback((cause: unknown) => setError(cause instanceof Error ? cause.message : String(cause)), []);
  const workspace = useWorkspaceWindow(
    { files: files ?? (launchFile ? [launchFile] : []), folders, workspacePath },
    { onError: reportError, onSidebarOpenChange: setCodeSidebarOpenSetting, sidebarOpenSetting: getCodeSidebarOpenSetting() },
  );
  const { closeTab, openTab, renameTab } = workspace;
  const { files: sidebarFiles, folders: sidebarFolders, sidebarOpen, tabs } = workspace.state;
  const [tabDocuments, setTabDocuments] = useState<Record<string, CodeTabDocument>>(() =>
    Object.fromEntries(workspace.state.tabs.paths.map(path => [path, { key: path, preparedDocumentId: path === launchFile ? preparedDocumentId : undefined }])));
  const nextTabKey = useRef(0);
  const editors = useRef(new Map<string, SourceDocumentEditorHandle>());
  const automaticPairs = useValue(codeAutomaticPairs$);
  const [transition] = useState(createDocumentTransitionGuard);
  const loadedLaunchFileRef = useRef(launchFile);
  const backgroundColor = syntaxTheme.background;
  const foregroundColor = syntaxTheme.foreground;
  const borderColor = displayTheme.colors.border;
  const workspaceColors = useMemo(() => ({ ...displayTheme.colors, foreground: foregroundColor }), [displayTheme.colors, foregroundColor]);
  const activeKey = tabs.active ? tabDocuments[tabs.active]?.key : undefined;
  useDocumentWindow(windowId, workspace.toggleSidebar);

  useEffect(() => {
    void (activeKey ? editors.current.get(activeKey) : undefined)?.command("focus").catch(reportError);
  }, [activeKey, reportError]);

  const openFile = useCallback((path: string) => {
    setError(null);
    if (!tabDocuments[path]) {
      // Begin I/O before the tab renders; the editor adopts the prepared document.
      const document = { key: `${path}#${++nextTabKey.current}`, preparedDocumentId: prepareDocument(path) };
      setTabDocuments(current => ({ ...current, [path]: document }));
    }
    openTab(path);
  }, [openTab, tabDocuments]);

  const closeFile = useCallback(async (path: string) => {
    const document = tabDocuments[path];
    const editor = document ? editors.current.get(document.key) : undefined;
    try {
      // The mounted editor owns its prepared document, so closing needs no cancellation.
      await transition(() => editor?.command("confirmClose") ?? Promise.resolve(true), () => {
        closeTab(path);
        setTabDocuments(current => moveTabDocument(current, path));
      });
    } catch (cause) { reportError(cause); }
  }, [closeTab, reportError, tabDocuments, transition]);

  const renameFile = useCallback((from: string, to: string) => {
    renameTab(from, to);
    setTabDocuments(current => moveTabDocument(current, from, to));
    noteRecentDocument(to);
  }, [renameTab]);

  useEffect(() => {
    const prepare = async () => {
      for (const editor of editors.current.values()) if (!await editor.command("confirmClose")) return false;
      return true;
    };
    let active = true;
    const report = (cause: unknown) => { if (active) reportError(cause); else console.error(cause); };
    const approve = () => active ? transition(prepare, () => {}) : Promise.resolve(false);
    const close = ownRegistration(beforeWindowClose(windowId, approve, { onError: report }), report);
    const quit = ownRegistration(beforeQuit(approve, { onError: report }), report);
    return () => { active = false; void close.remove().catch(report); void quit.remove().catch(report); };
  }, [reportError, transition, windowId]);

  useEffect(() => codeViewerWindows.register(windowId, {
    command: (itemId) => {
      if (itemId === "automaticPairs") codeAutomaticPairs$.set(value => !value);
      if (itemId === "toggleSidebar") workspace.toggleSidebar();
      if (itemId === "saveWorkspace") workspace.saveWorkspace().catch(reportError);
      if (editorCommands.includes(itemId))
        void (activeKey ? editors.current.get(activeKey) : undefined)?.command(itemId).then(completed => { if (completed) setError(null); }).catch(reportError);
    },
    openFile,
    windowId,
  }), [activeKey, openFile, reportError, windowId, workspace]);

  const openCodeDialog = useCallback(async () => {
    try {
      const path = await openCodeFileDialog();
      if (path) openFile(path);
    } catch (cause) {
      reportError(cause);
    }
  }, [openFile, reportError]);

  useEffect(() => {
    if (launchFile && loadedLaunchFileRef.current !== launchFile) {
      loadedLaunchFileRef.current = launchFile;
      openFile(launchFile);
    }
  }, [launchFile, openFile]);

  useEffect(() => {
    setCodeViewerWindowOptions({
      appearance: syntaxTheme.appearance,
      backgroundColor: syntaxTheme.background,
      filePath: tabs.active,
      windowId,
    }).catch((cause: unknown) => {
      console.error(cause instanceof Error ? cause.message : String(cause));
    });
  }, [syntaxTheme.appearance, syntaxTheme.background, tabs.active, windowId]);

  const content = (
    <View style={styles.root}>
      <DocumentTabBar
        activePath={tabs.active}
        colors={workspaceColors}
        onClose={closeFile}
        onSelect={openTab}
        onToggleSidebar={workspace.toggleSidebar}
        sidebarOpen={sidebarOpen}
        paths={tabs.paths}
      />
      {error ? <Text style={[styles.error, { color: displayTheme.colors.danger }]}>{error}</Text> : null}
      <View style={styles.list}>
        {tabs.paths.map(path => {
          const document = tabDocuments[path];
          return document ? (
            <View key={document.key} style={path === tabs.active ? styles.list : styles.hidden} pointerEvents={path === tabs.active ? "auto" : "none"} accessibilityElementsHidden={path !== tabs.active}>
              <SourceDocumentEditor
                ref={(editor: SourceDocumentEditorHandle | null) => { if (editor) editors.current.set(document.key, editor); else editors.current.delete(document.key); }}
                automaticPairs={automaticPairs}
                onDocumentState={(state) => { if (state.path && state.path !== path) renameFile(path, state.path); }}
                filePath={path}
                preparedDocumentId={document.preparedDocumentId}
                fontFamily={fontFamily}
                fontSize={fontSize}
                foreground={foregroundColor}
                language={getCodeLanguage(path)}
                syntaxTheme={selectedSyntaxTheme}
                syntaxHighlightingEnabled={syntaxHighlightingEnabled}
                syntaxHighlightingMode="background"
                showFileLoadingBanner={false}
                syntaxBackend="tree-sitter"
                onLoad={() => noteRecentDocument(path)}
              />
            </View>
          ) : null;
        })}
        {tabs.paths.length === 0 ? (
          <View style={styles.empty}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open File"
              onPress={openCodeDialog}
              style={({ pressed }) => [styles.openButton, { borderColor, opacity: pressed ? 0.72 : 1 }]}
            >
              <Text style={[styles.openButtonText, { color: foregroundColor }]}>Open File</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );

  return (
    <View style={[styles.root, { backgroundColor }]}>
      <SidebarSplitView
        appearance={syntaxTheme.appearance}
        content={content}
        sidebar={(
          <WorkspaceSidebar
            activePath={tabs.active}
            colors={workspaceColors}
            files={sidebarFiles}
            folders={sidebarFolders}
            onAddFile={workspace.chooseFiles}
            onAddFolder={workspace.chooseFolders}
            onError={reportError}
            onOpenFile={openFile}
          />
        )}
        sidebarCollapsed={!sidebarOpen}
        style={styles.root}
      />
    </View>
  );
}

export default CodeViewerWindow;

const styles = StyleSheet.create({
  empty: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    padding: 32,
  },
  hidden: {
    // Keep native editors in layout so Fabric preserves their document and undo state.
    ...StyleSheet.absoluteFillObject,
    opacity: 0,
  },
  error: {
    fontSize: 13,
    paddingHorizontal: 24,
    paddingVertical: 8,
    textAlign: "center",
  },
  list: {
    flex: 1,
  },
  openButton: {
    borderRadius: 6,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  openButtonText: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  root: {
    flex: 1,
  },
});
