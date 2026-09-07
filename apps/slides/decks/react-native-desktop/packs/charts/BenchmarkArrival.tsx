import { StyleSheet, Text, View } from "react-native";
import { stage, useEffectTime } from "../shared/effectRuntime";

const results = [
  { color: "#67e8f9", label: "React Native", value: 394 },
  { color: "#64748b", label: "GPUI", value: 490 },
  { color: "#526580", label: "Tauri", value: 568 },
  { color: "#475569", label: "Electron", value: 792 },
];

export function BenchmarkArrival() {
  const time = useEffectTime(5.8);
  const impact = stage(time, 1.65, 0.32) * (1 - stage(time, 2.0, 0.8));

  return (
    <View style={styles.frame}>
      <Text style={styles.measure}>LAUNCH → STABLE FIRST CONTENT</Text>
      <View style={[styles.impact, { opacity: impact * 0.7, transform: [{ scale: 0.7 + impact * 1.5 }] }]} />
      {results.map((result, index) => {
        const arrival = stage(time, 0.45 + index * 0.7, 1.25);
        const width = result.value / 850 * 1120 * arrival;
        return (
          <View key={result.label} style={styles.result}>
            <Text style={[styles.label, index === 0 && styles.highlight]}>{result.label}</Text>
            <View style={styles.track}>
              <View style={[styles.bar, { backgroundColor: result.color, width }]} />
            </View>
            <Text style={[styles.value, index === 0 && styles.highlight]}>{Math.round(result.value * arrival)} ms</Text>
          </View>
        );
      })}
      <Text style={styles.caption}>Animate the comparison once. Leave the evidence readable.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { height: "100%" },
  caption: { bottom: 12, color: "#94a3b8", fontSize: 24, left: 40, position: "absolute" },
  frame: { height: 580, paddingHorizontal: 40, paddingTop: 46, position: "relative", width: 1680 },
  highlight: { color: "#67e8f9" },
  impact: { borderColor: "#67e8f9", borderRadius: 70, borderWidth: 3, height: 140, left: 360, position: "absolute", top: 54, width: 140 },
  label: { color: "#cbd5e1", fontSize: 28, width: 240 },
  measure: { color: "#67e8f9", fontSize: 18, fontWeight: "700", letterSpacing: 4, marginBottom: 34 },
  result: { alignItems: "center", flexDirection: "row", gap: 24, height: 88 },
  track: { backgroundColor: "#0f172a", height: 34, overflow: "hidden", width: 1120 },
  value: { color: "#e2e8f0", fontSize: 28, fontVariant: ["tabular-nums"], textAlign: "right", width: 150 },
});
