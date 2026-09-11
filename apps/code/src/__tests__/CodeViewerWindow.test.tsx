import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { getLaunchDocumentPath, openSelectedDocumentPath, useWatchedDocumentReload } from "@legend-apps/document-app";
import { noteRecentDocument } from "@legend-apps/recent-documents";
import { loadCodeFile } from "@legend-apps/syntax-parser";
import { VirtualizedFixedDocumentList } from "@legend-apps/virtualized-document";
import { CodeViewerWindow } from "../CodeViewerWindow";
import { useCodeSyntaxThemeSetting, useCodeSyntaxHighlightingEnabledSetting } from "../codeSettings";
import { codeViewerFileRequest$, requestCodeViewerFile } from "../codeViewerRequests";
import { getCodeLanguage, getLaunchCodeFile, isCodePath } from "../codeFiles";

jest.mock("@legend-apps/document-app", () => ({
  getLaunchDocumentPath: jest.fn(() => null),
  getFilename: (path: string) => path.split("/").pop(),
  openSelectedDocumentPath: jest.fn(),
  useWatchedDocumentReload: jest.fn(),
}));
jest.mock("@legend-apps/recent-documents", () => ({ noteRecentDocument: jest.fn() }));
jest.mock("@legend-apps/source-editor", () => ({ SourceDocumentEditor: "SourceDocumentEditor" }));
jest.mock("@legend-apps/source-viewer", () => ({
  SourceDocumentView: () => { throw new Error("The old viewer must not mount"); },
  useSourceDocumentRows: () => { throw new Error("The old tokenization pipeline must not run"); },
}));
jest.mock("@legend-apps/storage", () => ({ createStorage: jest.fn(() => ({})) }));
jest.mock("@legend-apps/syntax-parser", () => ({
  loadCodeFile: jest.fn(),
  getSyntaxLanguageForPath: jest.requireActual("../../../../packages/syntax-parser/src/syntaxAssets").getSyntaxLanguageForPath,
}));
jest.mock("../codeWindows", () => ({ setCodeViewerWindowOptions: jest.fn(async () => {}) }));
jest.mock("../codeSettings", () => ({
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
  const editor = () => renderer.root.findByType("SourceDocumentEditor" as never);
  const openButton = () => renderer.root.findAll((node) =>
    node.props.accessibilityRole === "button" && typeof node.props.onPress === "function")[0];

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    jest.replaceProperty(process, "argv", ["node", "code"]);
    jest.mocked(getLaunchDocumentPath).mockReturnValue(null);
    jest.mocked(useCodeSyntaxThemeSetting).mockReturnValue("dark");
    jest.mocked(useCodeSyntaxHighlightingEnabledSetting).mockReturnValue(true);
    codeViewerFileRequest$.set({ path: null, version: 0 });
  });
  afterEach(async () => {
    if (renderer) await act(async () => renderer.unmount());
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it("opens directly in the editor without loading or mounting the old viewer", async () => {
    await act(async () => { renderer = create(<CodeViewerWindow launchArguments={[]} />); });
    expect(JSON.stringify(renderer.toJSON())).toContain("No file open");
    expect(JSON.stringify(renderer.toJSON())).toContain("Edits are not saved");
    expect(openButton().props.accessibilityLabel).toBe("Open File");
    expect(renderer.root.findAllByType("SourceDocumentEditor" as never)).toHaveLength(0);
    await act(async () => requestCodeViewerFile("/one.ts"));
    expect(editor().props.filePath).toBe("/one.ts");
    expect(editor().props.language).toBe("typescript");
    expect(editor().props.syntaxHighlightingEnabled).toBe(true);
    expect(editor().props.syntaxHighlightingMode).toBe("background");
    expect(renderer.root.findAll((node) => node.props.accessibilityRole === "button")).toHaveLength(0);
    expect(JSON.stringify(renderer.toJSON())).not.toContain("No file open");
    expect(JSON.stringify(renderer.toJSON())).not.toContain("Open scratch editor prototype");
    expect(renderer.root.findAllByType("List" as never)).toHaveLength(0);
    expect(loadCodeFile).not.toHaveBeenCalled();
    expect(useWatchedDocumentReload).not.toHaveBeenCalled();
    expect(noteRecentDocument).not.toHaveBeenCalled();
    await act(async () => editor().props.onLoad());
    expect(noteRecentDocument).toHaveBeenCalledWith("/one.ts");
  });

  it("opens launch files directly in the editor", async () => {
    jest.mocked(getLaunchDocumentPath).mockReturnValue("/launch.tsx");
    await act(async () => { renderer = create(<CodeViewerWindow launchArguments={["/launch.tsx"]} />); });
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
    await act(async () => requestCodeViewerFile("/one.ts"));
    const mountedEditor = editor();
    jest.mocked(useCodeSyntaxThemeSetting).mockReturnValue("github-light");
    await act(async () => renderer.update(<CodeViewerWindow />));
    expect(editor()).toBe(mountedEditor);
    expect(editor().props.syntaxTheme).toBe("github-light");
    jest.mocked(useCodeSyntaxHighlightingEnabledSetting).mockReturnValue(false);
    await act(async () => renderer.update(<CodeViewerWindow />));
    expect(editor()).toBe(mountedEditor);
    expect(editor().props.syntaxHighlightingEnabled).toBe(false);
    await act(async () => requestCodeViewerFile("/one.ts"));
    expect(editor()).toBe(mountedEditor);
    expect(loadCodeFile).not.toHaveBeenCalled();
  });

  it("replaces the editor only when switching to another file", async () => {
    await act(async () => { renderer = create(<CodeViewerWindow />); });
    await act(async () => requestCodeViewerFile("/one.ts"));
    const first = editor();
    await act(async () => requestCodeViewerFile("/two.tsx"));
    expect(editor()).not.toBe(first);
    expect(editor().props.filePath).toBe("/two.tsx");
    expect(editor().props.language).toBe("tsx");
  });

  it("keeps the empty state usable when the dialog cancels or fails, then opens a file", async () => {
    await act(async () => { renderer = create(<CodeViewerWindow />); });
    jest.mocked(openSelectedDocumentPath).mockResolvedValue(null);
    await act(async () => openButton().props.onPress());
    expect(openSelectedDocumentPath).toHaveBeenCalledWith(expect.objectContaining({ allowedFileTypes: [] }));
    expect(renderer.root.findAllByType("SourceDocumentEditor" as never)).toHaveLength(0);
    jest.mocked(openSelectedDocumentPath).mockRejectedValue(new Error("Dialog failed"));
    await act(async () => openButton().props.onPress());
    expect(renderer.root.findAllByType("SourceDocumentEditor" as never)).toHaveLength(0);
    expect(JSON.stringify(renderer.toJSON())).toContain("Dialog failed");
    jest.mocked(openSelectedDocumentPath).mockResolvedValue("/two.ts");
    await act(async () => openButton().props.onPress());
    expect(editor().props.filePath).toBe("/two.ts");
    expect(JSON.stringify(renderer.toJSON())).not.toContain("Dialog failed");
  });

  it("restarts initial requests for a new viewer dataset and cancels old overscan work", async () => {
    // Retain shared-list regression coverage even though Code no longer uses it.
    const requestRange = jest.fn();
    const onInitialRowsRequested = jest.fn();
    const list = () => renderer.root.findByType("List" as never);
    const render = (dataKey: string) => (
      <VirtualizedFixedDocumentList
        dataKey={dataKey} itemIndexes={[0, 1, 2]} rowHeight={22}
        getRow={() => undefined} renderRow={() => <></>}
        requestRange={requestRange} onInitialRowsRequested={onInitialRowsRequested}
        lineOverscan={10} overscanRequestDelayMs={80}
      />
    );
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
