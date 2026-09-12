import { createDocumentTransitionGuard, openSelectedDocumentPath } from "@legend-apps/document-app";
import { addAppExitListener, completeAppExit } from "@legend-apps/app-exit";
import { addWindowCloseRequestedListener, closeWindow } from "@legend-apps/window-manager";
import { addNativeMenuActionListener, updateMenuItems } from "@legend-apps/native-menu";
import { noteRecentDocument } from "@legend-apps/recent-documents";
import { SourceDocumentEditor, type SourceDocumentEditorHandle } from "@legend-apps/source-editor";
import { getLegendDisplayTheme } from "@legend-apps/theme";
import { useValue } from "@legendapp/state/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { codeFileTypes, codeMenuOwnerId, codeViewerWindowIdentifier } from "./appConstants";
import { getCodeLanguage, getLaunchCodeFile, isCodePath } from "./codeFiles";
import {
  useCodeFontFamilySetting,
  useCodeFontSizeSetting,
  useCodeSyntaxHighlightingEnabledSetting,
  useCodeSyntaxTheme,
  useCodeSyntaxThemeSetting,
} from "./codeSettings";
import { codeViewerFileRequest$ } from "./codeViewerRequests";
import { setCodeViewerWindowOptions } from "./codeWindows";

type CodeViewerWindowProps = {
  launchArguments?: string[];
};

