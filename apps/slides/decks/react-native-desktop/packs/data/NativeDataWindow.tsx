import { StyleSheet, Text, View } from "react-native";
import { stage, useEffectTime } from "../shared/effectRuntime";

const visibleRows = ["Title", "Timestamp", "Preview", "Source", "Metadata"];

export function NativeDataWindow() {
  const time = useEffectTime(5.5);

  return (
    <View style={styles.frame}>
      <View style={styles.document}>
        <Text style={styles.eyebrow}>NATIVE DOCUMENT</Text>
        <Text style={styles.documentSize}>228 MiB</Text>
        <Text style={styles.documentDetail}>memory mapped · selectively parsed</Text>
        <View style={styles.dataTexture}>
          {Array.from({ length: 26 }, (_, index) => (
            <View key={index} style={[styles.dataLine, { opacity: 0.18 + index % 4 * 0.12, width: `${38 + (index * 29) % 58}%` }]} />
          ))}
        </View>
      </View>
      <View style={styles.boundary}>
        <Text style={styles.boundaryLabel}>NATIVE BOUNDARY</Text>
      </View>
      {visibleRows.map((row, index) => {
        const travel = stage(time, 0.7 + index * 0.32, 2.1);
        const sourceY = 120 + index * 68;
        const targetY = 88 + index * 82;
        return (
          <View
            key={row}
            style={[
              styles.packet,
              {
                left: 580 + travel * 330,
                top: sourceY + (targetY - sourceY) * travel,
                transform: [{ scale: 0.72 + travel * 0.28 }],
              },
            ]}
          >
            <View style={styles.packetDot} />
            <Text style={styles.packetText}>{row}</Text>
          </View>
        );
      })}
      <View style={styles.reactPanel}>
        <Text style={styles.eyebrow}>REACT REQUESTS</Text>
        <Text style={styles.panelTitle}>Only what is visible</Text>
        {visibleRows.map((row, index) => {
          const appear = stage(time, 2.3 + index * 0.32, 0.7);
          return <View key={row} style={[styles.visibleRow, { opacity: appear, transform: [{ translateX: (1 - appear) * 28 }] }]} />;
        })}
      </View>
      <Text style={styles.caption}>Ownership stays native. Small answers cross on demand.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  boundary: { alignItems: "center", backgroundColor: "#67e8f9", height: 470, justifyContent: "center", left: 820, position: "absolute", top: 44, width: 3 },
  boundaryLabel: { color: "#67e8f9", fontSize: 16, fontWeight: "700", letterSpacing: 3, position: "absolute", transform: [{ rotate: "-90deg" }], width: 220 },
  caption: { bottom: 12, color: "#94a3b8", fontSize: 24, left: 40, position: "absolute" },
  dataLine: { backgroundColor: "#38bdf8", borderRadius: 2, height: 4, marginBottom: 10 },
  dataTexture: { marginTop: 34, opacity: 0.7 },
  document: { backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: 26, borderWidth: 2, height: 470, left: 40, padding: 34, position: "absolute", top: 44, width: 650 },
  documentDetail: { color: "#94a3b8", fontSize: 22, marginTop: 10 },
  documentSize: { color: "#fff", fontSize: 68, fontWeight: "700", marginTop: 12 },
  eyebrow: { color: "#67e8f9", fontSize: 18, fontWeight: "700", letterSpacing: 4 },
  frame: { height: 580, overflow: "hidden", position: "relative", width: 1680 },
  packet: { alignItems: "center", flexDirection: "row", gap: 10, position: "absolute", zIndex: 3 },
  packetDot: { backgroundColor: "#67e8f9", borderRadius: 8, height: 16, shadowColor: "#67e8f9", shadowOpacity: 0.8, shadowRadius: 10, width: 16 },
  packetText: { color: "#cffafe", fontSize: 17, fontWeight: "600" },
  panelTitle: { color: "#fff", fontSize: 38, fontWeight: "700", marginBottom: 32, marginTop: 12 },
  reactPanel: { backgroundColor: "#020617", borderColor: "#155e75", borderRadius: 26, borderWidth: 2, height: 470, padding: 34, position: "absolute", right: 40, top: 44, width: 650 },
  visibleRow: { backgroundColor: "#164e63", borderColor: "#22d3ee", borderRadius: 12, borderWidth: 1, height: 54, marginBottom: 12 },
});
