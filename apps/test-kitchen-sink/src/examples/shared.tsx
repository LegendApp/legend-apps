import { type ReactNode } from "react";
import { type GestureResponderEvent, Pressable, StyleSheet, Text, View } from "react-native";

export function ExamplePanel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.examplePanel}>
      <Text style={styles.panelTitle}>{title}</Text>
      <View style={styles.exampleControls}>{children}</View>
    </View>
  );
}

export function ExampleButton({
  children,
  onPress,
}: {
  children: string;
  onPress: (event: GestureResponderEvent) => void;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.button, pressed && styles.buttonPressed]}>
      <Text style={styles.buttonText}>{children}</Text>
    </Pressable>
  );
}

export function formatFirstPaths(paths: readonly { fileName?: string; relativePath?: string }[]) {
  if (!paths.length) {
    return "No files in the latest batch.";
  }
  return paths
    .slice(0, 5)
    .map((item) => item.relativePath ?? item.fileName ?? "Unknown")
    .join("\n");
}

export const styles = StyleSheet.create({
  bodyText: {
    color: "#334155",
    fontSize: 14,
    lineHeight: 20,
    textAlign: "center",
  },
  button: {
    backgroundColor: "#111827",
    borderRadius: 6,
    minWidth: 180,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  buttonPressed: {
    backgroundColor: "#374151",
  },
  buttonText: {
    color: "#ffffff",
    fontSize: 14,
    fontWeight: "700",
    textAlign: "center",
  },
  childWindow: {
    alignItems: "center",
    backgroundColor: "#f8fafc",
    flex: 1,
    gap: 14,
    justifyContent: "center",
    padding: 24,
  },
  controlRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
    maxWidth: 640,
  },
  dragSource: {
    backgroundColor: "#ffffff",
    borderColor: "#94a3b8",
    borderRadius: 8,
    borderWidth: 1,
    gap: 4,
    paddingHorizontal: 16,
    paddingVertical: 12,
    width: 320,
  },
  dropTarget: {
    alignItems: "center",
    backgroundColor: "#e0f2fe",
    borderColor: "#0284c7",
    borderRadius: 8,
    borderStyle: "dashed",
    borderWidth: 2,
    gap: 8,
    height: 180,
    justifyContent: "center",
    padding: 16,
    width: 420,
  },
  exampleControls: {
    alignItems: "center",
    gap: 12,
    maxWidth: 520,
  },
  examplePanel: {
    alignItems: "center",
    backgroundColor: "#f8fafc",
    flex: 1,
    gap: 18,
    justifyContent: "center",
    padding: 24,
  },
  glassPreview: {
    alignItems: "center",
    borderRadius: 10,
    gap: 10,
    height: 180,
    justifyContent: "center",
    overflow: "hidden",
    width: 320,
  },
  launcher: {
    backgroundColor: "#f8fafc",
    flex: 1,
  },
  launcherContent: {
    alignItems: "center",
    padding: 28,
    paddingBottom: 64,
  },
  launcherHeader: {
    alignItems: "center",
    gap: 8,
    marginBottom: 24,
  },
  launcherRoot: {
    backgroundColor: "#f8fafc",
    flex: 1,
  },
  launcherTitle: {
    color: "#111827",
    fontSize: 24,
    fontWeight: "700",
  },
  markdownBlockRow: {
    alignSelf: "stretch",
  },
  markdownEditorInput: {
    color: "#334155",
    fontSize: 14,
    lineHeight: 21,
    minHeight: 28,
    paddingVertical: 2,
  },
  markdownList: {
    backgroundColor: "#e2e8f0",
    flex: 1,
    width: "100%",
  },
  markdownListContent: {
    alignSelf: "center",
    backgroundColor: "#ffffff",
    gap: 4,
    maxWidth: 820,
    minHeight: "100%",
    paddingHorizontal: 56,
    paddingVertical: 48,
    width: "100%",
  },
  markdownRenderedText: {
    paddingVertical: 2,
  },
  markdownViewerActions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    justifyContent: "center",
  },
  markdownViewerHeader: {
    alignItems: "center",
    borderBottomColor: "#cbd5e1",
    borderBottomWidth: 1,
    gap: 10,
    padding: 16,
  },
  markdownViewerPanel: {
    backgroundColor: "#f8fafc",
    flex: 1,
  },
  panelTitle: {
    color: "#111827",
    fontSize: 18,
    fontWeight: "700",
  },
  packageList: {
    gap: 16,
    maxWidth: 720,
    width: "100%",
  },
  packageSection: {
    borderColor: "#cbd5e1",
    borderRadius: 8,
    borderWidth: 1,
    overflow: "hidden",
  },
  packageTitle: {
    backgroundColor: "#e2e8f0",
    color: "#0f172a",
    fontSize: 15,
    fontWeight: "700",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  root: {
    backgroundColor: "#f8fafc",
    flex: 1,
  },
  resultText: {
    color: "#334155",
    fontSize: 12,
    lineHeight: 18,
    maxWidth: 560,
    textAlign: "left",
  },
  searchInput: {
    height: 32,
    width: 320,
  },
  sidebarDynamicRow: {
    flex: 1,
    gap: 4,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  sidebarPreview: {
    backgroundColor: "#ffffff",
    borderColor: "#cbd5e1",
    borderRadius: 8,
    borderWidth: 1,
    height: 210,
    overflow: "hidden",
    width: 320,
  },
  sidebarReactItem: {
    height: 44,
  },
  sidebarReactRow: {
    flex: 1,
    gap: 2,
    justifyContent: "center",
    paddingHorizontal: 12,
  },
  sidebarRowDetail: {
    color: "#64748b",
    fontSize: 12,
  },
  sidebarRowTitle: {
    color: "#111827",
    fontSize: 13,
    fontWeight: "700",
  },
  symbolGrid: {
    alignItems: "center",
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 20,
    justifyContent: "center",
    maxWidth: 560,
  },
  symbolTile: {
    alignItems: "center",
    gap: 10,
    minHeight: 112,
    width: 160,
  },
  testId: {
    color: "#64748b",
    fontSize: 12,
  },
  testRow: {
    backgroundColor: "#ffffff",
    borderColor: "#e2e8f0",
    borderTopWidth: 1,
    gap: 2,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  testRowPressed: {
    backgroundColor: "#f1f5f9",
  },
  testTitle: {
    color: "#111827",
    fontSize: 14,
    fontWeight: "600",
  },
  visualPanel: {
    alignItems: "center",
    backgroundColor: "#dbeafe",
    flex: 1,
    justifyContent: "center",
  },
  versionBadge: {
    backgroundColor: "rgba(15, 23, 42, 0.72)",
    borderRadius: 6,
    bottom: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    position: "absolute",
    right: 12,
  },
  versionBadgeText: {
    color: "#ffffff",
    fontSize: 12,
    fontWeight: "700",
  },
  windowManagerControls: {
    alignItems: "center",
    gap: 12,
    paddingBottom: 24,
  },
  windowManagerPanel: {
    alignItems: "center",
    backgroundColor: "#f8fafc",
    flex: 1,
    gap: 12,
    padding: 24,
  },
  windowManagerScroll: {
    maxWidth: 520,
    width: "100%",
  },
});
