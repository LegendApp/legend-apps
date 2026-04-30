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
import { closeFrontmostWindow } from "@legend-desktop/window-manager";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  addRecentMarkdownFile,
  getMarkdownFileTitle,
  getRecentMarkdownFiles,
  markdownAppMetadata$,
  removeRecentMarkdownFile,
  type RecentMarkdownFile,
} from "./appMetadata";

const menuOwnerId = "legend-markdown";
const markdownFileTypes = ["md", "markdown", "mdown", "mkd", "mdx"];
const commandModifier = 1 << 20;
const shiftModifier = 1 << 17;

type OpenReason = "startup" | "menu";
type OpenSource = "startup" | "dialog" | "recent";

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
  const [status, setStatus] = useState("Opening markdown file...");
  const [lastError, setLastError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);
  const [saveState, setSaveState] = useState<MarkdownSaveState>("idle");
  const [recentFiles, setRecentFiles] = useState<RecentMarkdownFile[]>(() => getRecentMarkdownFiles());
  const documentCommandsRef = useRef<MarkdownDocumentCommands | null>(null);
  const openDialogInFlight = useRef(false);
  const hasDocumentRef = useRef(false);
  const lastOpenSourceRef = useRef<OpenSource>("startup");
  const startupHandledRef = useRef(false);

  const hasDocument = filename !== null;

  useEffect(() => {
    hasDocumentRef.current = hasDocument;
  }, [hasDocument]);

  useEffect(() => {
    return markdownAppMetadata$.recentFiles.onChange(({ value }) => {
      setRecentFiles(value ?? []);
    });
  }, []);

  const openSelectedFile = useCallback((path: string, source: OpenSource) => {
    lastOpenSourceRef.current = source;
    setFilename(path);
    setIsDirty(false);
    setSaveState("idle");
    setLastError(null);
    setStatus(`Opening ${path}`);
    addRecentMarkdownFile(path);
  }, []);

  const openMarkdownDialog = useCallback(
    async (reason: OpenReason) => {
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
          if (reason === "startup" && !hasDocumentRef.current) {
            void closeFrontmostWindow();
          }
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setLastError(message);
        setStatus("Unable to open file.");
        if (reason === "startup") {
          setTimeout(() => {
            void openMarkdownDialog("startup");
          }, 0);
        }
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
      void openMarkdownDialog("startup");
    }
  }, [launchArguments, openMarkdownDialog, openSelectedFile]);

  useEffect(() => {
    const recentItems = recentFiles.flatMap((file, index) => {
      const items = [
        {
          id: `recent-${index}`,
          title: file.title,
          enabled: true,
          payload: { path: file.path },
        },
      ];
      return items;
    });

    configureMenus(menuOwnerId, [
      {
        id: "file",
        title: "File",
        placement: { before: "Window" },
        items: [
          {
            id: "open",
            title: "Open...",
            enabled: true,
            shortcut: { key: "o", modifiers: commandModifier },
          },
          {
            id: "save",
            title: "Save",
            enabled: false,
            shortcut: { key: "s", modifiers: commandModifier },
          },
          ...(recentItems.length > 0
            ? [
                { separator: true, id: "separator-recent" },
                ...recentItems,
              ]
            : []),
        ],
      },
      {
        id: "edit",
        title: "Edit",
        placement: { before: "Window" },
        items: [
          {
            id: "undo",
            title: "Undo",
            enabled: false,
            shortcut: { key: "z", modifiers: commandModifier },
          },
          {
            id: "redo",
            title: "Redo",
            enabled: false,
            shortcut: { key: "z", modifiers: commandModifier | shiftModifier },
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
        void openMarkdownDialog("menu");
      } else if (action.itemId === "save") {
        documentCommandsRef.current?.save();
      } else if (action.itemId.startsWith("recent-")) {
        const path = typeof action.payload?.path === "string" ? action.payload.path : null;
        if (path) {
          openSelectedFile(path, "recent");
        }
      }
    });

    return () => {
      subscription.remove();
      clearMenus(menuOwnerId);
    };
  }, [openMarkdownDialog, openSelectedFile, recentFiles]);

  useEffect(() => {
    updateMenuItems(menuOwnerId, [
      { id: "save", enabled: hasDocument && isDirty && saveState !== "saving" },
      { id: "undo", enabled: false },
      { id: "redo", enabled: false },
      { id: "bold", enabled: false },
      { id: "italic", enabled: false },
      { id: "link", enabled: false },
    ]);
  }, [hasDocument, isDirty, saveState]);

  const displayName = useMemo(() => filename?.split("/").pop() ?? "No document open", [filename]);

  const handleDocumentError = useCallback(
    (error: Error) => {
      setLastError(error.message);
      setStatus("Unable to load document.");
      if (filename && lastOpenSourceRef.current === "recent") {
        removeRecentMarkdownFile(filename);
      }
    },
    [filename],
  );

  return (
    <View style={styles.container}>
      {hasDocument && filename ? (
        <>
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
            adapter={nativeMarkdownDocumentAdapter}
            commandsRef={documentCommandsRef}
            filename={filename}
            onDirtyChange={setIsDirty}
            onError={handleDocumentError}
            onLoaded={(info) => {
              setLastError(null);
              setStatus(`Loaded ${info.blockCount} blocks from ${getMarkdownFileTitle(info.filename)}.`);
            }}
            onSaveStateChange={setSaveState}
            style={styles.document}
          />
        </>
      ) : (
        <View style={styles.emptyState}>
          <Text style={styles.title}>Legend Markdown</Text>
          <Text style={styles.filename}>{displayName}</Text>
          <Text style={styles.status}>{status}</Text>
          {lastError ? <Text style={styles.error}>{lastError}</Text> : null}
        </View>
      )}
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
  emptyState: {
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
    padding: 32,
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
  title: {
    color: "#111827",
    fontSize: 24,
    fontWeight: "700",
  },
});
