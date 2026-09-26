import { act, render, waitFor } from "@testing-library/react-native";
import React from "react";
import { addRecentDocumentOpenListener } from "@legendapp/spark/app/recent-documents";
import { useNativeMenu } from "@legendapp/spark/menus";
import { addWindowClosedListener } from "@legendapp/spark/windows/managed";
import { editorWindowIdentifier } from "../appConstants";
import { App } from "../App";
import { registerMarkdownEditorMenuHandlers, registerMarkdownEditorRecentDocumentHandler } from "../markdownEditorActions";
import { newMarkdownDocumentLaunchArgument } from "../markdownFiles";
import { openMarkdownEditorWindow } from "../markdownWindows";

const mockAddRecentDocumentOpenListener = addRecentDocumentOpenListener as jest.MockedFunction<typeof addRecentDocumentOpenListener>;
const mockAddWindowClosedListener = addWindowClosedListener as jest.MockedFunction<typeof addWindowClosedListener>;
const mockUseNativeMenu = useNativeMenu as jest.MockedFunction<typeof useNativeMenu>;
const mockOpenMarkdownEditorWindow = openMarkdownEditorWindow as jest.MockedFunction<typeof openMarkdownEditorWindow>;

function dispatchNew() {
  mockUseNativeMenu.mock.lastCall![0].handlers?.new({ itemId: "new", menuId: "file", ownerId: "markdown" });
}

function openRecent() {
  mockAddRecentDocumentOpenListener.mock.lastCall![0]({ path: "/tmp/recent.md" });
}

function closeEditor() {
  mockAddWindowClosedListener.mock.lastCall![0]({ identifier: editorWindowIdentifier });
}

jest.mock("@legendapp/spark/dialogs", () => ({
  openFileDialog: jest.fn(),
}));

jest.mock("@legendapp/spark/menus", () => ({
  useNativeMenu: jest.fn(),
}));

jest.mock("@legendapp/spark/app/recent-documents", () => ({
  addRecentDocumentOpenListener: jest.fn(),
}));

jest.mock("@legendapp/spark/windows/managed", () => ({
  addApplicationReopenRequestedListener: jest.fn(() => ({ remove: jest.fn() })),
  addWindowClosedListener: jest.fn(),
}));

jest.mock("../markdownSettings", () => ({
  applyMarkdownThemeSetting: jest.fn(),
}));

jest.mock("../markdownWindows", () => ({
  openMarkdownEditorWindow: jest.fn(async () => undefined),
  openMarkdownSettingsWindow: jest.fn(async () => undefined),
  registerMarkdownWindows: jest.fn(),
}));

jest.mock("../userThemes", () => ({
  loadMarkdownUserThemesSync: jest.fn(),
}));

describe("App markdown shell actions", () => {
  beforeEach(() => {
    mockAddRecentDocumentOpenListener.mockReset();
    mockAddWindowClosedListener.mockReset();
    mockOpenMarkdownEditorWindow.mockClear();
    mockUseNativeMenu.mockReset();
    mockAddRecentDocumentOpenListener.mockReturnValue({ remove: jest.fn() });
    mockAddWindowClosedListener.mockReturnValue({ remove: jest.fn() });
  });

  it("opens a fresh untitled editor window for New when no editor is registered", async () => {
    await render(<App />);

    await waitFor(() => {
      expect(mockUseNativeMenu).toHaveBeenCalled();
    });
    await act(async () => dispatchNew());

    await waitFor(() => {
      expect(mockOpenMarkdownEditorWindow).toHaveBeenCalledTimes(2);
    });
    expect(mockOpenMarkdownEditorWindow).toHaveBeenLastCalledWith([newMarkdownDocumentLaunchArgument]);
  });

  it("opens a recent file in a fresh editor window when no editor is registered", async () => {
    await render(<App />);

    await waitFor(() => {
      expect(mockAddRecentDocumentOpenListener).toHaveBeenCalled();
    });
    await act(async () => openRecent());

    await waitFor(() => {
      expect(mockOpenMarkdownEditorWindow).toHaveBeenCalledWith(["/tmp/recent.md"]);
    });
  });

  it("opens a recent file in a fresh window after the editor closes", async () => {
    const staleRecentHandler = jest.fn(async () => undefined);
    const unregister = registerMarkdownEditorRecentDocumentHandler(staleRecentHandler);
    await render(<App />);

    await waitFor(() => {
      expect(mockAddRecentDocumentOpenListener).toHaveBeenCalled();
      expect(mockAddWindowClosedListener).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(mockOpenMarkdownEditorWindow).toHaveBeenCalledTimes(1);
    });
    await act(async () => closeEditor());
    await act(async () => openRecent());

    await waitFor(() => {
      expect(mockOpenMarkdownEditorWindow).toHaveBeenCalledWith(["/tmp/recent.md"]);
    });
    expect(staleRecentHandler).not.toHaveBeenCalled();
    unregister();
  });

  it("delegates menu actions to the registered editor while it is mounted", async () => {
    const editorNew = jest.fn();
    const unregister = registerMarkdownEditorMenuHandlers({ new: editorNew });
    await render(<App />);

    await waitFor(() => {
      expect(mockUseNativeMenu).toHaveBeenCalled();
    });
    await act(async () => dispatchNew());

    expect(editorNew).toHaveBeenCalledTimes(1);
    expect(mockOpenMarkdownEditorWindow).toHaveBeenCalledTimes(1);
    unregister();
  });

  it("opens a fresh untitled window for New after the editor closes", async () => {
    const staleNewHandler = jest.fn();
    const unregister = registerMarkdownEditorMenuHandlers({ new: staleNewHandler });
    await render(<App />);

    await waitFor(() => {
      expect(mockUseNativeMenu).toHaveBeenCalled();
      expect(mockAddWindowClosedListener).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(mockOpenMarkdownEditorWindow).toHaveBeenCalledTimes(1);
    });
    await act(async () => closeEditor());
    await act(async () => dispatchNew());

    await waitFor(() => {
      expect(mockOpenMarkdownEditorWindow).toHaveBeenCalledTimes(2);
    });
    expect(mockOpenMarkdownEditorWindow).toHaveBeenLastCalledWith([newMarkdownDocumentLaunchArgument]);
    expect(staleNewHandler).not.toHaveBeenCalled();
    unregister();
  });
});
