import { addAppExitListener, completeAppExit } from "@legend-desktop/app-exit";
import { openFileDialog, saveFileDialog } from "@legend-desktop/file-dialog";
import {
  MarkdownDocument,
  nativeMarkdownDocumentAdapter,
  type MarkdownDocumentCommands,
  type MarkdownSaveState,
} from "@legend-desktop/markdown-document";
import {
  addNativeMenuActionListener,
  clearMenus,
  configureMenus,
  updateMenuItems,
} from "@legend-desktop/native-menu";
import { addRecentDocumentOpenListener, noteRecentDocument } from "@legend-desktop/recent-documents";
import { getLegendTheme } from "@legend-desktop/theme";
import { openWindow, setMainWindowOptions, WindowStyleMask } from "@legend-desktop/window-manager";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppRegistry, StyleSheet, Text, View } from "react-native";
import { useResolveClassNames, useUniwind } from "uniwind";
import { addRecentMarkdownFile, getMarkdownFileTitle, getRecentMarkdownFiles } from "./appMetadata";
import {
  applyMarkdownThemeSetting,
  getLastMarkdownDocumentPath,
  getMarkdownStartupBehaviorSetting,
  setLastMarkdownDocumentPath,
} from "./markdownSettings";
import { SettingsWindow } from "./SettingsWindow";
import { untitledFilename, untitledMarkdownAdapter } from "./untitledMarkdownAdapter";

const menuOwnerId = "legend-markdown";
const settingsWindowModuleName = "MarkdownSettingsWindow";
const settingsWindowIdentifier = "markdown-settings";
const markdownFileTypes = ["md", "markdown", "mdown", "mkd", "mdx"];
const commandModifier = 1 << 20;
const shiftModifier = 1 << 17;

AppRegistry.registerComponent(settingsWindowModuleName, () => SettingsWindow);

type OpenSource = "startup" | "dialog" | "recent";
type DocumentSource = "file" | "untitled";

type MarkdownAppProps = {
  launchArguments?: string[];
};

function isMarkdownPath(path: string) {
  const extension = path.split(".").pop()?.toLowerCase();
  return extension !== undefined && markdownFileTypes.includes(extension);
}

function getLaunchMarkdownFile(launchArguments: string[] | undefined) {
  const argv = typeof process !== "undefined" && Array.isArray(process.argv) ? process.argv : [];
  return launchArguments?.find(isMarkdownPath) ?? argv.find(isMarkdownPath) ?? null;
}

function getDirectory(path: string) {
  const separatorIndex = path.lastIndexOf("/");
  return separatorIndex > 0 ? path.slice(0, separatorIndex) : undefined;
}

function getFilename(path: string) {
  const separatorIndex = path.lastIndexOf("/");
  return separatorIndex >= 0 ? path.slice(separatorIndex + 1) : path;
}

