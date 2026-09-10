import { LegendList, useRecyclingState, type LegendListDataSourceRenderItemProps, type LegendListRef } from "@legendapp/list/react-native";
import { defaultSyntaxThemeName, ensureSyntaxGrammar, ensureSyntaxTheme, getSyntaxLanguageForPath } from "@legend-apps/syntax-parser";
import { useEffect, useRef, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import SourceEditorHost from "./SourceEditorHostNativeComponent";
import SourceEditorRow from "./SourceEditorRowNativeComponent";
import { SourceLineDataSource, type SourceEdit, type SourceLine } from "./SourceLineDataSource";

export type SourceDocumentEditorProps = {
  /** Prototype: UTF-8 input only, disk is never modified. */
  filePath: string;
  fontFamily?: string;
  fontSize?: number;
  foreground?: string;
  wrap?: boolean;
  language?: string;
  syntaxTheme?: string;
  syntaxHighlightingEnabled?: boolean;
  onLoad?: () => void;
  onChange?: (change: SourceEdit) => void;
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

export function SourceDocumentEditor({ filePath, fontFamily = "Menlo", fontSize = 14, foreground = "#eeeeee", wrap = true,
  language = getSyntaxLanguageForPath(filePath), syntaxTheme = defaultSyntaxThemeName, syntaxHighlightingEnabled = true, onChange, onLoad,
}: SourceDocumentEditorProps) {
  const [dataSource, setDataSource] = useState<SourceLineDataSource | null>(null);
  const [error, setError] = useState("");
  const [syntaxError, setSyntaxError] = useState("");
  const [assets, setAssets] = useState<{ language: string; theme: string; error: string } | null>(null);
  useEffect(() => {
    let active = true;
    if (syntaxHighlightingEnabled && language) {
      Promise.all([ensureSyntaxGrammar(language), ensureSyntaxTheme(syntaxTheme)])
        .then(() => { if (active) setAssets({ language, theme: syntaxTheme, error: "" }); })
        .catch((cause) => { if (active) setAssets({ language, theme: syntaxTheme, error: String(cause) }); });
    }
    return () => { active = false; };
  }, [language, syntaxTheme, syntaxHighlightingEnabled]);
  const currentAssets = assets?.language === language && assets.theme === syntaxTheme ? assets : null;
  const highlighting = syntaxHighlightingEnabled && !!language && !!currentAssets && !currentAssets.error;
  const highlightError = syntaxHighlightingEnabled ? currentAssets?.error || syntaxError : "";
  const list = useRef<LegendListRef>(null);
  const sourceRef = useRef<SourceLineDataSource | null>(null);
  const renderItem = ({ item, index }: LegendListDataSourceRenderItemProps<SourceLine>) => item
    ? <EditorLine item={item} index={index} fontFamily={fontFamily} fontSize={fontSize} foreground={foreground} wrap={wrap} /> : null;

  return <SourceEditorHost
    documentPath={filePath}
    syntaxLanguage={language}
    syntaxTheme={syntaxTheme}
    syntaxHighlightingEnabled={highlighting}
    onSyntaxError={({ nativeEvent }) => setSyntaxError(nativeEvent.error)}
    style={styles.root}
    onReady={({ nativeEvent }) => {
      setError(nativeEvent.error);
      if (!nativeEvent.error) {
        const source = new SourceLineDataSource(nativeEvent.source);
        sourceRef.current = source;
        setDataSource(source);
        onLoad?.();
      }
    }}
    onEdit={({ nativeEvent }) => {
      try {
        const edit = JSON.parse(nativeEvent.json) as SourceEdit;
        sourceRef.current?.apply(edit);
        onChange?.(edit);
      } catch (cause) { setError(String(cause)); }
    }}
    onSelection={({ nativeEvent }) => {
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
    /> : <View><Text style={{ color: foreground }}>Loading editor…</Text></View>}
  </SourceEditorHost>;
}
const styles = StyleSheet.create({ root: { flex: 1 }, error: { color: "#ff8080", padding: 12 } });
