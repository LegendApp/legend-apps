import { act, render } from "@testing-library/react-native";
import { watchFiles } from "@legend-desktop/file-system-watcher";
import { observable } from "@legendapp/state";
import React from "react";
import { Text } from "react-native";
import { MarkdownEditorWindow } from "../MarkdownEditorWindow";
import { useMarkdownAppExit, useMarkdownWindowCloseRequest } from "../useMarkdownDocumentEvents";
import type { MarkdownDocumentSessionState } from "../useMarkdownDocumentSession";

const mockUseMarkdownAppExit = useMarkdownAppExit as jest.MockedFunction<typeof useMarkdownAppExit>;
const mockUseMarkdownWindowCloseRequest = useMarkdownWindowCloseRequest as jest.MockedFunction<typeof useMarkdownWindowCloseRequest>;
const mockWatchFiles = watchFiles as jest.MockedFunction<typeof watchFiles>;

const mockMarkdownE2EEditorSmoke = jest.fn((props: { autoSelectBlocks?: boolean; variant?: string }) => (
  <Text>{`editor-smoke:${props.variant}:${props.autoSelectBlocks ? "auto" : "manual"}`}</Text>
));
const mockMarkdownE2ERunner = jest.fn((props: { scenario: string }) => (
  <Text>{`document-runner:${props.scenario}`}</Text>
));
const mockMarkdownDocument = jest.fn((_props: unknown) => {
  const React = require("react");
  const { Text } = require("react-native");
  return React.createElement(Text, null, "markdown-document");
});
const mockInvalidateLayoutMeasurements = jest.fn();
const mockReloadDocument = jest.fn();
const mockSessionState$ = observable<MarkdownDocumentSessionState>({
  commandState: { canRedo: false, canUndo: false },
  documentSource: "untitled",
  filename: "test.md",
  isDirty: false,
  lastError: null,
  saveState: "idle",
});
const mockSession = {
  clearDocumentError: jest.fn(),
  documentCommandsRef: {
    current: {
      invalidateLayoutMeasurements: mockInvalidateLayoutMeasurements,
      reload: mockReloadDocument,
    },
  },
  flushCurrentDocumentBeforeTransition: jest.fn(async () => true),
  handleError: jest.fn(),
  handleDocumentLoaded: jest.fn(),
  handleDocumentLoadError: jest.fn(),
  newMarkdownDocument: jest.fn(),
  openMarkdownDialog: jest.fn(),
  openSelectedFile: jest.fn(),
  openUntitledDocument: jest.fn(),
  prepareCurrentDocumentForClose: jest.fn(async () => true),
  saveCurrentDocument: jest.fn(async () => true),
  saveCurrentDocumentAs: jest.fn(async () => true),
  sessionState$: mockSessionState$,
  setCommandState: jest.fn(),
  setIsDirty: jest.fn(),
  setSaveState: jest.fn(),
};

jest.mock("@legend-desktop/file-system-watcher", () => ({
  watchFiles: jest.fn(() => ({ remove: jest.fn() })),
}));

jest.mock("@legend-desktop/document-app", () => {
  const React = require("react");
  const { watchFiles } = require("@legend-desktop/file-system-watcher");

  return {
    useWatchedDocumentReload: ({
      delayMs = 100,
      enabled = true,
      onReload,
      path,
      shouldReload,
    }: {
      delayMs?: number;
      enabled?: boolean;
      onReload: () => void;
      path: string | null;
      shouldReload?: () => boolean;
    }) => {
      React.useEffect(() => {
        if (enabled && path) {
          let reloadTimeout: ReturnType<typeof setTimeout> | undefined;
          const subscription = watchFiles([path], () => {
            if (!shouldReload || shouldReload()) {
              if (reloadTimeout) {
                clearTimeout(reloadTimeout);
              }
              reloadTimeout = setTimeout(() => {
                if (!shouldReload || shouldReload()) {
                  onReload();
                }
              }, delayMs);
            }
          });

          return () => {
            if (reloadTimeout) {
              clearTimeout(reloadTimeout);
            }
            subscription.remove();
          };
        }

        return undefined;
      }, [delayMs, enabled, onReload, path, shouldReload]);
    },
  };
});

