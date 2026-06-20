import { render } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";
import { MarkdownEditorWindow } from "../MarkdownEditorWindow";
import { useMarkdownAppExit, useMarkdownWindowCloseRequest } from "../useMarkdownDocumentEvents";

const mockUseMarkdownAppExit = useMarkdownAppExit as jest.MockedFunction<typeof useMarkdownAppExit>;
const mockUseMarkdownWindowCloseRequest = useMarkdownWindowCloseRequest as jest.MockedFunction<typeof useMarkdownWindowCloseRequest>;

const mockMarkdownE2EEditorSmoke = jest.fn((props: { autoSelectBlocks?: boolean; variant?: string }) => (
  <Text>{`editor-smoke:${props.variant}:${props.autoSelectBlocks ? "auto" : "manual"}`}</Text>
));
const mockMarkdownE2ERunner = jest.fn((props: { scenario: string }) => (
  <Text>{`document-runner:${props.scenario}`}</Text>
));
const mockInvalidateLayoutMeasurements = jest.fn();
const mockSession = {
  activeAdapter: {},
  clearDocumentError: jest.fn(),
  documentCommandsRef: {
    current: {
      invalidateLayoutMeasurements: mockInvalidateLayoutMeasurements,
    },
  },
  filename: "test.md",
  flushCurrentDocumentBeforeTransition: jest.fn(async () => true),
  handleError: jest.fn(),
  hasDocument: true,
  isDirty: false,
  isUntitledDocument: true,
  lastError: null,
  newMarkdownDocument: jest.fn(),
  openMarkdownDialog: jest.fn(),
  openSelectedFile: jest.fn(),
  openUntitledDocument: jest.fn(),
  prepareCurrentDocumentForClose: jest.fn(async () => true),
  saveCurrentDocument: jest.fn(async () => true),
  saveCurrentDocumentAs: jest.fn(async () => true),
  saveState: "idle",
  sessionState$: {},
  setCommandState: jest.fn(),
  setIsDirty: jest.fn(),
  setSaveState: jest.fn(),
};

jest.mock("@legend-desktop/markdown-document", () => ({
  MarkdownDocument: () => {
    const React = require("react");
    const { Text } = require("react-native");
    return React.createElement(Text, null, "markdown-document");
  },
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
    mockInvalidateLayoutMeasurements.mockClear();
    mockUseMarkdownAppExit.mockClear();
    mockUseMarkdownWindowCloseRequest.mockClear();
    mockSession.isDirty = false;
    mockSession.isUntitledDocument = true;
    mockSession.lastError = null;
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
    mockSession.isUntitledDocument = true;
    mockSession.isDirty = false;
    mockSession.lastError = null;

    const view = await render(<MarkdownEditorWindow />);

    expect(view.getByText("Untitled")).toBeTruthy();
    expect(view.getByText("Start writing")).toBeTruthy();
    await view.unmount();
  });
});
