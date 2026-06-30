import {
  MarkdownDocument,
  defaultMarkdownStyle,
  nativeMarkdownDocumentAdapter,
  type MarkdownDocumentCommands,
  type MarkdownDocumentAdapter,
  type MarkdownSelectionAnchor,
} from "@legend-desktop/markdown-document";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { MarkdownFloatingSurface } from "./MarkdownFloatingSurface";
import { MarkdownFormattingToolbar } from "./MarkdownFormattingToolbar";

export type MarkdownE2EEditorSmokeStatus = "dirty" | "passed" | "ready" | "selected";
export type MarkdownE2EEditorSmokeVariant =
  | "codeBlock"
  | "editNavigation"
  | "navigation"
  | "selection"
  | "softWrap"
  | "themeReflow"
  | "ui";

const smokeFilename = "e2e-editor-smoke.md";
const softWrapSelectionParagraph = "Smoke first paragraphasd flaskdjf alskdjf alskdjf alksdfj alksdfj alksdfj alksdjf alksdjf alksdjf alkdfj alksdfj alsdjf alsdjf laksdjf alsdjf";
const smokeMarkdown = `${softWrapSelectionParagraph}\n\n\`\`\`ts\nconst selected = true;\n\`\`\`\n\nSmoke third paragraph`;
const codeBlockSmokeMarkdown = "```ts\nconst selected = true;\n```\n\nSmoke paragraph after code block";
const editNavigationSmokeMarkdown = "Edit navigation first block\n\nEdit navigation second block\n\nEdit navigation third block";
const navigationSmokeMarkdown = Array.from({ length: 80 }, (_value, index) => `Navigation smoke block ${index + 1}`).join("\n\n");
const themeReflowSmokeMarkdown = [
  "# Theme Reflow Smoke",
  "",
  "Paragraph before the code block to catch layout shifts.",
  "",
  "```ts",
  "const theme = 'changed';",
  "const spacing = 'large';",
  "```",
  "",
  "Paragraph after the code block should stay close after reflow.",
].join("\n");

const smokeMarkdownByVariant = {
  codeBlock: codeBlockSmokeMarkdown,
  editNavigation: editNavigationSmokeMarkdown,
  navigation: navigationSmokeMarkdown,
  selection: smokeMarkdown,
  softWrap: smokeMarkdown,
  themeReflow: themeReflowSmokeMarkdown,
  ui: smokeMarkdown,
} satisfies Record<MarkdownE2EEditorSmokeVariant, string>;

const statusTextByVariant = {
  codeBlock: {
    dirty: "E2E code block smoke dirty",
    passed: "E2E code block smoke passed",
    ready: "E2E code block smoke ready",
    selected: "E2E code block smoke selected",
  },
  editNavigation: {
    dirty: "E2E edit navigation smoke dirty",
    passed: "E2E edit navigation smoke passed",
    ready: "E2E edit navigation smoke ready",
    selected: "E2E edit navigation smoke selected",
  },
  navigation: {
    dirty: "E2E navigation smoke dirty",
    passed: "E2E navigation smoke passed",
    ready: "E2E navigation smoke ready",
    selected: "E2E navigation smoke selected",
  },
  selection: {
    dirty: "E2E UI smoke dirty",
    passed: "E2E selection smoke passed",
    ready: "E2E UI smoke ready",
    selected: "E2E selection smoke selected",
  },
  softWrap: {
    dirty: "E2E soft-wrap selection dirty",
    passed: "E2E soft-wrap selection passed",
    ready: "E2E soft-wrap selection ready",
    selected: "E2E soft-wrap selection selected",
  },
  themeReflow: {
    dirty: "E2E theme reflow smoke dirty",
    passed: "E2E theme reflow smoke passed",
    ready: "E2E theme reflow smoke ready",
    selected: "E2E theme reflow smoke selected",
  },
  ui: {
    dirty: "E2E UI smoke dirty",
    passed: "E2E UI smoke passed",
    ready: "E2E UI smoke ready",
    selected: "E2E UI smoke selected",
  },
} satisfies Record<MarkdownE2EEditorSmokeVariant, Record<MarkdownE2EEditorSmokeStatus, string>>;