jest.mock("@legend-desktop/file-dialog", () => ({
  openFileDialog: jest.fn(),
  saveFileDialog: jest.fn(),
}));

jest.mock("@legend-desktop/markdown-document", () => ({
  MarkdownDocument: (props: unknown) => mockMarkdownDocument(props),
  nativeMarkdownDocumentAdapter: {},
}));

jest.mock("../MarkdownE2EEditorSmoke", () => ({
  MarkdownE2EEditorSmoke: (props: { autoSelectBlocks?: boolean; variant?: string }) => mockMarkdownE2EEditorSmoke(props),
}));

jest.mock("../MarkdownE2ERunner", () => {
  const actual = jest.requireActual("../MarkdownE2ERunner");
  return {
    ...actual,
    MarkdownE2ERunner: (props: { scenario: string }) => mockMarkdownE2ERunner(props),
  };
});

jest.mock("../MarkdownFormattingToolbar", () => ({
  MarkdownFormattingToolbar: () => {
    const React = require("react");
    const { Text } = require("react-native");
    return React.createElement(Text, null, "formatting-toolbar");
  },
}));

jest.mock("../MarkdownFloatingSurface", () => ({
  MarkdownFloatingSurface: ({ children }: { children: React.ReactNode }) => {
    const React = require("react");
    return React.createElement(React.Fragment, null, children);
  },
}));

jest.mock("../useMarkdownDocumentSession", () => ({
  useMarkdownDocumentSession: () => mockSession,
}));

jest.mock("../useMarkdownDocumentEvents", () => ({
  useMarkdownAppExit: jest.fn(),
  useMarkdownStartupDocument: jest.fn(),
  useMarkdownWindowCloseRequest: jest.fn(),
  useRecentMarkdownDocumentOpener: jest.fn(),
}));

jest.mock("../useMarkdownKeyboardShortcuts", () => ({
  useMarkdownKeyboardShortcuts: jest.fn(),
}));

jest.mock("../useMarkdownMenus", () => ({
  useMarkdownMenus: jest.fn(),
}));

jest.mock("../useMarkdownWindows", () => ({
  useMarkdownEditorWindowOptions: jest.fn(),
  useMarkdownSettingsWindow: () => jest.fn(),
}));

jest.mock("../markdownSettings", () => ({
  applyMarkdownThemeSetting: jest.fn(),
  useMarkdownAppearanceSettings: () => ({}),
  useMarkdownAutosaveSetting: () => "enabled",
  useMarkdownDisplayThemeSetting: () => "system",
  useMarkdownFormattingToolbarModeSetting: () => "selection",
  useMarkdownLayoutThemeSetting: () => "default",
}));

jest.mock("../userThemes", () => ({
  loadMarkdownUserThemesSync: jest.fn(),
}));

