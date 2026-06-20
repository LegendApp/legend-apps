import {
  MarkdownDocument,
  type MarkdownSelectionAnchor,
} from "@legend-desktop/markdown-document";
import { getLegendDisplayTheme, getLegendDisplayThemeAppearance, getMarkdownLayoutTheme } from "@legend-desktop/theme";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import {
  MarkdownE2EEditorSmoke,
  type MarkdownE2EEditorSmokeVariant,
} from "./MarkdownE2EEditorSmoke";
import {
  getMarkdownE2ERunFromLaunchArguments,
  isMarkdownDocumentE2EScenario,
  type MarkdownE2ELaunchScenario,
  MarkdownE2ERunner,
} from "./MarkdownE2ERunner";
import { MarkdownFloatingSurface } from "./MarkdownFloatingSurface";
import { MarkdownFormattingToolbar } from "./MarkdownFormattingToolbar";
import {
  useMarkdownAppExit,
  useMarkdownStartupDocument,
  useMarkdownWindowCloseRequest,
  useRecentMarkdownDocumentOpener,
} from "./useMarkdownDocumentEvents";
import { useMarkdownDocumentSession } from "./useMarkdownDocumentSession";
import { useMarkdownKeyboardShortcuts } from "./useMarkdownKeyboardShortcuts";
import { useMarkdownMenus } from "./useMarkdownMenus";
import {
  useMarkdownEditorWindowOptions,
  useMarkdownSettingsWindow,
} from "./useMarkdownWindows";
import {
  applyMarkdownThemeSetting,
  useMarkdownAppearanceSettings,
  useMarkdownAutosaveSetting,
  useMarkdownDisplayThemeSetting,
  useMarkdownFormattingToolbarModeSetting,
  useMarkdownLayoutThemeSetting,
} from "./markdownSettings";
import {
  getMarkdownLayoutForAppearance,
  getMarkdownStyleForAppearance,
} from "./markdownAppearance";
import { getMarkdownMeasurementSignature } from "./markdownMeasurementSignature";
import { MarkdownLinkPopover } from "./MarkdownLinkPopover";
import { loadMarkdownUserThemesSync } from "./userThemes";
type MarkdownEditorWindowProps = {
  launchArguments?: string[];
};

function editorSmokeVariantForScenario(scenario: MarkdownE2ELaunchScenario): MarkdownE2EEditorSmokeVariant | null {
  if (scenario === "editor-selection-smoke") {
    return "selection";
  }
  if (scenario === "editor-soft-wrap-selection") {
    return "softWrap";
  }
  if (scenario === "editor-code-block-smoke") {
    return "codeBlock";
  }
  if (scenario === "editor-edit-navigation-smoke") {
    return "editNavigation";
  }
  if (scenario === "editor-navigation-smoke") {
    return "navigation";
  }
  if (scenario === "editor-theme-reflow-smoke") {
    return "themeReflow";
  }
  if (scenario === "editor-ui-smoke") {
    return "ui";
  }
  return null;
}

