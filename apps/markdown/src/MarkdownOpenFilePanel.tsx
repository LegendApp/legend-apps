import { useRoutedHotkeys } from "@legendapp/spark/shortcuts/commands";
import { TextInputSearch, type TextInputSearchRef } from "@legendapp/spark/ui/search";
import { listWorkspaceFiles } from "@legend-apps/workspace";
import { useEffect, useMemo, useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { getRecentMarkdownFiles } from "./appMetadata";
import { isMarkdownPath } from "./markdownFiles";
import { markdownHotkeyRouter } from "./markdownHotkeys";
import { findOpenFileResults } from "./markdownOpenFile";

const rowHeight = 28;
/** The pane body Open File needs: its 26 pt of margins, 2 pt of borders, the 38 pt search header, a 22 pt results viewport and the 32 pt footer. */
export const openFilePanelMinHeight = 120;
const panelDefinitions = [
  { id: "next", title: "Next File", defaultBindings: ["Down"], repeat: true },
  { id: "previous", title: "Previous File", defaultBindings: ["Up"], repeat: true },
  { id: "open", title: "Open File", defaultBindings: ["Enter"] },
  { id: "dismiss", title: "Dismiss Open File", defaultBindings: ["Escape"] },
];

export type MarkdownOpenFilePanelProps = {
  folders: readonly string[];
  /** The footer's Open File: dismisses the panel for the system picker. */
  onBrowse: () => void;
  onDismiss: () => void;
  onError: (error: unknown) => void;
  onOpen: (path: string) => void;
  windowId: string;
};

/** Open File over a pane: searches the Markdown files of every workspace folder, recent ones first. */
export function MarkdownOpenFilePanel({ folders, onBrowse, onDismiss, onError, onOpen, windowId }: MarkdownOpenFilePanelProps) {
  const [files, setFiles] = useState<string[] | null>(null);
  const [query, setQuery] = useState("");
  const [highlighted, setHighlighted] = useState(0);
  // autoFocus does not take focus on macOS here, so focus once the panel is in the window.
  const input = useRef<TextInputSearchRef>(null);
  useEffect(() => {
    const timeout = setTimeout(() => input.current?.focus(), 0);
    return () => clearTimeout(timeout);
  }, []);
  useEffect(() => {
    let current = true;
    setFiles(null);
    // Unreadable directories go to onError while the rest still list, so this never rejects.
    void listWorkspaceFiles(folders, onError).then(found => { if (current) setFiles(found.filter(isMarkdownPath)); });
    return () => { current = false; };
  }, [folders, onError]);
  const results = useMemo(
    () => files ? findOpenFileResults(files, folders, getRecentMarkdownFiles().map(file => file.path), query) : [],
    [files, folders, query],
  );
  const selectedIndex = Math.min(highlighted, results.length - 1);
  const selected = results[selectedIndex];
  // Keeps the highlighted row in view as the keyboard moves it.
  const scroll = useRef<ScrollView>(null);
  const offset = useRef(0);
  const viewportHeight = useRef(0);
  useEffect(() => {
    const height = viewportHeight.current;
    if (selectedIndex < 0 || !height) return;
    const top = selectedIndex * rowHeight;
    if (top < offset.current) scroll.current?.scrollTo({ animated: false, y: top });
    else if (top + rowHeight > offset.current + height) scroll.current?.scrollTo({ animated: false, y: top + rowHeight - height });
  }, [selectedIndex]);

  useRoutedHotkeys({
    definitions: panelDefinitions,
    handlers: {
      dismiss: onDismiss,
      next: () => setHighlighted(index => Math.min(index + 1, results.length - 1)),
      open: () => { if (selected) onOpen(selected.path); },
      previous: () => setHighlighted(index => Math.max(index - 1, 0)),
    },
    router: markdownHotkeyRouter,
    scope: { kind: "window", windowId },
    onError,
  });

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable accessible={false} onPress={onDismiss} style={StyleSheet.absoluteFill} />
      {/* The shadow sits outside the clipped panel, which would clip it too. */}
      <View className="bg-surface" style={styles.shadow}>
        <View accessibilityLabel="Open File" accessibilityRole="menu" className="border border-border" style={styles.panel}>
          <View className="border-b border-border" style={styles.header}>
            <TextInputSearch
              accessibilityLabel="Search Markdown files"
              onChangeText={text => { setQuery(text); setHighlighted(0); }}
              placeholder="Search files"
              ref={input}
              style={styles.input}
              value={query}
            />
          </View>
          <ScrollView
            keyboardShouldPersistTaps="always"
            onLayout={event => { viewportHeight.current = event.nativeEvent.layout.height; }}
            onScroll={event => { offset.current = event.nativeEvent.contentOffset.y; }}
            ref={scroll}
            scrollEventThrottle={32}
            style={styles.results}
          >
            {results.map(result => (
              <Pressable
                accessibilityLabel={`${result.name}, ${result.directory}`}
                accessibilityRole="menuitem"
                accessibilityState={{ selected: result === selected }}
                className={result === selected ? "bg-surface-muted" : undefined}
                key={result.path}
                onHoverIn={() => setHighlighted(results.indexOf(result))}
                onPress={() => onOpen(result.path)}
                style={styles.row}
              >
                <Text className="text-foreground" numberOfLines={1} style={styles.name}>{result.name}</Text>
                <Text className="text-muted" numberOfLines={1} style={styles.directory}>{result.directory}</Text>
              </Pressable>
            ))}
            {files && results.length === 0
              ? <Text className="text-muted" style={styles.empty}>{query.trim() ? "No matching files" : "No recent files"}</Text>
              : null}
          </ScrollView>
          <Pressable accessibilityRole="button" className="border-t border-border" onPress={onBrowse} style={styles.footer}>
            <Text className="text-foreground" style={styles.name}>Open File</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  directory: {
    flexShrink: 1,
    fontSize: 11,
  },
  empty: {
    fontSize: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  footer: {
    height: 32,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  header: {
    height: 38,
    justifyContent: "center",
    paddingHorizontal: 6,
  },
  input: {
    height: 28,
  },
  name: {
    flexShrink: 0,
    fontSize: 13,
  },
  panel: {
    borderRadius: 8,
    flexShrink: 1,
    overflow: "hidden",
  },
  shadow: {
    alignSelf: "center",
    borderRadius: 8,
    // The panel shrinks to the pane, taking its rows from the results so the search field and footer stay.
    flexShrink: 1,
    marginBottom: 8,
    marginTop: 18,
    maxWidth: "90%",
    shadowColor: "#000000",
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    width: 440,
  },
  results: {
    maxHeight: 320,
  },
  row: {
    alignItems: "baseline",
    flexDirection: "row",
    gap: 8,
    height: rowHeight,
    paddingHorizontal: 12,
    paddingTop: 6,
  },
});