export function MarkdownE2EEditorSmoke({
  autoSelectBlocks = false,
  variant = "ui",
}: {
  autoSelectBlocks?: boolean;
  variant?: MarkdownE2EEditorSmokeVariant;
}) {
  const commandsRef = useRef<MarkdownDocumentCommands | null>(null);
  const editNavigationTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editNavigationDidRunRef = useRef(false);
  const [status, setStatus] = useState<MarkdownE2EEditorSmokeStatus>("ready");
  const [selectionAnchor, setSelectionAnchor] = useState<MarkdownSelectionAnchor | null>(null);
  const [styleMode, setStyleMode] = useState<"compact" | "expanded">("compact");
  const statusText = statusTextByVariant[variant][status];
  const markdownStyle = useMemo(() => (
    variant === "themeReflow"
      ? {
        ...defaultMarkdownStyle,
        codeBlock: {
          ...defaultMarkdownStyle.codeBlock,
          fontSize: styleMode === "compact" ? 13 : 18,
          lineHeight: styleMode === "compact" ? 21 : 30,
          padding: styleMode === "compact" ? 16 : 28,
        },
        h1: {
          ...defaultMarkdownStyle.h1,
          fontSize: styleMode === "compact" ? 30 : 44,
          lineHeight: styleMode === "compact" ? 38 : 54,
        },
        paragraph: {
          ...defaultMarkdownStyle.paragraph,
          fontSize: styleMode === "compact" ? 16 : 22,
          lineHeight: styleMode === "compact" ? 25 : 34,
        },
      }
      : undefined
  ), [styleMode, variant]);
  const adapter = useMemo<MarkdownDocumentAdapter>(() => ({
    applyTransaction: nativeMarkdownDocumentAdapter.applyTransaction,
    close: nativeMarkdownDocumentAdapter.close,
    getBlock: nativeMarkdownDocumentAdapter.getBlock,
    getBlockAtIndexSync: nativeMarkdownDocumentAdapter.getBlockAtIndexSync,
    getBlockIds: nativeMarkdownDocumentAdapter.getBlockIds,
    getBlockMetadata: nativeMarkdownDocumentAdapter.getBlockMetadata,
    getBlocks: nativeMarkdownDocumentAdapter.getBlocks,
    load(filename) {
      return nativeMarkdownDocumentAdapter.loadMarkdown(filename, smokeMarkdownByVariant[variant]);
    },
    save: nativeMarkdownDocumentAdapter.save,
    saveAs: nativeMarkdownDocumentAdapter.saveAs,
  }), [variant]);
  const handleDirtyChange = useCallback((isDirty: boolean) => {
    if (isDirty) {
      setStatus("dirty");
      if (variant === "editNavigation" && !editNavigationDidRunRef.current) {
        editNavigationDidRunRef.current = true;
        editNavigationTimerRef.current = setTimeout(() => {
          commandsRef.current?.focusNextBlock();
          editNavigationTimerRef.current = setTimeout(() => {
            setStatus("passed");
          }, 200);
        }, 0);
      }
    }
  }, [variant]);
  const renderSelectionToolbar = useCallback(
    (anchor: MarkdownSelectionAnchor) => (
      <MarkdownFloatingSurface anchor={anchor} coordinateSpace="content">
        <MarkdownFormattingToolbar commandsRef={commandsRef} floating />
      </MarkdownFloatingSurface>
    ),
    [],
  );
  useEffect(() => {
    return () => {
      if (editNavigationTimerRef.current) {
        clearTimeout(editNavigationTimerRef.current);
      }
    };
  }, []);

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

  useEffect(() => {
    if (variant !== "navigation") {
      return undefined;
    }

    const timers: ReturnType<typeof setTimeout>[] = [];
    const schedule = (callback: () => void, delay: number) => {
      const timer = setTimeout(callback, delay);
      timers.push(timer);
    };

    const runStep = (step: number) => {
      const commands = commandsRef.current;
      if (!commands) {
        schedule(() => runStep(step), 100);
      } else if (step === 0) {
        commands.focusFirstBlock();
        schedule(() => runStep(step + 1), 30);
      } else if (step <= 45) {
        commands.focusNextBlock();
        schedule(() => runStep(step + 1), 30);
      } else if (step <= 55) {
        commands.focusPreviousBlock();
        schedule(() => runStep(step + 1), 30);
      } else {
        setStatus("passed");
      }
    };

    schedule(() => runStep(0), 500);

    return () => {
      for (const timer of timers) {
        clearTimeout(timer);
      }
    };
  }, [variant]);

  useEffect(() => {
    if (variant !== "themeReflow") {
      return undefined;
    }

    const themeTimer = setTimeout(() => {
      setStyleMode("expanded");
      requestAnimationFrame(() => {
        commandsRef.current?.invalidateLayoutMeasurements();
        setStatus("passed");
      });
    }, 500);

    return () => {
      clearTimeout(themeTimer);
    };
  }, [variant]);

  const handleSelectionAnchorChange = useCallback((anchor: MarkdownSelectionAnchor | null) => {
    setSelectionAnchor(anchor);
  }, []);

  return (
    <View style={styles.root}>
      <Text style={styles.status}>
        {statusText}
      </Text>
      <View style={styles.documentFrame}>
        <MarkdownDocument
          adapter={adapter}
          autoFocusFirstBlock={autoSelectBlocks ||
            variant === "codeBlock" ||
            variant === "editNavigation" ||
            variant === "navigation"}
          commandsRef={commandsRef}
          filename={smokeFilename}
          markdownStyle={markdownStyle}
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