describe("MarkdownEditorWindow e2e launch routing", () => {
  beforeEach(() => {
    (globalThis as typeof globalThis & { __DEV__?: boolean }).__DEV__ = true;
    mockMarkdownE2EEditorSmoke.mockClear();
    mockMarkdownE2ERunner.mockClear();
    mockMarkdownDocument.mockClear();
    mockInvalidateLayoutMeasurements.mockClear();
    mockReloadDocument.mockClear();
    mockWatchFiles.mockClear();
    mockWatchFiles.mockReturnValue({ remove: jest.fn() });
    mockUseMarkdownAppExit.mockClear();
    mockUseMarkdownWindowCloseRequest.mockClear();
    mockSessionState$.assign({
      commandState: { canRedo: false, canUndo: false },
      documentSource: "untitled",
      filename: "test.md",
      isDirty: false,
      lastError: null,
      saveState: "idle",
    });
  });

  it.each([
    ["editor-ui-smoke", "ui", false],
    ["editor-selection-smoke", "selection", true],
    ["editor-soft-wrap-selection", "softWrap", false],
    ["editor-code-block-smoke", "codeBlock", false],
    ["editor-edit-navigation-smoke", "editNavigation", false],
    ["editor-navigation-smoke", "navigation", false],
    ["editor-theme-reflow-smoke", "themeReflow", false],
  ])("routes %s to the editor smoke harness", async (scenario, variant, autoSelectBlocks) => {
    const view = await render(<MarkdownEditorWindow launchArguments={[`--markdown-e2e=${scenario}`]} />);

    expect(view.getByText(`editor-smoke:${variant}:${autoSelectBlocks ? "auto" : "manual"}`)).toBeTruthy();
    expect(mockMarkdownE2EEditorSmoke).toHaveBeenCalledWith({ autoSelectBlocks, variant });
    expect(mockMarkdownE2ERunner).not.toHaveBeenCalled();
    await view.unmount();
  });

  it("routes document scenarios to the document e2e runner", async () => {
    const view = await render(<MarkdownEditorWindow launchArguments={["--markdown-e2e=far-down-structural-edits"]} />);

    expect(view.getByText("document-runner:far-down-structural-edits")).toBeTruthy();
    expect(mockMarkdownE2ERunner).toHaveBeenCalledWith(expect.objectContaining({
      scenario: "far-down-structural-edits",
    }));
    expect(mockMarkdownE2EEditorSmoke).not.toHaveBeenCalled();
    await view.unmount();
  });

  it("uses the autosave-aware close preparation for app quit", async () => {
    const view = await render(<MarkdownEditorWindow />);

    expect(mockUseMarkdownAppExit).toHaveBeenCalledWith({
      autosaveEnabled: true,
      handleError: mockSession.handleError,
      prepareCurrentDocumentForClose: mockSession.prepareCurrentDocumentForClose,
    });
    expect(mockUseMarkdownWindowCloseRequest).toHaveBeenCalledWith({
      autosaveEnabled: true,
      handleError: mockSession.handleError,
      prepareCurrentDocumentForClose: mockSession.prepareCurrentDocumentForClose,
    });
    await view.unmount();
  });

  it("shows a quiet placeholder for a clean untitled document", async () => {
    mockSessionState$.assign({
      documentSource: "untitled",
      isDirty: false,
      lastError: null,
    });

    const view = await render(<MarkdownEditorWindow />);

    expect(view.getByText("Untitled")).toBeTruthy();
    expect(view.getByText("Start writing")).toBeTruthy();
    await view.unmount();
  });

  it("keeps session chrome state changes out of the document render path", async () => {
    const view = await render(<MarkdownEditorWindow />);
    const initialDocumentRenderCount = mockMarkdownDocument.mock.calls.length;

    await act(async () => {
      mockSessionState$.assign({
        isDirty: true,
        lastError: "Unable to save",
        saveState: "saving",
      });
    });

    expect(view.getByText("Unable to save")).toBeTruthy();
    expect(mockMarkdownDocument).toHaveBeenCalledTimes(initialDocumentRenderCount);
    await view.unmount();
  });

  it("does not reload the document for the file watcher event caused by saving", async () => {
    jest.useFakeTimers();
    mockSessionState$.assign({
      documentSource: "file",
      filename: "/tmp/test.md",
      isDirty: true,
      saveState: "idle",
    });

    const view = await render(<MarkdownEditorWindow />);
    const watchedFileChange = mockWatchFiles.mock.calls[0]?.[1];
    expect(watchedFileChange).toBeDefined();

    await act(async () => {
      mockSessionState$.saveState.set("saving");
    });
    await act(async () => {
      mockSessionState$.saveState.set("idle");
      mockSessionState$.isDirty.set(false);
    });

    await act(async () => {
      watchedFileChange?.({ filePath: "/tmp/test.md", path: "/tmp", type: "change" });
      jest.advanceTimersByTime(100);
    });

    expect(mockReloadDocument).not.toHaveBeenCalled();

    await act(async () => {
      watchedFileChange?.({ filePath: "/tmp/test.md", path: "/tmp", type: "change" });
      jest.advanceTimersByTime(100);
    });

    expect(mockReloadDocument).not.toHaveBeenCalled();

    await act(async () => {
      jest.advanceTimersByTime(1000);
      watchedFileChange?.({ filePath: "/tmp/test.md", path: "/tmp", type: "change" });
      jest.advanceTimersByTime(100);
    });

    expect(mockReloadDocument).toHaveBeenCalledTimes(1);
    await view.unmount();
    jest.useRealTimers();
  });
});
