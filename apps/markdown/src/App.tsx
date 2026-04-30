import { openFileDialog } from "@legend-desktop/file-dialog";
import {
  addNativeMenuActionListener,
  clearMenus,
  configureMenus,
  updateMenuItems,
} from "@legend-desktop/native-menu";
import { closeFrontmostWindow } from "@legend-desktop/window-manager";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

const menuOwnerId = "legend-markdown";
const markdownFileTypes = ["md", "markdown", "mdown", "mkd", "mdx"];
const commandModifier = 1 << 20;
const shiftModifier = 1 << 17;

type OpenReason = "startup" | "menu";

function isMarkdownPath(path: string) {
  const extension = path.split(".").pop()?.toLowerCase();
  return extension !== undefined && markdownFileTypes.includes(extension);
}

function getLaunchMarkdownFile() {
  const argv = typeof process !== "undefined" && Array.isArray(process.argv) ? process.argv : [];
  return argv.find(isMarkdownPath) ?? null;
}

export function App() {
  const [filename, setFilename] = useState<string | null>(null);
  const [status, setStatus] = useState("Opening markdown file...");
  const [lastError, setLastError] = useState<string | null>(null);
  const openDialogInFlight = useRef(false);
  const hasDocumentRef = useRef(false);
  const startupHandledRef = useRef(false);

  const hasDocument = filename !== null;

  useEffect(() => {
    hasDocumentRef.current = hasDocument;
  }, [hasDocument]);

  const openSelectedFile = useCallback((path: string) => {
    setFilename(path);
    setLastError(null);
    setStatus(`Selected ${path}`);
  }, []);

  const openMarkdownDialog = useCallback(
    async (reason: OpenReason) => {
      if (openDialogInFlight.current) {
        return;
      }

      openDialogInFlight.current = true;
      setStatus("Choose a markdown file.");

      try {
        const paths = await openFileDialog({
          allowedFileTypes: markdownFileTypes,
        });
        const path = paths?.find(isMarkdownPath) ?? null;

        if (path) {
          openSelectedFile(path);
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

    const launchFile = getLaunchMarkdownFile();
    if (launchFile) {
      openSelectedFile(launchFile);
    } else {
      void openMarkdownDialog("startup");
    }
  }, [openMarkdownDialog, openSelectedFile]);

  useEffect(() => {
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
      }
    });

    return () => {
      subscription.remove();
      clearMenus(menuOwnerId);
    };
  }, [openMarkdownDialog]);

  useEffect(() => {
    updateMenuItems(menuOwnerId, [
      { id: "save", enabled: false },
      { id: "undo", enabled: false },
      { id: "redo", enabled: false },
      { id: "bold", enabled: false },
      { id: "italic", enabled: false },
      { id: "link", enabled: false },
    ]);
  }, [hasDocument]);

  const displayName = useMemo(() => filename?.split("/").pop() ?? "No document open", [filename]);

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Legend Markdown</Text>
      <Text style={styles.filename}>{displayName}</Text>
      <Text style={styles.status}>{status}</Text>
      {lastError ? <Text style={styles.error}>{lastError}</Text> : null}
    </View>
  );
}

export default App;

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    backgroundColor: "#f5f6f8",
    flex: 1,
    justifyContent: "center",
    padding: 32,
  },
  error: {
    color: "#b42318",
    fontSize: 13,
    marginTop: 12,
    maxWidth: 720,
    textAlign: "center",
  },
  filename: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "600",
    marginTop: 16,
  },
  status: {
    color: "#4b5563",
    fontSize: 14,
    marginTop: 8,
    textAlign: "center",
  },
  title: {
    color: "#111827",
    fontSize: 24,
    fontWeight: "700",
  },
});
