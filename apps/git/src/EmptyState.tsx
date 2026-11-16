import type { ReactNode } from "react";
import { PlatformColor, StyleSheet, Text, View } from "react-native";
import { SFSymbol } from "@legendapp/spark/ui/symbol";
import { useSymbolColor } from "./FileRow";

/** A centered placeholder in the style of Mail's "No Message Selected" and Xcode's "No Selection". */
export function EmptyState({ symbol, title, message, children }: { symbol?: string; title: string; message?: string; children?: ReactNode }) {
  const color = useSymbolColor("tertiary");
  return <View style={styles.root}>
    {symbol ? <SFSymbol name={symbol} color={color} size={40} style={styles.symbol} /> : null}
    <Text style={styles.title}>{title}</Text>
    {message ? <Text style={styles.message}>{message}</Text> : null}
    {children ? <View style={styles.actions}>{children}</View> : null}
  </View>;
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40 },
  symbol: { marginBottom: 12 },
  title: { fontSize: 20, fontWeight: "600", color: PlatformColor("secondaryLabelColor"), textAlign: "center" },
  message: { marginTop: 6, fontSize: 13, color: PlatformColor("tertiaryLabelColor"), textAlign: "center" },
  actions: { marginTop: 20 },
});
