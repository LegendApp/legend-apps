import { openFileDialog } from "@legend-desktop/file-dialog";
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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  getMarkdownFileTitle,
} from "./appMetadata";
import { untitledFilename, untitledMarkdownAdapter } from "./untitledMarkdownAdapter";

const menuOwnerId = "legend-markdown";
const markdownFileTypes = ["md", "markdown", "mdown", "mkd", "mdx"];
const commandModifier = 1 << 20;

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

export function App({ launchArguments }: MarkdownAppProps) {
  const [filename, setFilename] = useState<string | null>(null);
  const [status, setStatus] = useState("Creating untitled document...");
  const [lastError, setLastError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [saveState, setSaveState] = useState<MarkdownSaveState>("idle");
  const [documentSource, setDocumentSource] = useState<DocumentSource>("untitled");
  const documentCommandsRef = useRef<MarkdownDocumentCommands | null>(null);
  const openDialogInFlight = useRef(false);
  const lastOpenSourceRef = useRef<OpenSource>("startup");
  const startupHandledRef = useRef(false);

  const hasDocument = filename !== null;

  const openSelectedFile = useCallback((path: string, source: OpenSource) => {
    lastOpenSourceRef.current = source;
    setDocumentSource("file");
    setFilename(path);
    setIsDirty(false);
    setSaveState("idle");
    setLastError(null);
    setStatus(`Opening ${path}`);
    noteRecentDocument(path);
  }, []);

  const openUntitledDocument = useCallback(() => {
    lastOpenSourceRef.current = "startup";
    setDocumentSource("untitled");
    setFilename(untitledFilename);
    setIsDirty(false);
    setSaveState("idle");
    setLastError(null);
    setStatus("Untitled document.");
  }, []);

  const openMarkdownDialog = useCallback(
    async () => {
      if (openDialogInFlight.current) {
        return;
      }

      openDialogInFlight.current = true;
      setStatus("Choose a markdown file.");

      try {
        const paths = await openFileDialog();
        const path = paths?.find(isMarkdownPath) ?? null;

        if (path) {
          openSelectedFile(path, "dialog");
        } else {
          setStatus("File selection canceled.");
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setLastError(message);
        setStatus("Unable to open file.");
      } finally {
        openDialogInFlight.current = false;
      }
    },
    [openSelectedFile],
  );

  useEffect(() => {
    if (startupHandledRef.current) {
      return;
    }
    startupHandledRef.current = true;

    const launchFile = getLaunchMarkdownFile(launchArguments);
    if (launchFile) {
      openSelectedFile(launchFile, "startup");
    } else {
      openUntitledDocument();
    }
  }, [launchArguments, openSelectedFile, openUntitledDocument]);

  useEffect(() => {
    const subscription = addRecentDocumentOpenListener(({ path }) => {
      if (isMarkdownPath(path)) {
        openSelectedFile(path, "recent");
      }
    });
    return () => {
      subscription.remove();
    };
  }, [openSelectedFile]);

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
          { separator: true, id: "separator-formatting" },
          {
            id: "bold",
            title: "Bold",
            enabled: false,
            shortcut: { key: "b", modifiers: commandModifier },
          },
          {
            id: "italic",
            title: "Italic",
            enabled: false,
            shortcut: { key: "i", modifiers: commandModifier },
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
      } else if (action.itemId === "save") {
        documentCommandsRef.current?.save();
      } else if (action.itemId === "undo") {
        documentCommandsRef.current?.undo();
      } else if (action.itemId === "redo") {
        documentCommandsRef.current?.redo();
      } else if (action.itemId === "bold") {
        documentCommandsRef.current?.toggleBold();
      } else if (action.itemId === "italic") {
        documentCommandsRef.current?.toggleItalic();
      } else if (action.itemId === "link") {
        documentCommandsRef.current?.insertLink();
      }
    });

    return () => {
      subscription.remove();
      clearMenus(menuOwnerId);
    };
  }, [openMarkdownDialog, openSelectedFile]);

  const isUntitledDocument = documentSource === "untitled";
  const activeAdapter = isUntitledDocument ? untitledMarkdownAdapter : nativeMarkdownDocumentAdapter;

  useEffect(() => {
    updateMenuItems(menuOwnerId, [
      { id: "save", enabled: hasDocument && !isUntitledDocument && isDirty && saveState !== "saving" },
      { id: "undo", enabled: hasDocument },
      { id: "redo", enabled: hasDocument },
      { id: "bold", enabled: hasDocument },
      { id: "italic", enabled: hasDocument },
      { id: "link", enabled: hasDocument },
    ]);
  }, [hasDocument, isDirty, isUntitledDocument, saveState]);

  const displayName = useMemo(() => filename?.split("/").pop() ?? "No document open", [filename]);

  const handleDocumentError = useCallback(
    (error: Error) => {
      setLastError(error.message);
      setStatus("Unable to load document.");
    },
    [],
  );

  if (!hasDocument || !filename) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.statusBar}>
        <View style={styles.statusTitleGroup}>
          <Text numberOfLines={1} style={styles.filename}>
            {displayName}
          </Text>
          <Text numberOfLines={1} style={styles.status}>
            {status}
          </Text>
        </View>
        <Text style={styles.saveState}>{isDirty ? "Edited" : saveState === "saving" ? "Saving..." : "Saved"}</Text>
      </View>
      {lastError ? <Text style={styles.error}>{lastError}</Text> : null}
      <MarkdownDocument
        adapter={activeAdapter}
        autoFocusFirstBlock={isUntitledDocument}
        commandsRef={documentCommandsRef}
        filename={filename}
        onDirtyChange={setIsDirty}
        onError={handleDocumentError}
        onLoaded={(info) => {
          setLastError(null);
          setStatus(
            isUntitledDocument
              ? "Untitled document."
              : `Loaded ${info.blockCount} blocks from ${getMarkdownFileTitle(info.filename)}.`,
          );
        }}
        onSaveStateChange={setSaveState}
        savePolicy={isUntitledDocument ? { autosave: false } : undefined}
        style={styles.document}
      />
    </View>
  );
}

export default App;

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#f5f6f8",
    flex: 1,
  },
  document: {
    flex: 1,
  },
  error: {
    color: "#b42318",
    fontSize: 13,
    paddingHorizontal: 24,
    paddingVertical: 8,
    textAlign: "center",
  },
  filename: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "600",
  },
  saveState: {
    color: "#6b7280",
    fontSize: 13,
    minWidth: 64,
    textAlign: "right",
  },
  status: {
    color: "#4b5563",
    fontSize: 14,
    marginTop: 2,
  },
  statusBar: {
    alignItems: "center",
    backgroundColor: "#ffffff",
    borderBottomColor: "#d1d5db",
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: "row",
    gap: 16,
    minHeight: 58,
    paddingHorizontal: 24,
  },
  statusTitleGroup: {
    flex: 1,
    minWidth: 0,
  },
});
