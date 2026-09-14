import React from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { SourceDocumentEditor } from "../index";

jest.mock("@legend-apps/syntax-parser", () => ({
  ...jest.requireActual("../../../syntax-parser/src/grammarDownloads"), defaultSyntaxThemeName: "dark-plus",
}));
jest.mock("@legend-apps/design-system", () => ({ SelectControl: "SelectControl" }));
jest.mock("../SourceEditorHostNativeComponent", () => "SourceEditorHost");
jest.mock("../SourceEditorRowNativeComponent", () => "SourceEditorRow");
jest.mock("../useTreeGrammar", () => ({
  useTreeGrammar: (name: string) => ({ name, known: !!name, ready: true }),
  useEmbeddedGrammars: () => ({ revision: 0, languages: [], request: jest.fn() }),
}));
jest.mock("../GrammarProgressBanner", () => ({ GrammarProgressBanner: () => null }));
jest.mock("../SourceProgressBanner", () => ({ SourceProgressBanner: () => null }));
jest.mock("@legendapp/list/react-native", () => ({ LegendList: "LegendList", useRecyclingState: jest.fn() }));

describe("shared editor language selection", () => {
  let renderer: ReactTestRenderer;
  afterEach(async () => { await act(async () => renderer?.unmount()); });
  const host = () => renderer.root.findByType("SourceEditorHost" as never);
  const select = () => renderer.root.findByType("SelectControl" as never);
  it("mounts the native host without a loading placeholder, then displays the ready document", async () => {
    const onLoad = jest.fn();
    await act(async () => { renderer = create(<SourceDocumentEditor filePath="/file.ts" showLanguageSelector={false} onLoad={onLoad} />); });
    const originalHost = host();
    expect(renderer.toJSON()).toMatchObject({ type: "SourceEditorHost", children: null });
    expect(onLoad).not.toHaveBeenCalled();
    await act(async () => host().props.onReady({ nativeEvent: {
      lineCount: 200, firstId: 1, complete: true, error: "", sourcePrefix: "",
    } }));
    expect(host()).toBe(originalHost);
    expect(renderer.root.findByType("LegendList" as never).props.dataSource.getLength()).toBe(200);
    expect(onLoad).toHaveBeenCalledTimes(1);
  });
  it("still displays file-loading errors instead of leaving an unexplained blank editor", async () => {
    await act(async () => { renderer = create(<SourceDocumentEditor filePath="/missing.ts" showLanguageSelector={false} />); });
    await act(async () => host().props.onReady({ nativeEvent: {
      lineCount: 0, firstId: 1, complete: true, error: "File not found", sourcePrefix: "",
    } }));
    expect(renderer.root.findByType("Text" as never).props.children).toBe("File not found");
    expect(renderer.root.findAllByType("LegendList" as never)).toHaveLength(0);
  });
  it("overlays the language selector without reserving space below the list", async () => {
    await act(async () => { renderer = create(<SourceDocumentEditor filePath="/file.ts" />); });
    await act(async () => host().props.onReady({ nativeEvent: {
      lineCount: 200, firstId: 1, complete: true, error: "", sourcePrefix: "",
    } }));
    const overlay = select().parent!;
    expect(overlay.props.className.split(" ")).toEqual(expect.arrayContaining(["absolute", "bottom-1", "right-10"]));
    expect(overlay.props.pointerEvents).toBe("box-none");
    expect(renderer.root.findByType("LegendList" as never).props.style).toEqual({ flex: 1 });
    await act(async () => renderer.update(<SourceDocumentEditor filePath="/file.ts" showLanguageSelector={false} />));
    expect(renderer.root.findAllByType("SelectControl" as never)).toHaveLength(0);
    expect(renderer.root.findByType("LegendList" as never).props.style).toEqual({ flex: 1 });
  });
  it("uses the bounded prefix for extensionless files and preserves the loaded buffer on override", async () => {
    await act(async () => { renderer = create(<SourceDocumentEditor filePath="/build" />); });
    const originalHost = host();
    expect(host().props.syntaxLanguage).toBe("");
    await act(async () => host().props.onReady({ nativeEvent: {
      lineCount: 20, firstId: 1, complete: true, error: "", sourcePrefix: "#!/usr/bin/env fish\n",
    } }));
    expect(host().props.syntaxLanguage).toBe("fish");
    const list = renderer.root.findByType("LegendList" as never);
    const source = list.props.dataSource;
    await act(async () => select().props.onChange("python"));
    expect(host()).toBe(originalHost);
    expect(host().props.syntaxLanguage).toBe("python");
    expect(renderer.root.findByType("LegendList" as never).props.dataSource).toBe(source);
    await act(async () => select().props.onChange(""));
    expect(host().props.syntaxHighlightingEnabled).toBe(false);
    await act(async () => select().props.onChange("auto"));
    expect(host().props.syntaxLanguage).toBe("fish");
  });
  it("allows overriding an explicit MDX preference without replacing its initial source", async () => {
    await act(async () => { renderer = create(<SourceDocumentEditor filePath="/deck.mdx" language="mdx" initialSource="# Deck" />); });
    const originalHost = host();
    expect(host().props.syntaxLanguage).toBe("mdx");
    await act(async () => select().props.onChange("markdown"));
    expect(host()).toBe(originalHost);
    expect(host().props.initialSource).toBe("# Deck");
    expect(host().props.syntaxLanguage).toBe("markdown");
    expect(select().props.options.some((option: { value: string }) => option.value === "markdown-inline")).toBe(false);
  });
});