export function CodeViewerWindow({ launchArguments }: CodeViewerWindowProps) {
  const fontFamily = useCodeFontFamilySetting();
  const fontSize = useCodeFontSizeSetting();
  const selectedSyntaxTheme = useCodeSyntaxThemeSetting();
  const syntaxHighlightingEnabled = useCodeSyntaxHighlightingEnabledSetting();
  const syntaxTheme = useCodeSyntaxTheme();
  const displayTheme = getLegendDisplayTheme(syntaxTheme.appearance);
  const launchFile = useMemo(() => getLaunchCodeFile(launchArguments), [launchArguments]);
  const [filePath, setFilePath] = useState<string | null>(launchFile);
  const [documentKey, setDocumentKey] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [documentPath, setDocumentPath] = useState<string | null>(launchFile);
  const editor = useRef<SourceDocumentEditorHandle>(null);
  const [automaticPairs, setAutomaticPairs] = useState(true);
  useEffect(() => { updateMenuItems(codeMenuOwnerId, [{ id: "automaticPairs", checked: automaticPairs }]); }, [automaticPairs]);
  const [transition] = useState(createDocumentTransitionGuard);
  const fileRequest = useValue(codeViewerFileRequest$);
  const loadedLaunchFileRef = useRef(launchFile);
  const loadedFileRequestVersionRef = useRef(0);
  const backgroundColor = syntaxTheme.background;
  const foregroundColor = syntaxTheme.foreground;
  const mutedColor = displayTheme.colors.muted;
  const borderColor = displayTheme.colors.border;

  const openFile = useCallback(async (path: string) => {
    if (path === documentPath) return;
    try {
      await transition(() => editor.current?.command("confirmClose") ?? Promise.resolve(true), () => {
        setError(null); setFilePath(path); setDocumentPath(path); setDocumentKey((key) => key + 1);
      });
    } catch (cause) { setError(String(cause)); }
  }, [documentPath, transition]);

  useEffect(() => {
    const prepare = () => editor.current?.command("confirmClose") ?? Promise.resolve(true);
    const close = addWindowCloseRequestedListener((event) => {
      if (event.identifier === codeViewerWindowIdentifier) void transition(prepare, async () => { await closeWindow(codeViewerWindowIdentifier); }).catch((cause) => setError(String(cause)));
    });
    const quit = addAppExitListener((event) => {
      if (event.reason === "requested") void transition(prepare, () => {}).then(completeAppExit, (cause) => { setError(String(cause)); completeAppExit(false); });
    });
    const menu = addNativeMenuActionListener((event) => {
      if (event.ownerId === codeMenuOwnerId && event.itemId === "automaticPairs") setAutomaticPairs((value) => !value);
      if (event.ownerId === codeMenuOwnerId && ["save", "saveAs", "find", "goToLine", "indent", "outdent", "duplicateLine", "moveLineUp", "moveLineDown", "toggleComment"].includes(event.itemId))
        void editor.current?.command(event.itemId).then((completed) => { if (completed) setError(null); }).catch((cause) => setError(String(cause)));
    });
    return () => { close.remove(); quit.remove(); menu.remove(); };
  }, [transition]);

  const openCodeDialog = useCallback(async () => {
    try {
      const path = await openSelectedDocumentPath({
        allowedFileTypes: codeFileTypes,
        invalidSelectionMessage: "Choose a text file.",
        isDocumentPath: isCodePath,
      });
      if (path) openFile(path);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    }
  }, [openFile]);

  useEffect(() => {
    if (launchFile && loadedLaunchFileRef.current !== launchFile) {
      loadedLaunchFileRef.current = launchFile;
      openFile(launchFile);
    }
  }, [launchFile, openFile]);

  useEffect(() => {
    if (fileRequest.path && loadedFileRequestVersionRef.current !== fileRequest.version) {
      loadedFileRequestVersionRef.current = fileRequest.version;
      loadedLaunchFileRef.current = fileRequest.path;
      openFile(fileRequest.path);
    }
  }, [fileRequest.path, fileRequest.version, openFile]);

  // The native editor owns its buffer. Do not reload on settings changes or
  // filesystem notifications: that would discard unsaved edits and undo history.
  const onEditorLoad = useCallback(() => {
    if (filePath) noteRecentDocument(filePath);
  }, [filePath]);

  useEffect(() => {
    setCodeViewerWindowOptions({
      appearance: syntaxTheme.appearance,
      backgroundColor: syntaxTheme.background,
      filePath: documentPath,
    }).catch((cause: unknown) => {
      console.error(cause instanceof Error ? cause.message : String(cause));
    });
  }, [documentPath, syntaxTheme.appearance, syntaxTheme.background]);

  return (
    <View style={[styles.root, { backgroundColor }]}>
      {error ? <Text style={[styles.error, { color: displayTheme.colors.danger }]}>{error}</Text> : null}
      <View style={styles.list}>
        {filePath ? (
          <SourceDocumentEditor
            ref={editor}
            automaticPairs={automaticPairs}
            onDocumentState={(state) => {
              if (state.path && state.path !== documentPath) { setDocumentPath(state.path); noteRecentDocument(state.path); }
            }}
            key={documentKey}
            filePath={filePath}
            fontFamily={fontFamily}
            fontSize={fontSize}
            foreground={foregroundColor}
            language={getCodeLanguage(documentPath ?? filePath)}
            syntaxTheme={selectedSyntaxTheme}
            syntaxHighlightingEnabled={syntaxHighlightingEnabled}
            syntaxHighlightingMode="background"
            syntaxBackend="tree-sitter"
            onLoad={onEditorLoad}
          />
        ) : (
          <View style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: foregroundColor }]}>No file open</Text>
            <Text style={[styles.emptyText, { color: mutedColor }]}>Open any UTF-8 text file to edit it.</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Open File"
              onPress={openCodeDialog}
              style={({ pressed }) => [styles.openButton, { borderColor, opacity: pressed ? 0.72 : 1 }]}
            >
              <Text style={[styles.openButtonText, { color: foregroundColor }]}>Open File</Text>
            </Pressable>
            <Text style={[styles.emptyText, { color: mutedColor }]}>
              Save with ⌘S · Save As with ⇧⌘S
            </Text>
          </View>
        )}
      </View>
    </View>
  );
}

export default CodeViewerWindow;

const styles = StyleSheet.create({
  empty: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    gap: 8,
    justifyContent: "center",
    padding: 32,
  },
  emptyText: {
    fontSize: 13,
    lineHeight: 18,
    textAlign: "center",
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "600",
    lineHeight: 24,
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
    marginVertical: 8,
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
