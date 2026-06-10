import {
  MarkdownDocument,
  nativeMarkdownDocumentAdapter,
  type MarkdownDocumentCommands,
  type MarkdownDocumentAdapter,
  type MarkdownSelectionAnchor,
} from "@legend-desktop/markdown-document";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { MarkdownFloatingSurface } from "./MarkdownFloatingSurface";
import { MarkdownFormattingToolbar } from "./MarkdownFormattingToolbar";

const smokeFilename = "e2e-editor-smoke.md";
const softWrapSelectionParagraph = "Smoke first paragraphasd flaskdjf alskdjf alskdjf alksdfj alksdfj alksdfj alksdjf alksdjf alksdjf alkdfj alksdfj alsdjf alsdjf laksdjf alsdjf";
const smokeMarkdown = `${softWrapSelectionParagraph}\n\n\`\`\`ts\nconst selected = true;\n\`\`\`\n\nSmoke third paragraph`;

export function MarkdownE2EEditorSmoke({
  autoSelectBlocks = false,
}: {
  autoSelectBlocks?: boolean;
}) {
  const commandsRef = useRef<MarkdownDocumentCommands | null>(null);
  const [status, setStatus] = useState<"dirty" | "ready" | "selected">("ready");
  const [selectionAnchor, setSelectionAnchor] = useState<MarkdownSelectionAnchor | null>(null);
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
  const renderSelectionToolbar = useCallback(
    (anchor: MarkdownSelectionAnchor) => (
      <MarkdownFloatingSurface anchor={anchor} coordinateSpace="content">
        <MarkdownFormattingToolbar commandsRef={commandsRef} floating />
      </MarkdownFloatingSurface>
    ),
    [],
  );
  useEffect(() => {
    if (!autoSelectBlocks) {
      return undefined;
    }

    let selectTimer: ReturnType<typeof setTimeout> | undefined;
    const focusTimer = setTimeout(() => {
      commandsRef.current?.focusNextBlock();
      selectTimer = setTimeout(() => {
        const didSelect = commandsRef.current?.extendBlockSelectionUp() ?? false;
        if (didSelect) {
          setStatus("selected");
        }
      }, 300);
    }, 500);

    return () => {
      clearTimeout(focusTimer);
      if (selectTimer) {
        clearTimeout(selectTimer);
      }
    };
  }, [autoSelectBlocks]);

  const handleSelectionAnchorChange = useCallback((anchor: MarkdownSelectionAnchor | null) => {
    setSelectionAnchor(anchor);
  }, []);

  return (
    <View style={styles.root}>
      <Text style={styles.status}>
        {status === "dirty"
          ? "E2E UI smoke dirty"
          : status === "selected"
            ? "E2E selection smoke selected"
            : "E2E UI smoke ready"}
      </Text>
      <View style={styles.documentFrame}>
        <MarkdownDocument
          adapter={adapter}
          autoFocusFirstBlock={autoSelectBlocks}
          commandsRef={commandsRef}
          filename={smokeFilename}
          onDirtyChange={handleDirtyChange}
          onSelectionAnchorChange={handleSelectionAnchorChange}
          renderSelectionToolbar={renderSelectionToolbar}
          selectionToolbarAnchor={selectionAnchor}
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
