import type { ReactNode } from "react";
import { PlatformColor, StyleSheet, Text, View } from "react-native";
import { SFSymbol } from "@legendapp/spark/ui/symbol";
import { useSymbolColor } from "./FileRow";

/** An info bar (Xcode/Safari pattern) across the top of the detail: a warning or error symbol, selectable text and trailing push buttons. */
export function StateBar({ tone, text, children }: { tone: "warning" | "error"; text: string; children?: ReactNode }) {
  const color = useSymbolColor(tone === "error" ? "red" : "yellow");
  return <View style={styles.root}>
    <SFSymbol name="exclamationmark.triangle.fill" color={color} size={13} style={styles.symbol} />
    <Text accessibilityRole="alert" selectable style={styles.text} numberOfLines={tone === "error" ? 6 : 2}>{text}</Text>
    {children}
  </View>;
}

const styles = StyleSheet.create({
  root: { flexDirection: "row", alignItems: "center", gap: 8, minHeight: 36, paddingHorizontal: 12, paddingVertical: 6, backgroundColor: PlatformColor("controlBackgroundColor"), borderBottomWidth: StyleSheet.hairlineWidth, borderColor: PlatformColor("separatorColor") },
  symbol: { width: 16, height: 16 },
  text: { flex: 1, fontSize: 12, lineHeight: 16, color: PlatformColor("labelColor") },
});
