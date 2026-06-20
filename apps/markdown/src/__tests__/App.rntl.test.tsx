import { render, waitFor } from "@testing-library/react-native";
import React from "react";
import { addRecentDocumentOpenListener } from "@legend-desktop/recent-documents";
import { useNativeMenu } from "@legend-desktop/native-menu";
import { addWindowClosedListener } from "@legend-desktop/window-manager";
import { editorWindowIdentifier } from "../appConstants";
import { App } from "../App";
import { registerMarkdownEditorMenuHandlers, registerMarkdownEditorRecentDocumentHandler } from "../markdownEditorActions";
import { newMarkdownDocumentLaunchArgument } from "../markdownFiles";
import { openMarkdownEditorWindow } from "../markdownWindows";

const mockAddRecentDocumentOpenListener = addRecentDocumentOpenListener as jest.MockedFunction<typeof addRecentDocumentOpenListener>;
const mockAddWindowClosedListener = addWindowClosedListener as jest.MockedFunction<typeof addWindowClosedListener>;
const mockUseNativeMenu = useNativeMenu as jest.MockedFunction<typeof useNativeMenu>;
const mockOpenMarkdownEditorWindow = openMarkdownEditorWindow as jest.MockedFunction<typeof openMarkdownEditorWindow>;

jest.mock("@legend-desktop/file-dialog", () => ({
  openFileDialog: jest.fn(),
}));

jest.mock("@legend-desktop/native-menu", () => ({
  useNativeMenu: jest.fn(),
}));

jest.mock("@legend-desktop/recent-documents", () => ({
  addRecentDocumentOpenListener: jest.fn(),
}));

jest.mock("@legend-desktop/window-manager", () => ({
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
    render(<App />);

    await waitFor(() => {
      expect(mockUseNativeMenu).toHaveBeenCalled();
    });
    mockUseNativeMenu.mock.calls[0][0].handlers?.new({
      itemId: "new",
      menuId: "file",
      ownerId: "markdown",
    });

    await waitFor(() => {
      expect(mockOpenMarkdownEditorWindow).toHaveBeenCalledTimes(2);
    });
    expect(mockOpenMarkdownEditorWindow).toHaveBeenLastCalledWith([newMarkdownDocumentLaunchArgument]);
  });

  it("opens a recent file in a fresh editor window when no editor is registered", async () => {
    render(<App />);

    await waitFor(() => {
      expect(mockAddRecentDocumentOpenListener).toHaveBeenCalled();
    });
    mockAddRecentDocumentOpenListener.mock.calls[0][0]({ path: "/tmp/recent.md" });

    await waitFor(() => {
      expect(mockOpenMarkdownEditorWindow).toHaveBeenCalledWith(["/tmp/recent.md"]);
    });
  });

  it("opens a recent file in a fresh window after the editor closes", async () => {
    const staleRecentHandler = jest.fn(async () => undefined);
    const unregister = registerMarkdownEditorRecentDocumentHandler(staleRecentHandler);
    render(<App />);

    await waitFor(() => {
      expect(mockAddRecentDocumentOpenListener).toHaveBeenCalled();
      expect(mockAddWindowClosedListener).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(mockOpenMarkdownEditorWindow).toHaveBeenCalledTimes(1);
    });
    mockAddWindowClosedListener.mock.calls[0][0]({ identifier: editorWindowIdentifier });
    mockAddRecentDocumentOpenListener.mock.calls[0][0]({ path: "/tmp/recent.md" });

    await waitFor(() => {
      expect(mockOpenMarkdownEditorWindow).toHaveBeenCalledWith(["/tmp/recent.md"]);
    });
    expect(staleRecentHandler).not.toHaveBeenCalled();
    unregister();
  });

  it("delegates menu actions to the registered editor while it is mounted", async () => {
    const editorNew = jest.fn();
    const unregister = registerMarkdownEditorMenuHandlers({ new: editorNew });
    render(<App />);

    await waitFor(() => {
      expect(mockUseNativeMenu).toHaveBeenCalled();
    });
    mockUseNativeMenu.mock.calls[0][0].handlers?.new({
      itemId: "new",
      menuId: "file",
      ownerId: "markdown",
    });

    expect(editorNew).toHaveBeenCalledTimes(1);
    expect(mockOpenMarkdownEditorWindow).toHaveBeenCalledTimes(1);
    unregister();
  });

  it("opens a fresh untitled window for New after the editor closes", async () => {
    const staleNewHandler = jest.fn();
    const unregister = registerMarkdownEditorMenuHandlers({ new: staleNewHandler });
    render(<App />);

    await waitFor(() => {
      expect(mockUseNativeMenu).toHaveBeenCalled();
      expect(mockAddWindowClosedListener).toHaveBeenCalled();
    });
    await waitFor(() => {
      expect(mockOpenMarkdownEditorWindow).toHaveBeenCalledTimes(1);
    });
    mockAddWindowClosedListener.mock.calls[0][0]({ identifier: editorWindowIdentifier });
    mockUseNativeMenu.mock.calls[0][0].handlers?.new({
      itemId: "new",
      menuId: "file",
      ownerId: "markdown",
    });

    await waitFor(() => {
      expect(mockOpenMarkdownEditorWindow).toHaveBeenCalledTimes(2);
    });
    expect(mockOpenMarkdownEditorWindow).toHaveBeenLastCalledWith([newMarkdownDocumentLaunchArgument]);
    expect(staleNewHandler).not.toHaveBeenCalled();
    unregister();
  });
});
