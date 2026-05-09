import { MarkdownDocument, type MarkdownSelectionAnchor } from "@legend-desktop/markdown-document";
import { getLegendTheme } from "@legend-desktop/theme";
import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useResolveClassNames, useUniwind } from "uniwind";
import { MarkdownCommentBubble } from "./MarkdownCommentBubble";
import { MarkdownFloatingSurface } from "./MarkdownFloatingSurface";
import { MarkdownFormattingToolbar } from "./MarkdownFormattingToolbar";
import {
  useMarkdownAppExit,
  useMarkdownStartupDocument,
  useRecentMarkdownDocumentOpener,
} from "./useMarkdownDocumentEvents";
import { useMarkdownDocumentSession } from "./useMarkdownDocumentSession";
import { useMarkdownMenus } from "./useMarkdownMenus";
import {
  useMarkdownMainWindowOptions,
  useMarkdownSettingsWindow,
} from "./useMarkdownWindows";
import {
  applyMarkdownThemeSetting,
  getMarkdownFormattingToolbarModeSetting,
  subscribeToMarkdownSettings,
} from "./markdownSettings";
import { registerMarkdownWindows } from "./markdownWindows";

registerMarkdownWindows();

type MarkdownAppProps = {
  launchArguments?: string[];
};

export function App({ launchArguments }: MarkdownAppProps) {
  const session = useMarkdownDocumentSession();
  const { theme: uniwindTheme } = useUniwind();
  const theme = getLegendTheme(uniwindTheme);
  const backgroundStyle = useResolveClassNames("bg-background");
  const formattingToolbarMode = useSyncExternalStore(
    subscribeToMarkdownSettings,
    getMarkdownFormattingToolbarModeSetting,
    getMarkdownFormattingToolbarModeSetting,
  );
  const [selectionAnchor, setSelectionAnchor] = useState<MarkdownSelectionAnchor | null>(null);
  const [commentAnchor, setCommentAnchor] = useState<MarkdownSelectionAnchor | null>(null);
  const [commentDraft, setCommentDraft] = useState("");
  const openSettingsWindow = useMarkdownSettingsWindow({
    backgroundColor: theme.colors.windowBackground,
    onError: session.handleError,
  });

  const handleSelectionAnchorChange = useCallback((anchor: MarkdownSelectionAnchor | null) => {
    setSelectionAnchor(anchor);
    if (anchor?.kind === "textSelection" && (anchor.selectedLength ?? 0) > 1) {
      setCommentAnchor(anchor);
      setCommentDraft("");
    } else {
      setCommentAnchor(null);
      setCommentDraft("");
    }
  }, []);

  const closeCommentBubble = useCallback(() => {
    setCommentAnchor(null);
    setCommentDraft("");
  }, []);

  const renderCommentBubble = useCallback(
    (anchor: MarkdownSelectionAnchor) => (
      <MarkdownCommentBubble
        anchor={anchor}
        onCancel={closeCommentBubble}
        onChangeText={setCommentDraft}
        onSave={closeCommentBubble}
        value={commentDraft}
      />
    ),
    [closeCommentBubble, commentDraft],
  );

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

  useMarkdownMenus({
    documentCommandsRef: session.documentCommandsRef,
    hasDocument: session.hasDocument,
    isDirty: session.isDirty,
    onError: session.handleError,
    onOpenDocument: session.openMarkdownDialog,
    onOpenSettings: openSettingsWindow,
    onSaveDocument: session.saveCurrentDocument,
    onSaveDocumentAs: session.saveCurrentDocumentAs,
    saveState: session.saveState,
  });

  useMarkdownMainWindowOptions({
    backgroundColor: theme.colors.windowBackground,
    filename: session.filename,
    isUntitledDocument: session.isUntitledDocument,
    onError: session.handleError,
  });

  if (!session.hasDocument || !session.filename) {
    return null;
  }

  return (
    <View className="flex-1 bg-background">
      {session.lastError ? <Text className="text-danger" style={styles.error}>{session.lastError}</Text> : null}
      {formattingToolbarMode === "top" ? (
        <MarkdownFormattingToolbar commandsRef={session.documentCommandsRef} />
      ) : null}
      <View style={styles.documentFrame}>
        <MarkdownDocument
          adapter={session.activeAdapter}
          autoFocusFirstBlock={session.isUntitledDocument}
          commentAnchor={commentAnchor}
          commandsRef={session.documentCommandsRef}
          filename={session.filename}
          markdownLayout={theme.markdownLayout}
          markdownStyle={theme.markdownStyle}
          onDirtyChange={session.setIsDirty}
          onError={session.handleError}
          onLoaded={session.clearDocumentError}
          onSaveStateChange={session.setSaveState}
          onSelectionAnchorChange={handleSelectionAnchorChange}
          renderCommentBubble={renderCommentBubble}
          renderSelectionToolbar={renderSelectionToolbar}
          savePolicy={session.isUntitledDocument ? { autosave: false } : undefined}
          selectionToolbarAnchor={formattingToolbarMode === "selection" ? selectionAnchor : null}
          style={[styles.document, backgroundStyle]}
          theme={theme.markdownDocument}
        />
      </View>
    </View>
  );
}

export default App;

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
});
