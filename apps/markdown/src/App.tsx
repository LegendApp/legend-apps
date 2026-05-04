import { MarkdownDocument } from "@legend-desktop/markdown-document";
import { getLegendTheme } from "@legend-desktop/theme";
import { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import { useResolveClassNames, useUniwind } from "uniwind";
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
import { applyMarkdownThemeSetting } from "./markdownSettings";
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
  const openSettingsWindow = useMarkdownSettingsWindow({
    backgroundColor: theme.colors.windowBackground,
    onError: session.handleError,
  });

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
      <MarkdownDocument
        adapter={session.activeAdapter}
        autoFocusFirstBlock={session.isUntitledDocument}
        commandsRef={session.documentCommandsRef}
        filename={session.filename}
        markdownLayout={theme.markdownLayout}
        markdownStyle={theme.markdownStyle}
        onDirtyChange={session.setIsDirty}
        onError={session.handleError}
        onLoaded={session.clearDocumentError}
        onSaveStateChange={session.setSaveState}
        savePolicy={session.isUntitledDocument ? { autosave: false } : undefined}
        style={[styles.document, backgroundStyle]}
        theme={theme.markdownDocument}
      />
    </View>
  );
}

export default App;

const styles = StyleSheet.create({
  document: {
    flex: 1,
  },
  error: {
    fontSize: 13,
    paddingHorizontal: 24,
    paddingVertical: 8,
    textAlign: "center",
  },
});
