import type { ReactNode } from "react";
import { useEffect, useRef } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { clamp } from "./geometry";
import { useMotion } from "./motion";

export function CodeWalkthrough({ source, lines, explanation, height = 580 }: {
  source: string; lines?: readonly [number, number]; explanation?: ReactNode; height?: number;
}) {
  const rows = source.split("\n");
  const start = lines ? clamp(lines[0], 1, rows.length) : 1;
  const end = lines ? clamp(lines[1], start, rows.length) : rows.length;
  const opacity = useMotion(rows.map((_, index) => index + 1 >= start && index + 1 <= end ? 1 : 0.25), 350);
  const scroll = useRef<ScrollView>(null);
  useEffect(() => { scroll.current?.scrollTo({ y: Math.max(0, (start - 2) * 42), animated: false }); }, [start]);
  return <View style={[styles.frame, { height }]}>
    <ScrollView ref={scroll} style={styles.code} contentContainerStyle={styles.codeContent}>
      {rows.map((line, index) => <View key={index} style={[styles.line, { opacity: opacity[index] ?? 1,
        backgroundColor: lines && index + 1 >= start && index + 1 <= end ? "#123444" : "transparent" }]}>
        <Text style={styles.number}>{index + 1}</Text><Text style={styles.source}>{line || " "}</Text>
      </View>)}
    </ScrollView>
    {explanation !== undefined && <View style={styles.explanation}>{explanation}</View>}
  </View>;
}
const styles = StyleSheet.create({
  frame: { flexDirection: "row", gap: 36 },
  code: { flex: 1, backgroundColor: "#07101e", borderRadius: 24 },
  codeContent: { padding: 24 },
  line: { flexDirection: "row", minHeight: 42, alignItems: "center", borderRadius: 6 },
  number: { color: "#64748b", width: 48, textAlign: "right", marginRight: 24, fontSize: 22, fontFamily: "Menlo" },
  source: { color: "#e0f2fe", fontSize: 25, lineHeight: 42, fontFamily: "Menlo", flexShrink: 1 },
  explanation: { width: 460, justifyContent: "center", gap: 24 },
});
