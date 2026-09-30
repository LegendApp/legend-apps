import { act, render, waitFor } from "@testing-library/react-native";
import React from "react";
import { subscribeToOpenRequests } from "@legendapp/spark/app/documents";
import { createMenu } from "@legendapp/spark/menus";
import { addAppListener } from "@legendapp/spark/app";
import { editorWindowIdentifier } from "../appConstants";
import { App } from "../App";
import { registerMarkdownEditorMenuHandlers, registerMarkdownEditorRecentDocumentHandler } from "../markdownEditorActions";
import { newMarkdownDocumentLaunchArgument } from "../markdownFiles";
import { openMarkdownEditorWindow } from "../markdownWindows";
const mockAddRecentDocumentOpenListener = subscribeToOpenRequests as jest.MockedFunction<typeof subscribeToOpenRequests>;
const mockAddWindowClosedListener = addAppListener as jest.MockedFunction<typeof addAppListener>;
const mockUseNativeMenu = createMenu as jest.MockedFunction<typeof createMenu>;
const mockOpenMarkdownEditorWindow = openMarkdownEditorWindow as jest.MockedFunction<typeof openMarkdownEditorWindow>;
function dispatchNew() {
    mockUseNativeMenu.mock.lastCall![0].onAction?.({ type: "action", itemId: "new" });
}
function openRecent() {
    mockAddRecentDocumentOpenListener.mock.lastCall![0]({ type: "file", id: String(Date.now()), path: "/tmp/recent.md", source: "recent" } as any);
}
function closeEditor() {
    mockAddWindowClosedListener.mock.lastCall![1]({ type: "windowClosed", windowId: editorWindowIdentifier });
}
jest.mock("@legendapp/spark/dialogs", () => ({
    openFileDialog: jest.fn(),
}));
jest.mock("@legendapp/spark/menus", () => ({
    createMenu: jest.fn(),
}));
jest.mock("@legendapp/spark-desktop-app/src/open-requests", () => ({ subscribeToOpenRequests: jest.fn() }));
jest.mock("@legendapp/spark/app", () => ({ addAppListener: jest.fn(() => ({ remove: jest.fn() })) }));
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
        mockUseNativeMenu.mockResolvedValue({ id: "markdown", update: jest.fn(async () => {}), remove: jest.fn(async () => {}) });
        mockAddRecentDocumentOpenListener.mockResolvedValue({ remove: jest.fn() });
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