export function MarkdownEditorWindow({ launchArguments }: MarkdownEditorWindowProps) {
  loadMarkdownUserThemesSync();
  const session = useMarkdownDocumentSession();
  const [isLinkPopoverOpen, setIsLinkPopoverOpen] = useState(false);
  const hasObservedLayoutInputsRef = useRef(false);
  const e2eRun = getMarkdownE2ERunFromLaunchArguments(launchArguments);
  const displayThemeSetting = useMarkdownDisplayThemeSetting();
  const layoutThemeSetting = useMarkdownLayoutThemeSetting();
  const displayTheme = getLegendDisplayTheme(displayThemeSetting);
  const layoutTheme = getMarkdownLayoutTheme(layoutThemeSetting);
  const nativeWindowAppearance = getLegendDisplayThemeAppearance(displayThemeSetting);
  const backgroundStyle = useMemo(() => ({ backgroundColor: displayTheme.colors.background }), [displayTheme.colors.background]);
  const formattingToolbarMode = useMarkdownFormattingToolbarModeSetting();
  const autosave = useMarkdownAutosaveSetting();
  const appearanceSettings = useMarkdownAppearanceSettings();
  const markdownStyle = useMemo(
    () => getMarkdownStyleForAppearance(displayTheme, layoutTheme, appearanceSettings),
    [appearanceSettings, displayTheme, layoutTheme],
  );
  const markdownLayout = useMemo(
    () => getMarkdownLayoutForAppearance(layoutTheme, appearanceSettings),
    [appearanceSettings, layoutTheme],
  );
  const showUntitledPlaceholder = session.isUntitledDocument && !session.isDirty && !session.lastError;
  const measurementSignature = useMemo(
    () => getMarkdownMeasurementSignature(markdownLayout, markdownStyle),
    [markdownLayout, markdownStyle],
  );
  const openSettingsWindow = useMarkdownSettingsWindow({
    backgroundColor: displayTheme.colors.windowBackground,
    onError: session.handleError,
  });
  const insertLink = useCallback(() => {
    setIsLinkPopoverOpen(true);
  }, []);
  const applyLink = useCallback((url: string) => {
    session.documentCommandsRef.current?.insertLink({ url });
    setIsLinkPopoverOpen(false);
  }, [session.documentCommandsRef]);

  const renderSelectionToolbar = useCallback(
    (anchor: MarkdownSelectionAnchor) => (
      <MarkdownFloatingSurface anchor={anchor} coordinateSpace="content">
        <MarkdownFormattingToolbar commandsRef={session.documentCommandsRef} floating onInsertLink={insertLink} />
      </MarkdownFloatingSurface>
    ),
    [insertLink, session.documentCommandsRef],
  );

  useEffect(() => {
    if (hasObservedLayoutInputsRef.current) {
      session.documentCommandsRef.current?.invalidateLayoutMeasurements();
    } else {
      hasObservedLayoutInputsRef.current = true;
    }
  }, [measurementSignature, session.documentCommandsRef]);

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
    openSelectedFile: session.openSelectedFile,
  });

  useMarkdownAppExit({
    autosaveEnabled: autosave === "enabled",
    handleError: session.handleError,
    prepareCurrentDocumentForClose: session.prepareCurrentDocumentForClose,
  });

  useMarkdownWindowCloseRequest({
    autosaveEnabled: autosave === "enabled",
    handleError: session.handleError,
    prepareCurrentDocumentForClose: session.prepareCurrentDocumentForClose,
  });

  useMarkdownKeyboardShortcuts({
    documentCommandsRef: session.documentCommandsRef,
  });

  useMarkdownMenus({
    documentCommandsRef: session.documentCommandsRef,
    onError: session.handleError,
    onInsertLink: insertLink,
    onNewDocument: session.newMarkdownDocument,
    onOpenDocument: session.openMarkdownDialog,
    onOpenSettings: openSettingsWindow,
    onSaveDocument: session.saveCurrentDocument,
    onSaveDocumentAs: session.saveCurrentDocumentAs,
    sessionState$: session.sessionState$,
  });

  useMarkdownEditorWindowOptions({
    appearance: nativeWindowAppearance,
    backgroundColor: displayTheme.colors.windowBackground,
    onError: session.handleError,
    sessionState$: session.sessionState$,
  });

  if (e2eRun) {
    const editorSmokeVariant = editorSmokeVariantForScenario(e2eRun.scenario);
    if (editorSmokeVariant) {
      return (
        <MarkdownE2EEditorSmoke
          autoSelectBlocks={e2eRun.scenario === "editor-selection-smoke"}
          variant={editorSmokeVariant}
        />
      );
    }
    if (isMarkdownDocumentE2EScenario(e2eRun.scenario)) {
      return (
        <MarkdownE2ERunner
          blockCount={e2eRun.blockCount}
          scenario={e2eRun.scenario}
          seed={e2eRun.seed}
        />
      );
    }
  }

  if (!session.hasDocument || !session.filename) {
    return null;
  }

  return (
    <View style={[styles.root, backgroundStyle]}>
      {session.lastError ? (
        <Text style={[styles.error, { color: displayTheme.colors.danger }]}>{session.lastError}</Text>
      ) : null}
      {formattingToolbarMode === "top" ? (
        <MarkdownFormattingToolbar commandsRef={session.documentCommandsRef} onInsertLink={insertLink} />
      ) : null}
      <View style={styles.documentFrame}>
        {isLinkPopoverOpen ? (
          <MarkdownLinkPopover
            onCancel={() => setIsLinkPopoverOpen(false)}
            onSubmit={applyLink}
          />
        ) : null}
        {showUntitledPlaceholder ? (
          <View pointerEvents="none" style={styles.placeholder}>
            <Text style={[styles.placeholderTitle, { color: displayTheme.colors.foreground }]}>Untitled</Text>
            <Text style={[styles.placeholderText, { color: displayTheme.colors.muted }]}>Start writing</Text>
          </View>
        ) : null}
        <MarkdownDocument
          adapter={session.activeAdapter}
          autoFocusFirstBlock={session.isUntitledDocument}
          commandsRef={session.documentCommandsRef}
          filename={session.filename}
          markdownLayout={markdownLayout}
          markdownStyle={markdownStyle}
          onCommandStateChange={session.setCommandState}
          onDirtyChange={session.setIsDirty}
          onError={session.handleError}
          onLoadError={session.handleDocumentLoadError}
          onLoaded={session.handleDocumentLoaded}
          onSaveStateChange={session.setSaveState}
          renderSelectionToolbar={renderSelectionToolbar}
          savePolicy={{ autosave: !session.isUntitledDocument && autosave === "enabled" }}
          selectionToolbarEnabled={formattingToolbarMode === "selection"}
          style={[styles.document, backgroundStyle]}
          theme={displayTheme.markdownDocument}
        />
      </View>
      {formattingToolbarMode === "bottom" ? (
        <MarkdownFormattingToolbar
          commandsRef={session.documentCommandsRef}
          onInsertLink={insertLink}
          placement="bottom"
          style={styles.bottomToolbar}
        />
      ) : null}
    </View>
  );
}

export default MarkdownEditorWindow;

const styles = StyleSheet.create({
  document: {
    flex: 1,
  },
  documentFrame: {
    flex: 1,
    position: "relative",
  },
  bottomToolbar: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    zIndex: 1,
  },
  placeholder: {
    left: 40,
    position: "absolute",
    top: 48,
    zIndex: 1,
  },
  placeholderText: {
    fontSize: 14,
    lineHeight: 20,
  },
  placeholderTitle: {
    fontSize: 22,
    fontWeight: "600",
    lineHeight: 30,
  },
  error: {
    fontSize: 13,
    paddingHorizontal: 24,
    paddingVertical: 8,
    textAlign: "center",
  },
  root: {
    flex: 1,
    position: "relative",
  },
});
