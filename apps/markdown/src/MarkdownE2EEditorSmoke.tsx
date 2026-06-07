import {
  MarkdownDocument,
  nativeMarkdownDocumentAdapter,
  type MarkdownDocumentAdapter,
} from "@legend-desktop/markdown-document";
import { useCallback, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

const smokeFilename = "e2e-editor-smoke.md";
const smokeMarkdown = "Smoke paragraph";

export function MarkdownE2EEditorSmoke() {
  const [status, setStatus] = useState<"ready" | "dirty">("ready");
  const adapter = useMemo<MarkdownDocumentAdapter>(() => ({
    applyTransaction: nativeMarkdownDocumentAdapter.applyTransaction,
    close: nativeMarkdownDocumentAdapter.close,
    getBlock: nativeMarkdownDocumentAdapter.getBlock,
    getBlocks: nativeMarkdownDocumentAdapter.getBlocks,
    load(filename) {
      return nativeMarkdownDocumentAdapter.loadMarkdown(filename, smokeMarkdown);
    },
    save: nativeMarkdownDocumentAdapter.save,
    saveAs: nativeMarkdownDocumentAdapter.saveAs,
  }), []);
  const handleDirtyChange = useCallback((isDirty: boolean) => {
    if (isDirty) {
      setStatus("dirty");
    }
  }, []);

  return (
    <View style={styles.root}>
      <Text style={styles.status}>
        {status === "dirty" ? "E2E UI smoke dirty" : "E2E UI smoke ready"}
      </Text>
      <View style={styles.documentFrame}>
        <MarkdownDocument
          adapter={adapter}
          autoFocusFirstBlock
          filename={smokeFilename}
          onDirtyChange={handleDirtyChange}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  documentFrame: {
    alignSelf: "stretch",
    flex: 1,
    marginTop: 16,
  },
  root: {
    backgroundColor: "#f9fafb",
    flex: 1,
    padding: 24,
  },
  status: {
    color: "#111827",
    fontSize: 16,
    fontWeight: "600",
  },
});