export function App({ launchArguments }: MarkdownAppProps) {
  const [filename, setFilename] = useState<string | null>(null);
  const [lastError, setLastError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [saveState, setSaveState] = useState<MarkdownSaveState>("idle");
  const [documentSource, setDocumentSource] = useState<DocumentSource>("untitled");
  const documentCommandsRef = useRef<MarkdownDocumentCommands | null>(null);
  const openDialogInFlight = useRef(false);
  const lastOpenSourceRef = useRef<OpenSource>("startup");
  const startupHandledRef = useRef(false);

  const hasDocument = filename !== null;
  const isUntitledDocument = documentSource === "untitled";
  const activeAdapter = isUntitledDocument ? untitledMarkdownAdapter : nativeMarkdownDocumentAdapter;
  const { theme: uniwindTheme } = useUniwind();
  const theme = getLegendTheme(uniwindTheme);
  const backgroundStyle = useResolveClassNames("bg-background");

  useEffect(() => {
    applyMarkdownThemeSetting();
  }, []);

  const openSelectedFile = useCallback((path: string, source: OpenSource) => {
    lastOpenSourceRef.current = source;
    setDocumentSource("file");
    setFilename(path);
    setIsDirty(false);
    setSaveState("idle");
    setLastError(null);
    addRecentMarkdownFile(path);
    setLastMarkdownDocumentPath(path);
    noteRecentDocument(path);
  }, []);

  const openUntitledDocument = useCallback(() => {
    lastOpenSourceRef.current = "startup";
    setDocumentSource("untitled");
    setFilename(untitledFilename);
    setIsDirty(false);
    setSaveState("idle");
    setLastError(null);
  }, []);

  const completeSaveAs = useCallback((path: string) => {
    setDocumentSource("file");
    setFilename(path);
    setIsDirty(false);
    setSaveState("idle");
    setLastError(null);
    addRecentMarkdownFile(path);
    setLastMarkdownDocumentPath(path);
    noteRecentDocument(path);
  }, []);

  const saveCurrentDocumentAs = useCallback(async () => {
    if (!filename || !documentCommandsRef.current) {
      return false;
    }

    try {
      const path = await saveFileDialog({
        allowedFileTypes: markdownFileTypes,
        defaultName: isUntitledDocument ? untitledFilename : getFilename(filename),
        directory: isUntitledDocument ? undefined : getDirectory(filename),
      });

      if (!path) {
        return false;
      }

      await documentCommandsRef.current.saveAs(path);
      completeSaveAs(path);
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLastError(message);
      return false;
    }
  }, [completeSaveAs, filename, isUntitledDocument]);

  const saveCurrentDocument = useCallback(async () => {
    if (!documentCommandsRef.current) {
      return false;
    }

    if (isUntitledDocument) {
      return saveCurrentDocumentAs();
    }

    try {
      await documentCommandsRef.current.save();
      return true;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setLastError(message);
      return false;
    }
  }, [isUntitledDocument, saveCurrentDocumentAs]);

  const flushCurrentDocumentBeforeTransition = useCallback(async () => {
    if (!hasDocument || !isDirty) {
      return true;
    }

    return saveCurrentDocument();
  }, [hasDocument, isDirty, saveCurrentDocument]);

  const openMarkdownDialog = useCallback(
    async () => {
      if (openDialogInFlight.current) {
        return;
      }

      openDialogInFlight.current = true;

      try {
        const didFlush = await flushCurrentDocumentBeforeTransition();
        if (!didFlush) {
          return;
        }

        const paths = await openFileDialog();
        const path = paths?.find(isMarkdownPath) ?? null;

        if (path) {
          openSelectedFile(path, "dialog");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setLastError(message);
      } finally {
        openDialogInFlight.current = false;
      }
    },
    [flushCurrentDocumentBeforeTransition, openSelectedFile],
  );

  const openSettingsWindow = useCallback(() => {
    void openWindow({
      identifier: settingsWindowIdentifier,
      moduleName: settingsWindowModuleName,
      title: "Settings",
      windowStyle: {
        backgroundColor: theme.colors.windowBackground,
        hasToolbar: false,
        height: 560,
        mask: [
          WindowStyleMask.Titled,
          WindowStyleMask.Closable,
          WindowStyleMask.Resizable,
        ],
        minHeight: 420,
        minWidth: 560,
        titlebarAppearsTransparent: false,
        titlebarSeparatorStyle: "line",
        titleVisibility: "visible",
        width: 720,
      },
    });
  }, [theme.colors.windowBackground]);

  useEffect(() => {
    if (startupHandledRef.current) {
      return;
    }
    startupHandledRef.current = true;

    const launchFile = getLaunchMarkdownFile(launchArguments);
    if (launchFile) {
      openSelectedFile(launchFile, "startup");
    } else if (getMarkdownStartupBehaviorSetting() === "lastDocument") {
      const lastDocumentPath = getLastMarkdownDocumentPath()
        ?? getRecentMarkdownFiles().find((file) => isMarkdownPath(file.path))?.path
        ?? null;
      if (lastDocumentPath) {
        openSelectedFile(lastDocumentPath, "startup");
      } else {
        openUntitledDocument();
      }
    } else {
      openUntitledDocument();
    }
  }, [launchArguments, openSelectedFile, openUntitledDocument]);

  useEffect(() => {
    const subscription = addRecentDocumentOpenListener(({ path }) => {
      void (async () => {
        if (!isMarkdownPath(path)) {
          return;
        }

        const didFlush = await flushCurrentDocumentBeforeTransition();
        if (didFlush) {
          openSelectedFile(path, "recent");
        }
      })();
    });
    return () => {
      subscription.remove();
    };
  }, [flushCurrentDocumentBeforeTransition, openSelectedFile]);

  useEffect(() => {
    const subscription = addAppExitListener((event) => {
      if (event.reason !== "requested") {
        return;
      }

      void (async () => {
        try {
          const didFlush = await flushCurrentDocumentBeforeTransition();
          completeAppExit(didFlush);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          setLastError(message);
          completeAppExit(false);
        }
      })();
    });

    return () => {
      subscription.remove();
    };
  }, [flushCurrentDocumentBeforeTransition]);

  useEffect(() => {
    configureMenus(menuOwnerId, [
      {
        id: "file",
        title: "File",
        placement: { before: "Window" },
        items: [
          {
            id: "open",
            targetTitle: "Open...",
            enabled: true,
          },
          {
            id: "save",
            targetTitle: "Save...",
            enabled: false,
          },
          {
            id: "saveAs",
            title: "Save As...",
            enabled: false,
            shortcut: { key: "s", modifiers: commandModifier | shiftModifier },
          },
        ],
      },
      {
        id: "app",
        title: "Application",
        systemMenu: "app",
        items: [
          {
            id: "settings",
            targetTitles: ["Settings...", "Settings…", "Preferences...", "Preferences…"],
            enabled: true,
          },
        ],
      },
      {
        id: "edit",
        title: "Edit",
        placement: { before: "Window" },
        items: [
          {
            id: "undo",
            targetTitle: "Undo",
            enabled: false,
          },
          {
            id: "redo",
            targetTitle: "Redo",
            enabled: false,
          },
        ],
      },
      {
        id: "format",
        title: "Format",
        items: [
          {
            id: "bold",
            targetPath: ["Font", "Bold"],
            enabled: false,
          },
          {
            id: "italic",
            targetPath: ["Font", "Italic"],
            enabled: false,
          },
          {
            id: "underline",
            targetPath: ["Font", "Underline"],
            enabled: false,
          },
          { separator: true, id: "separator-markdown-formatting" },
          {
            id: "strikethrough",
            title: "Strikethrough",
            enabled: false,
          },
          {
            id: "spoiler",
            title: "Spoiler",
            enabled: false,
          },
          {
            id: "link",
            title: "Link...",
            enabled: false,
            shortcut: { key: "k", modifiers: commandModifier },
          },
        ],
      },
    ]);

    const subscription = addNativeMenuActionListener((action) => {
      if (action.ownerId !== menuOwnerId) {
        return;
      }
      if (action.itemId === "open") {
        void openMarkdownDialog();
      } else if (action.itemId === "settings") {
        openSettingsWindow();
      } else if (action.itemId === "save") {
        void saveCurrentDocument();
      } else if (action.itemId === "saveAs") {
        void saveCurrentDocumentAs();
      } else if (action.itemId === "undo") {
        documentCommandsRef.current?.undo();
      } else if (action.itemId === "redo") {
        documentCommandsRef.current?.redo();
      } else if (action.itemId === "bold") {
        documentCommandsRef.current?.toggleBold();
      } else if (action.itemId === "italic") {
        documentCommandsRef.current?.toggleItalic();
      } else if (action.itemId === "underline") {
        documentCommandsRef.current?.toggleUnderline();
      } else if (action.itemId === "strikethrough") {
        documentCommandsRef.current?.toggleStrikethrough();
      } else if (action.itemId === "spoiler") {
        documentCommandsRef.current?.toggleSpoiler();
      } else if (action.itemId === "link") {
        documentCommandsRef.current?.insertLink();
      }
    });

    return () => {
      subscription.remove();
      clearMenus(menuOwnerId);
    };
  }, [openMarkdownDialog, openSettingsWindow, saveCurrentDocument, saveCurrentDocumentAs]);

  useEffect(() => {
    updateMenuItems(menuOwnerId, [
      { id: "save", enabled: hasDocument && isDirty && saveState !== "saving" },
      { id: "saveAs", enabled: hasDocument && saveState !== "saving" },
      { id: "settings", enabled: true },
      { id: "undo", enabled: hasDocument },
      { id: "redo", enabled: hasDocument },
      { id: "bold", enabled: hasDocument },
      { id: "italic", enabled: hasDocument },
      { id: "underline", enabled: hasDocument },
      { id: "strikethrough", enabled: hasDocument },
      { id: "spoiler", enabled: hasDocument },
      { id: "link", enabled: hasDocument },
    ]);
  }, [hasDocument, isDirty, isUntitledDocument, saveState]);

  useEffect(() => {
    if (!filename) {
      return;
    }

    void setMainWindowOptions({
      representedURL: null,
      title: isUntitledDocument ? "Untitled" : getMarkdownFileTitle(filename),
      windowStyle: {
        backgroundColor: theme.colors.windowBackground,
        hasToolbar: false,
        mask: [
          WindowStyleMask.Titled,
          WindowStyleMask.Closable,
          WindowStyleMask.Miniaturizable,
          WindowStyleMask.Resizable,
        ],
        titlebarAppearsTransparent: true,
        titlebarSeparatorStyle: "none",
        titleVisibility: "visible",
      },
    });
  }, [filename, isUntitledDocument, theme.colors.windowBackground]);

  const handleDocumentError = useCallback(
    (error: Error) => {
      setLastError(error.message);
    },
    [],
  );

  if (!hasDocument || !filename) {
    return null;
  }

  return (
    <View className="flex-1 bg-background">
      {lastError ? <Text className="text-danger" style={styles.error}>{lastError}</Text> : null}
      <MarkdownDocument
        adapter={activeAdapter}
        autoFocusFirstBlock={isUntitledDocument}
        commandsRef={documentCommandsRef}
        filename={filename}
        onDirtyChange={setIsDirty}
        onError={handleDocumentError}
        onLoaded={() => {
          setLastError(null);
        }}
        onSaveStateChange={setSaveState}
        savePolicy={isUntitledDocument ? { autosave: false } : undefined}
        markdownLayout={theme.markdownLayout}
        markdownStyle={theme.markdownStyle}
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
