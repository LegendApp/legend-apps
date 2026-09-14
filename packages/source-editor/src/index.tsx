import { LegendList, useRecyclingState, type LegendListDataSourceRenderItemProps, type LegendListRef } from "@legendapp/list/react-native";
import { defaultSyntaxThemeName, detectGrammar } from "@legend-apps/syntax-parser";
import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { StyleSheet, Text, View } from "react-native";
import SourceEditorHost, { Commands } from "./SourceEditorHostNativeComponent";
import SourceEditorRow from "./SourceEditorRowNativeComponent";
import { createSourceProgress } from "./sourceProgress";
import { SourceProgressBanner } from "./SourceProgressBanner";
import { useEmbeddedGrammars, useTreeGrammar } from "./useTreeGrammar";
import { GrammarProgressBanner } from "./GrammarProgressBanner";
import { SourceLanguageSelector } from "./SourceLanguageSelector";
import { SourceLineDataSource, type SourceAppend, type SourceEdit, type SourceLine } from "./SourceLineDataSource";

export type SourceDocumentEditorProps = {
  ref?: Ref<SourceDocumentEditorHandle>;
  onDocumentState?: (state: { dirty: boolean; path: string }) => void;
  /** UTF-8 input; disk changes only through explicit save/saveAs commands. */
  filePath: string;
  /** Optional in-memory seed. Remount with a new key to replace the document. */
  initialSource?: string;
  onSelectionChange?: (selection: { line: number; start: number; length: number }) => void;
  fontFamily?: string;
  fontSize?: number;
  foreground?: string;
  wrap?: boolean;
  language?: string;
  indentUnit?: string;
  automaticPairs?: boolean;
  /** Offer an override without replacing the document, selection, or undo history. */
  showLanguageSelector?: boolean;
  syntaxTheme?: string;
  /** Unknown or unavailable languages remain plain text; grammars download on demand. */
  syntaxBackend?: "tree-sitter";
  syntaxHighlightingEnabled?: boolean;
  /** Background retains tokens for the entire file; viewport limits eager work. */
  syntaxHighlightingMode?: "viewport" | "background";
  onLoad?: () => void;
  onChange?: (change: SourceEdit) => void;
};
export type SourceDocumentEditorHandle = {
  command: (command: string, argument?: string) => Promise<boolean>;
};

function EditorLine({ item, index, fontFamily, fontSize, foreground, wrap }: {
  item: SourceLine; index: number; fontFamily: string; fontSize: number; foreground: string; wrap: boolean;
}) {
  const lineHeight = Math.ceil(fontSize * 1.6);
  const [height, setHeight] = useRecyclingState(lineHeight);
  return <SourceEditorRow
    lineId={item.id} lineIndex={index} fontFamily={fontFamily} fontSize={fontSize}
    lineHeight={lineHeight} foreground={foreground} wrap={wrap}
    onMetrics={({ nativeEvent }) => {
      if (nativeEvent.lineId === item.id) setHeight(nativeEvent.height);
    }}
    style={{ height: wrap ? height : lineHeight }}
  />;
}

