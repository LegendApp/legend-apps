import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { getLaunchDocumentPath, useWatchedDocumentReload } from "@legendapp/spark/app/documents";
import { noteRecentDocument } from "@legendapp/spark/app/documents";
import { loadCodeFile } from "@legend-apps/syntax-parser";
import { VirtualizedFixedDocumentList } from "@legend-apps/virtualized-document";
import { CodeViewerWindow } from "../CodeViewerWindow";
import { useCodeSyntaxThemeSetting, useCodeSyntaxHighlightingEnabledSetting } from "../codeSettings";
import { requestCodeViewerFile } from "../codeViewerRequests";
import { getCodeLanguage, getCodeRepresentedUri, getLaunchCodeFile, isCodePath } from "../codeFiles";
import { beforeWindowClose } from "@legendapp/spark/windows";
import { beforeQuit } from "@legendapp/spark/app";
import { dispatchCodeViewerMenu } from "../codeViewerRequests";
import { setCodeViewerWindowOptions } from "../codeWindows";
import { prepareDocument, cancelPreparedDocument } from "@legend-apps/source-editor";
import { openFileDialog } from "@legendapp/spark/dialogs";
import { WorkspaceSidebar } from "@legend-apps/workspace";
import { useRoutedHotkeys } from "@legendapp/spark/shortcuts/commands";
const mockEditorCommand = jest.fn(async () => true);
jest.mock("@legendapp/spark/app/documents", () => ({
    createDocumentTransitionGuard: jest.requireActual("@legendapp/spark/app/documents").createDocumentTransitionGuard,
    getLaunchDocumentPath: jest.fn(() => null),
    getFilename: (path: string) => path.split("/").pop(),
    useWatchedDocumentReload: jest.fn(),
    noteRecentDocument: jest.fn(),
}));
jest.mock("@legendapp/spark/dialogs", () => ({ openFileDialog: jest.fn() }));
jest.mock("@legendapp/spark/shortcuts/commands", () => ({ createHotkeyRouter: jest.fn(() => ({})), useRoutedHotkeys: jest.fn() }));
jest.mock("@legendapp/spark/app", () => ({ beforeQuit: jest.fn(async () => ({ remove: async () => {} })) }));
jest.mock("@legendapp/spark/windows", () => ({
    addWindowListener: jest.fn(async () => ({ remove: async () => {} })),
    beforeWindowClose: jest.fn(async () => ({ remove: async () => {} })),
}));
jest.mock("@legendapp/spark/ui/split-view", () => {
    const React = require("react");
    return { SidebarSplitView: ({ content, sidebar, sidebarCollapsed }: Record<string, unknown>) => React.createElement("SplitView", { sidebarCollapsed }, sidebar, content) };
});
jest.mock("@legend-apps/source-editor", () => {
    const React = require("react");
    return { prepareDocument: jest.fn((path: string) => `prepared:${path}`), cancelPreparedDocument: jest.fn(), SourceDocumentEditor: React.forwardRef((props: object, ref: React.Ref<unknown>) => {
            React.useImperativeHandle(ref, () => ({ command: mockEditorCommand }), []);
            return React.createElement("SourceDocumentEditor", props);
        }) };
});
jest.mock("@legend-apps/source-editor/preload", () => {
    const editor = jest.requireMock("@legend-apps/source-editor");
    return { prepareDocument: editor.prepareDocument, cancelPreparedDocument: editor.cancelPreparedDocument };
});
jest.mock("@legend-apps/source-viewer", () => ({
    SourceDocumentView: () => { throw new Error("The old viewer must not mount"); },
    useSourceDocumentRows: () => { throw new Error("The old tokenization pipeline must not run"); },
}));
jest.mock("@legend-apps/storage", () => ({ createStorage: jest.fn(() => ({})) }));
jest.mock("@legend-apps/syntax-parser", () => ({
    loadCodeFile: jest.fn(),
    getSyntaxLanguageForPath: jest.requireActual("../../../../packages/syntax-parser/src/syntaxAssets").getSyntaxLanguageForPath,
}));
jest.mock("../codeWindows", () => ({ setCodeViewerWindowOptions: jest.fn(async () => { }) }));
jest.mock("../codeSettings", () => ({
    getCodeSidebarOpenSetting: () => true,
    setCodeSidebarOpenSetting: jest.fn(),
    useCodeFontFamilySetting: () => "Menlo",
    useCodeFontSizeSetting: () => 13,
    useCodeSyntaxHighlightingEnabledSetting: jest.fn(() => true),
    useCodeSyntaxThemeSetting: jest.fn(() => "dark"),
    useCodeSyntaxTheme: () => ({ appearance: "dark", background: "#000", foreground: "#fff" }),
}));
jest.mock("@legendapp/list/react-native", () => {
    const React = require("react");
    return {
        LegendList: React.forwardRef((props: Record<string, unknown>, ref: React.Ref<unknown>) => {
            React.useImperativeHandle(ref, () => ({ getState: () => ({ start: -1, end: -1 }) }), []);
            return React.createElement("List", props);
        }),
    };
});
describe("Code default editor", () => {
    let renderer: ReactTestRenderer;
    // The visible editor belongs to the active tab; inactive tabs stay mounted but hidden.
    const editors = () => renderer.root.findAllByType("SourceDocumentEditor" as never);
    const isVisible = (node: ReturnType<typeof editors>[number]) => {
        for (let parent = node.parent; parent; parent = parent.parent) if (parent.props.style?.display === "none") return false;
        return true;
    };
    const editor = () => editors().find(isVisible)!;
    const pressable = (label: string) => renderer.root.find((node) => typeof node.type === "string" && node.props.accessibilityLabel === label && typeof node.props.onPress === "function");
    const openButton = () => pressable("Open File");
    const tabTitles = () => renderer.root.findAll((node) => typeof node.type === "string" && node.props.accessibilityRole === "tab").map((node) => [node.props.accessibilityLabel, node.props.accessibilityState.selected]);
    beforeEach(() => {
        jest.useFakeTimers();
        jest.clearAllMocks();
        mockEditorCommand.mockReset().mockResolvedValue(true);
        jest.replaceProperty(process, "argv", ["node", "code"]);
        jest.mocked(getLaunchDocumentPath).mockReturnValue(null);
        jest.mocked(useCodeSyntaxThemeSetting).mockReturnValue("dark");
        jest.mocked(useCodeSyntaxHighlightingEnabledSetting).mockReturnValue(true);
    });
    afterEach(async () => {
        if (renderer)
            await act(async () => renderer.unmount());
        jest.useRealTimers();
        jest.restoreAllMocks();
    });
    it("opens directly in the editor without loading or mounting the old viewer", async () => {
        await act(async () => { renderer = create(<CodeViewerWindow launchArguments={[]}/>); });
        expect(renderer.root.findAllByType("Text" as never).map(node => node.props.children)).toContain("Open File");
        expect(openButton().props.accessibilityLabel).toBe("Open File");
        expect(renderer.root.findAllByType("SourceDocumentEditor" as never)).toHaveLength(0);
        await act(async () => { requestCodeViewerFile("/one.ts"); });
        expect(prepareDocument).toHaveBeenCalledTimes(1);
        expect(prepareDocument).toHaveBeenCalledWith("/one.ts");
        expect(editor().props.preparedDocumentId).toBe("prepared:/one.ts");
        expect(editor().props.filePath).toBe("/one.ts");
        expect(editor().props.language).toBe("typescript");
        expect(editor().props.syntaxHighlightingEnabled).toBe(true);
        expect(editor().props.syntaxHighlightingMode).toBe("background");
        expect(editor().props.showFileLoadingBanner).toBe(false);
        expect(renderer.root.findAll((node) => node.props.accessibilityLabel === "Open File")).toHaveLength(0);
        expect(tabTitles()).toEqual([["one.ts", true]]);
        expect(renderer.root.findByType(WorkspaceSidebar).props.files).toEqual(["/one.ts"]);
        expect(JSON.stringify(renderer.toJSON())).not.toContain("No file open");
        expect(JSON.stringify(renderer.toJSON())).not.toContain("Open scratch editor prototype");
        expect(loadCodeFile).not.toHaveBeenCalled();
        expect(useWatchedDocumentReload).not.toHaveBeenCalled();
        expect(noteRecentDocument).not.toHaveBeenCalled();
        await act(async () => editor().props.onLoad());
        expect(noteRecentDocument).toHaveBeenCalledWith("/one.ts");
    });
    it("encodes the native document proxy URI", () => {
        expect(getCodeRepresentedUri("/tmp/My #1?.ts")).toBe("file:///tmp/My%20%231%3F.ts");
        expect(getCodeRepresentedUri(null)).toBeNull();
    });
    it("opens launch files directly in the editor", async () => {
        jest.mocked(getLaunchDocumentPath).mockReturnValue("/launch.tsx");
        await act(async () => { renderer = create(<CodeViewerWindow launchArguments={["/launch.tsx"]}/>); });
        expect(editor().props.filePath).toBe("/launch.tsx");
        expect(editor().props.language).toBe("tsx");
        expect(loadCodeFile).not.toHaveBeenCalled();
    });
    it.each(["/readme.md", "/data.json", "/script.py", "/notes.txt", "/LICENSE", "/.env", "/custom.unknown"])("accepts text path %s", (path) => {
        expect(isCodePath(path)).toBe(true);
        expect(getLaunchCodeFile(["--debug", path])).toBe(path);
    });
    it("detects supported languages and falls back to plain text", () => {
        const binary = "/Applications/Legend Code.app/Contents/MacOS/Legend Code";
        expect(getLaunchCodeFile([binary, "--syntax-backend=tree-sitter", "/tmp/README"])).toBe("/tmp/README");
        expect(getLaunchCodeFile([binary])).toBeNull();
        expect(getCodeLanguage("/script.py")).toBe("python");
        expect(getCodeLanguage("/data.json")).toBe("json");
        expect(getCodeLanguage("/README.MD")).toBe("markdown");
        expect(getCodeLanguage("/LICENSE")).toBe("");
        expect(getCodeLanguage("/file.unknown")).toBe("");
        expect(getLaunchCodeFile([])).toBeNull();
        expect(isCodePath("--debug")).toBe(false);
        expect(isCodePath("/folder/")).toBe(false);
    });
    it("preserves the buffer on settings changes and same-file requests", async () => {
        await act(async () => { renderer = create(<CodeViewerWindow />); });
        await act(async () => { requestCodeViewerFile("/one.ts"); });
        const mountedEditor = editor();
        jest.mocked(useCodeSyntaxThemeSetting).mockReturnValue("github-light");
        await act(async () => renderer.update(<CodeViewerWindow />));
        expect(editor()).toBe(mountedEditor);
        expect(editor().props.syntaxTheme).toBe("github-light");
        jest.mocked(useCodeSyntaxHighlightingEnabledSetting).mockReturnValue(false);
        await act(async () => renderer.update(<CodeViewerWindow />));
        expect(editor()).toBe(mountedEditor);
        expect(editor().props.syntaxHighlightingEnabled).toBe(false);
        await act(async () => { requestCodeViewerFile("/one.ts"); });
        expect(editor()).toBe(mountedEditor);
        expect(loadCodeFile).not.toHaveBeenCalled();
    });
    it("opens other files as tabs and keeps each editor mounted", async () => {
        await act(async () => { renderer = create(<CodeViewerWindow />); });
        await act(async () => { requestCodeViewerFile("/one.ts"); });
        const first = editor();
        await act(async () => { requestCodeViewerFile("/two.tsx"); });
        expect(editors()).toHaveLength(2);
        expect(editor()).not.toBe(first);
        expect(editor().props.filePath).toBe("/two.tsx");
        expect(editor().props.language).toBe("tsx");
        expect(tabTitles()).toEqual([["one.ts", false], ["two.tsx", true]]);
        expect(mockEditorCommand).not.toHaveBeenCalled();
        await act(async () => pressable("one.ts").props.onPress());
        expect(editor()).toBe(first);
        expect(setCodeViewerWindowOptions).toHaveBeenLastCalledWith(expect.objectContaining({ filePath: "/one.ts", windowId: "code-viewer" }));
    });
    it("keeps launched and later files as tabs without replaying the launch file", async () => {
        await act(async () => { renderer = create(<CodeViewerWindow launchArguments={["/one.ts"]}/>); });
        expect(editor().props.filePath).toBe("/one.ts");
        await act(async () => { requestCodeViewerFile("/two.tsx"); });
        expect(editor().props.filePath).toBe("/two.tsx");
        const second = editor();
        await act(async () => renderer.update(<CodeViewerWindow launchArguments={["/one.ts"]}/>));
        expect(editor()).toBe(second);
        await act(async () => { requestCodeViewerFile("/three.md"); });
        expect(tabTitles()).toEqual([["one.ts", false], ["two.tsx", false], ["three.md", true]]);
        await act(async () => { requestCodeViewerFile("/one.ts"); });
        expect(editor().props.filePath).toBe("/one.ts");
        expect(editors()).toHaveLength(3);
    });
    it("keeps a tab open when closing it is cancelled or saving fails", async () => {
        await act(async () => { renderer = create(<CodeViewerWindow />); });
        await act(async () => { requestCodeViewerFile("/one.ts"); });
        await act(async () => { requestCodeViewerFile("/two.ts"); });
        mockEditorCommand.mockResolvedValueOnce(false);
        await act(async () => pressable("Close two.ts").props.onPress());
        expect(mockEditorCommand).toHaveBeenLastCalledWith("confirmClose");
        expect(editors()).toHaveLength(2);
        mockEditorCommand.mockRejectedValueOnce(new Error("File changed outside the editor"));
        await act(async () => pressable("Close two.ts").props.onPress());
        expect(editors()).toHaveLength(2);
        expect(JSON.stringify(renderer.toJSON())).toContain("File changed outside the editor");
        await act(async () => pressable("Close two.ts").props.onPress());
        expect(editors()).toHaveLength(1);
        expect(editor().props.filePath).toBe("/one.ts");
        await act(async () => pressable("Close one.ts").props.onPress());
        expect(editors()).toHaveLength(0);
        expect(openButton()).toBeDefined();
    });
    it("opens files added from the single-file sidebar as tabs", async () => {
        await act(async () => { renderer = create(<CodeViewerWindow launchArguments={["/one.ts"]}/>); });
        expect(renderer.root.findByType("SplitView" as never).props.sidebarCollapsed).toBe(true);
        jest.mocked(openFileDialog).mockResolvedValueOnce({ canceled: false, paths: ["/two.ts", "/three.ts"] });
        await act(async () => pressable("Add File").props.onPress());
        expect(openFileDialog).toHaveBeenCalledWith({ filters: [], multiple: true, selection: "files" });
        expect(renderer.root.findByType("SplitView" as never).props.sidebarCollapsed).toBe(false);
        expect(editor().props.filePath).toBe("/two.ts");
        expect(editor().props.preparedDocumentId).toBe("prepared:/two.ts");
        expect(tabTitles()).toEqual([["one.ts", false], ["two.ts", true]]);
    });
    it("passes a launch preparation through without starting a duplicate read", async () => {
        await act(async () => { renderer = create(<CodeViewerWindow launchArguments={["/launch.ts"]} preparedDocumentId="launch-token"/>); });
        expect(editor().props.preparedDocumentId).toBe("launch-token");
        expect(prepareDocument).not.toHaveBeenCalled();
    });
    it("does not replay an old request when the viewer is reopened", async () => {
        await act(async () => { renderer = create(<CodeViewerWindow />); });
        await act(async () => { requestCodeViewerFile("/one.ts"); });
        await act(async () => renderer.unmount());
        await act(async () => { renderer = create(<CodeViewerWindow launchArguments={["/new.ts"]} preparedDocumentId="new-token"/>); });
        expect(editor().props.filePath).toBe("/new.ts");
        expect(editor().props.preparedDocumentId).toBe("new-token");
    });
    it("updates the Save As title and language without remounting, then can reopen the original", async () => {
        await act(async () => { renderer = create(<CodeViewerWindow />); });
        await act(async () => { requestCodeViewerFile("/one.ts"); });
        const first = editor();
        await act(async () => editor().props.onDocumentState({ dirty: false, path: "/copy.py" }));
        expect(editor()).toBe(first);
        expect(editor().props.language).toBe("python");
        expect(setCodeViewerWindowOptions).toHaveBeenLastCalledWith(expect.objectContaining({ filePath: "/copy.py" }));
        expect(tabTitles()).toEqual([["copy.py", true]]);
        await act(async () => { requestCodeViewerFile("/copy.py"); });
        expect(editor()).toBe(first);
        await act(async () => { requestCodeViewerFile("/one.ts"); });
        expect(editor()).not.toBe(first);
        expect(tabTitles()).toEqual([["copy.py", false], ["one.ts", true]]);
    });
    it("guards close and quit for every tab, routes menu commands and toggles pairing", async () => {
        await act(async () => { renderer = create(<CodeViewerWindow />); });
        await act(async () => { requestCodeViewerFile("/one.ts"); });
        const close = jest.mocked(beforeWindowClose).mock.calls[0][1];
        const quit = jest.mocked(beforeQuit).mock.calls[0][0];
        const menu = dispatchCodeViewerMenu;
        mockEditorCommand.mockResolvedValueOnce(false);
        await act(async () => { expect(await close()).toBe(false); });
        await act(async () => { expect(await close()).toBe(true); });
        await act(async () => { requestCodeViewerFile("/two.ts"); });
        mockEditorCommand.mockClear().mockResolvedValueOnce(true).mockResolvedValueOnce(false);
        await act(async () => { expect(await close()).toBe(false); });
        expect(mockEditorCommand).toHaveBeenCalledTimes(2);
        mockEditorCommand.mockResolvedValueOnce(false);
        await act(async () => { expect(await quit()).toBe(false); });
        await act(async () => { expect(await quit()).toBe(true); });
        for (const itemId of ["save", "saveAs", "find", "goToLine", "indent", "toggleComment", "duplicateLine", "moveLineUp"]) {
            await act(async () => menu(itemId));
            expect(mockEditorCommand).toHaveBeenLastCalledWith(itemId);
        }
        await act(async () => menu("automaticPairs"));
        expect(editor().props.automaticPairs).toBe(false);
        expect(renderer.root.findByType("SplitView" as never).props.sidebarCollapsed).toBe(true);
        const shortcut = jest.mocked(useRoutedHotkeys).mock.lastCall![0];
        expect(shortcut.scope).toEqual({ kind: "window", windowId: "code-viewer" });
        expect(shortcut.definitions).toEqual([{ id: "toggleSidebar", title: "Toggle Sidebar", defaultBindings: ["Cmd+Ctrl+s"] }]);
        const toggleSidebarShortcut = shortcut.handlers.toggleSidebar!;
        await act(async () => { toggleSidebarShortcut({} as any); });
        expect(renderer.root.findByType("SplitView" as never).props.sidebarCollapsed).toBe(false);
        await act(async () => { toggleSidebarShortcut({} as any); });
        await act(async () => menu("toggleSidebar"));
        expect(renderer.root.findByType("SplitView" as never).props.sidebarCollapsed).toBe(false);
    });
    it("keeps the empty state usable when the dialog cancels or fails, then opens a file", async () => {
        await act(async () => { renderer = create(<CodeViewerWindow />); });
        jest.mocked(openFileDialog).mockResolvedValue({ canceled: true });
        await act(async () => openButton().props.onPress());
        expect(openFileDialog).toHaveBeenCalledWith({ selection: "files" });
        expect(renderer.root.findAllByType("SourceDocumentEditor" as never)).toHaveLength(0);
        jest.mocked(openFileDialog).mockRejectedValue(new Error("Dialog failed"));
        await act(async () => openButton().props.onPress());
        expect(renderer.root.findAllByType("SourceDocumentEditor" as never)).toHaveLength(0);
        expect(JSON.stringify(renderer.toJSON())).toContain("Dialog failed");
        jest.mocked(openFileDialog).mockResolvedValue({ canceled: false, paths: ["/two.ts"] });
        await act(async () => openButton().props.onPress());
        expect(editor().props.filePath).toBe("/two.ts");
        expect(JSON.stringify(renderer.toJSON())).not.toContain("Dialog failed");
    });
    it("restarts initial requests for a new viewer dataset and cancels old overscan work", async () => {
        // Retain shared-list regression coverage even though Code no longer uses it.
        const requestRange = jest.fn();
        const onInitialRowsRequested = jest.fn();
        const list = () => renderer.root.findByType("List" as never);
        const render = (dataKey: string) => (<VirtualizedFixedDocumentList dataKey={dataKey} itemIndexes={[0, 1, 2]} rowHeight={22} getRow={() => undefined} renderRow={() => <></>} requestRange={requestRange} onInitialRowsRequested={onInitialRowsRequested} lineOverscan={10} overscanRequestDelayMs={80}/>);
        await act(async () => { renderer = create(render("one")); });
        await act(async () => list().props.onLayout({ nativeEvent: { layout: { height: 440 } } }));
        expect(onInitialRowsRequested).toHaveBeenCalledTimes(1);
        await act(async () => renderer.update(render("two")));
        expect(onInitialRowsRequested).toHaveBeenCalledTimes(2);
        await act(async () => jest.advanceTimersByTime(100));
        expect(requestRange.mock.calls.filter((call) => call[2].reason === "overscan")).toHaveLength(1);
        await act(async () => renderer.update(render("two")));
        expect(onInitialRowsRequested).toHaveBeenCalledTimes(2);
    });
});
