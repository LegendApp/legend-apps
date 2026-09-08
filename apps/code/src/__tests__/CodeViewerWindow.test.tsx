import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { loadCodeFile, type SyntaxFileLoadResult, type SyntaxDocument } from "@legend-apps/syntax-parser";
import { SourceDocumentView } from "@legend-apps/source-viewer";
import { VirtualizedFixedDocumentList } from "@legend-apps/virtualized-document";
import { CodeViewerWindow } from "../CodeViewerWindow";
import { codeViewerFileRequest$, requestCodeViewerFile } from "../codeViewerRequests";

jest.mock("@legend-apps/document-app", () => ({
  getLaunchDocumentPath: jest.fn(() => null),
  getFilename: (path: string) => path.split("/").pop(),
  openSelectedDocumentPath: jest.fn(),
  useWatchedDocumentReload: jest.fn(),
}));
jest.mock("@legend-apps/recent-documents", () => ({ noteRecentDocument: jest.fn() }));
jest.mock("@legend-apps/syntax-parser", () => ({ loadCodeFile: jest.fn() }));
jest.mock("../codeWindows", () => ({ setCodeViewerWindowOptions: jest.fn(async () => {}) }));
jest.mock("../codeSettings", () => ({
  useCodeFontFamilySetting: () => "Menlo",
  useCodeFontSizeSetting: () => 13,
  useCodeSyntaxHighlightingEnabledSetting: () => true,
  useCodeSyntaxThemeSetting: () => "dark",
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

function makeDocument(text: string, lineCount = 200): SyntaxFileLoadResult {
  const lines = [{ text, tokens: [], index: 0 }];
  const timing = { lineCount, tokenCount: 0, totalMs: 0, colorCount: 0, contextMs: 0, indexLinesMs: 0, initialLinesMs: 0, mapFileMs: 0, tokenizeMs: 0 };
  const document = {
    lineCount,
    getPlainLines: jest.fn(() => lines),
    getRenderLines: jest.fn(() => lines),
    getStyles: jest.fn(() => []),
    getTiming: jest.fn(() => timing),
    startBackgroundTokenization: jest.fn(),
    stopBackgroundTokenization: jest.fn(),
  };
  return { document: document as unknown as SyntaxDocument, initialLines: lines, styles: [], timing };
}

describe("Code document list reuse", () => {
  let renderer: ReactTestRenderer;
  const pending: { resolve: (value: ReturnType<typeof makeDocument>) => void; reject: (error: Error) => void }[] = [];
  const list = () => renderer.root.findByType("List" as never);

  beforeEach(() => {
    jest.useFakeTimers();
    codeViewerFileRequest$.set({ path: null, version: 0 });
    pending.length = 0;
    jest.mocked(loadCodeFile).mockImplementation(() => new Promise((resolve, reject) => {
      pending.push({ resolve, reject });
    }));
  });
  afterEach(async () => {
    if (renderer) await act(async () => renderer.unmount());
    jest.useRealTimers();
  });

  it("keeps one list through loading, replacement, errors, and empty documents", async () => {
    await act(async () => { renderer = create(<CodeViewerWindow />); });
    const mountedList = list();
    expect(JSON.stringify(renderer.toJSON())).toContain("No code file open");
    await act(async () => {
      list().props.onLayout({ nativeEvent: { layout: { height: 440 } } });
      requestCodeViewerFile("/one.ts");
    });
    expect(list()).toBe(mountedList);
    expect(list().props.data).toEqual([]);
    const first = makeDocument("first document");
    await act(async () => pending.shift()!.resolve(first));
    expect(list()).toBe(mountedList);
    expect(list().props.dataKey).toBe("/one.ts");
    expect(list().props.data).toHaveLength(200);
    expect(renderer.root.findByType(SourceDocumentView).props.sourceRows.getRow(0).text).toBe("first document");
    await act(async () => jest.advanceTimersByTime(100));
    expect(first.document.startBackgroundTokenization).toHaveBeenCalledTimes(1);

    await act(async () => requestCodeViewerFile("/two.ts"));
    expect(list()).toBe(mountedList);
    expect(list().props.data).toEqual([]);
    expect(renderer.root.findByType(SourceDocumentView).props.sourceRows.getRow(0)).toBeUndefined();
    expect(first.document.stopBackgroundTokenization).toHaveBeenCalled();
    const second = makeDocument("second document");
    await act(async () => pending.shift()!.resolve(second));
    // No second onLayout: native bounds are unchanged when switching files.
    await act(async () => jest.advanceTimersByTime(100));
    expect(list()).toBe(mountedList);
    expect(list().props.dataKey).toBe("/two.ts");
    expect(renderer.root.findByType(SourceDocumentView).props.sourceRows.getRow(0).text).toBe("second document");
    expect(second.document.startBackgroundTokenization).toHaveBeenCalledTimes(1);

    await act(async () => requestCodeViewerFile("/two.ts"));
    expect(list().props.data).toEqual([]);
    const reloaded = makeDocument("reloaded document");
    await act(async () => pending.shift()!.resolve(reloaded));
    await act(async () => jest.advanceTimersByTime(100));
    expect(list()).toBe(mountedList);
    expect(reloaded.document.startBackgroundTokenization).toHaveBeenCalledTimes(1);

    await act(async () => requestCodeViewerFile("/missing.ts"));
    await act(async () => pending.shift()!.reject(new Error("File not found")));
    expect(list()).toBe(mountedList);
    expect(list().props.data).toEqual([]);
    expect(JSON.stringify(renderer.toJSON())).toContain("File not found");
    await act(async () => requestCodeViewerFile("/empty.ts"));
    await act(async () => pending.shift()!.resolve(makeDocument("", 0)));
    expect(list()).toBe(mountedList);
    expect(list().props.data).toEqual([]);
  });

  it("restarts initial requests for a new dataset and cancels old overscan work", async () => {
    const requestRange = jest.fn();
    const onInitialRowsRequested = jest.fn();
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