export function SourceDocumentEditor({ ref, onDocumentState, filePath, fontFamily = "Menlo", fontSize = 14, foreground = "#eeeeee", wrap = true, indentUnit = "  ", automaticPairs = true,
  language: preferredLanguage, showLanguageSelector = true, syntaxTheme = defaultSyntaxThemeName, syntaxHighlightingEnabled = true,
  syntaxHighlightingMode = "viewport", syntaxBackend = "tree-sitter", onChange, onLoad, initialSource, onSelectionChange,
}: SourceDocumentEditorProps) {
  const host = useRef<React.ElementRef<typeof SourceEditorHost>>(null);
  const pending = useRef(new Map<number, { resolve: (value: boolean) => void; reject: (error: Error) => void }>());
  const requestId = useRef(0);
  useImperativeHandle(ref, () => ({
    command(command, argument = "") {
      return new Promise<boolean>((resolve, reject) => {
        if (!host.current) { resolve(false); return; }
        const id = ++requestId.current;
        pending.current.set(id, { resolve, reject });
        Commands.execute(host.current, id, command, argument);
      });
    },
  }), []);
  useEffect(() => () => {
    for (const request of pending.current.values()) request.resolve(false);
    pending.current.clear();
  }, []);
  const [dataSource, setDataSource] = useState<SourceLineDataSource | null>(null);
  const [error, setError] = useState("");
  const [syntaxError, setSyntaxError] = useState("");
  const [loadingTail, setLoadingTail] = useState(false);
  const [progress] = useState(createSourceProgress);
  const [sourcePrefix, setSourcePrefix] = useState(() => initialSource?.slice(0, 512) ?? "");
  const [languageOverride, setLanguageOverride] = useState("auto");
  const language = languageOverride === "auto" ? preferredLanguage || detectGrammar(filePath, sourcePrefix) : languageOverride;
  const grammar = useTreeGrammar(language, syntaxBackend === "tree-sitter" && syntaxHighlightingEnabled);
  const embeddedGrammars = useEmbeddedGrammars(filePath);
  // The native resolver reads installed assets or the app's resource bundles.
  // Do not synchronously visit development repo paths on the JS thread.
  const highlighting = syntaxHighlightingEnabled && !!language
    && (syntaxBackend !== "tree-sitter" || (grammar.known && grammar.ready));
  const highlightError = syntaxHighlightingEnabled ? syntaxError : "";
  const list = useRef<LegendListRef>(null);
  const sourceRef = useRef<SourceLineDataSource | null>(null);
  const renderItem = ({ item, index }: LegendListDataSourceRenderItemProps<SourceLine>) => item
    ? <EditorLine item={item} index={index} fontFamily={fontFamily} fontSize={fontSize} foreground={foreground} wrap={wrap} /> : null;

  return <SourceEditorHost
    ref={host}
    automaticPairs={automaticPairs}
    indentUnit={indentUnit}
    onDocumentState={({ nativeEvent }) => onDocumentState?.(nativeEvent)}
    onCommandResult={({ nativeEvent }) => {
      const request = pending.current.get(nativeEvent.id);
      pending.current.delete(nativeEvent.id);
      if (nativeEvent.error) request?.reject(new Error(nativeEvent.error)); else request?.resolve(nativeEvent.allowed);
    }}
    documentPath={filePath}
    initialSource={initialSource}
    useInitialSource={initialSource !== undefined}
    syntaxLanguage={syntaxBackend === "tree-sitter" ? grammar.name : language}
    syntaxBackend={syntaxBackend}
    grammarRevision={embeddedGrammars.revision}
    onGrammarRequired={({ nativeEvent }) => embeddedGrammars.request(nativeEvent.language)}
    syntaxTheme={syntaxTheme}
    syntaxHighlightingEnabled={highlighting}
    syntaxHighlightingInBackground={syntaxHighlightingMode === "background"}
    onSyntaxError={({ nativeEvent }) => setSyntaxError(nativeEvent.error)}
    onProgress={({ nativeEvent }) => progress.update(nativeEvent)}
    style={styles.root}
    onReady={({ nativeEvent }) => {
      setError(nativeEvent.error);
      setSourcePrefix(nativeEvent.sourcePrefix ?? "");
      setLoadingTail(!nativeEvent.complete && !nativeEvent.error);
      if (!nativeEvent.error) {
        const source = new SourceLineDataSource(nativeEvent.lineCount, nativeEvent.firstId);
        sourceRef.current = source;
        setDataSource(source);
        onLoad?.();
      }
    }}
    onAppend={({ nativeEvent }) => {
      if (nativeEvent.error) { setError(nativeEvent.error); setLoadingTail(false); }
      if (nativeEvent.complete) setLoadingTail(false);
      try {
        if (nativeEvent.json) {
          const change = JSON.parse(nativeEvent.json) as SourceAppend | SourceEdit;
          if ("retainedId" in change) sourceRef.current?.append(change);
          else sourceRef.current?.apply(change);
        }
      } catch (cause) { setError(String(cause)); }
    }}
    onEdit={({ nativeEvent }) => {
      try {
        const edit = JSON.parse(nativeEvent.json) as SourceEdit;
        sourceRef.current?.apply(edit);
        onChange?.(edit);
      } catch (cause) { setError(String(cause)); }
    }}
    onSelection={({ nativeEvent }) => {
      onSelectionChange?.(nativeEvent);
      const state = list.current?.getState();
      if (state && (nativeEvent.line < state.start || nativeEvent.line > state.end)) {
        void list.current?.scrollToIndex({ index: nativeEvent.line, animated: false });
      }
    }}
  >
    {error ? <Text style={styles.error}>{error}</Text> : null}
    {highlightError ? <Text style={styles.error}>Syntax highlighting unavailable: {highlightError}</Text> : null}
    {dataSource ? <LegendList
      ref={list}
      dataSource={dataSource}
      dataKey={filePath}
      renderItem={renderItem}
      recycleItems
      estimatedItemSize={Math.ceil(fontSize * 1.6)}
      maintainVisibleContentPosition
      style={styles.root}
    /> : !error ? <View><Text style={{ color: foreground }}>Loading editor…</Text></View> : null}
    {!error && !highlightError && (syntaxBackend === "tree-sitter" && syntaxHighlightingEnabled
      ? <GrammarProgressBanner languages={[grammar.name, ...embeddedGrammars.languages]} progress={progress} loading={loadingTail} />
      : <SourceProgressBanner progress={progress} loading={loadingTail} />)}
    {showLanguageSelector && <SourceLanguageSelector value={languageOverride} onChange={setLanguageOverride} />}
  </SourceEditorHost>;
}
const styles = StyleSheet.create({
  root: { flex: 1 },
  error: { color: "#ff8080", padding: 12 },
});
