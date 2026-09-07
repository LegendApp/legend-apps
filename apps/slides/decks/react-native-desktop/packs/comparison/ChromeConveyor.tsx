import { StyleSheet, Text, View } from "react-native";
import { stage, useEffectTime } from "../shared/effectRuntime";

const labels = ["Rectangle", "Another rectangle", "Still a rectangle"];

export function ChromeConveyor() {
  const time = useEffectTime(6.1);
  const conveyor = stage(time, 0.35, 2.55);
  const native = stage(time, 2.65, 2.1);
  const selected = stage(time, 4.25, 0.65);

  return (
    <View style={styles.frame}>
      <View style={[styles.boringTrack, { opacity: 1 - native * 0.8, transform: [{ translateX: -conveyor * 520 }] }]}>
        {labels.map((label, index) => (
          <View key={label} style={[styles.boringWindow, { opacity: 0.92 - index * 0.15 }]}>
            <View style={styles.boringTitlebar} />
            <View style={styles.boringSidebar}>
              {Array.from({ length: 5 }, (_, row) => <View key={row} style={[styles.boringRow, { width: 155 + (row % 2) * 50 }]} />)}
            </View>
            <Text style={styles.boringLabel}>{label}</Text>
          </View>
        ))}
      </View>
      <View
        style={[
          styles.nativeWindow,
          {
            opacity: native,
            transform: [{ translateX: (1 - native) * 380 }, { scale: 0.86 + native * 0.14 }],
          },
        ]}
      >
        <View style={styles.nativeTitlebar}>
          {["#fb7185", "#fbbf24", "#4ade80"].map((color) => <View key={color} style={[styles.dot, { backgroundColor: color }]} />)}
          <Text style={styles.nativeTitle}>Chat History</Text>
        </View>
        <View style={styles.material}>
          <View style={styles.orbOne} />
          <View style={styles.orbTwo} />
          <Text style={styles.sidebarLabel}>YOUR CONVERSATIONS</Text>
          {["Design a desktop app", "Make it feel native", "Add real platform chrome"].map((row, index) => (
            <View key={row} style={[styles.nativeRow, index === 2 && { backgroundColor: `rgba(103, 232, 249, ${0.08 + selected * 0.2})`, borderColor: `rgba(165, 243, 252, ${selected * 0.85})` }]}>
              <Text style={styles.nativeRowText}>{row}</Text>
            </View>
          ))}
        </View>
        <View style={styles.nativeContent}>
          <Text style={styles.contentEyebrow}>PLATFORM CHROME</Text>
          <Text style={styles.contentTitle}>Belongs here.</Text>
        </View>
      </View>
      <Text style={styles.caption}>The sketches are schematic. The final move is the point.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  boringLabel: { bottom: 22, color: "#94a3b8", fontSize: 20, left: 270, position: "absolute" },
  boringRow: { backgroundColor: "#334155", borderRadius: 4, height: 20, marginBottom: 20 },
  boringSidebar: { backgroundColor: "#1e293b", bottom: 0, left: 0, padding: 28, position: "absolute", top: 42, width: 245 },
  boringTitlebar: { backgroundColor: "#334155", height: 42 },
  boringTrack: { flexDirection: "row", gap: 46, left: 54, position: "absolute", top: 74 },
  boringWindow: { backgroundColor: "#0f172a", borderColor: "#475569", borderRadius: 8, borderWidth: 2, height: 390, overflow: "hidden", width: 520 },
  caption: { bottom: 14, color: "#94a3b8", fontSize: 24, left: 42, position: "absolute" },
  contentEyebrow: { color: "#67e8f9", fontSize: 18, fontWeight: "700", letterSpacing: 3 },
  contentTitle: { color: "#fff", fontSize: 62, fontWeight: "700", marginTop: 94 },
  dot: { borderRadius: 7, height: 14, width: 14 },
  frame: { height: 580, overflow: "hidden", position: "relative", width: 1680 },
  material: { backgroundColor: "rgba(20, 42, 68, 0.92)", bottom: 0, left: 0, overflow: "hidden", padding: 28, position: "absolute", top: 58, width: 510 },
  nativeContent: { left: 510, padding: 44, position: "absolute", right: 0, top: 58 },
  nativeRow: { borderColor: "transparent", borderRadius: 14, borderWidth: 1, marginBottom: 10, paddingHorizontal: 20, paddingVertical: 17 },
  nativeRowText: { color: "#f8fafc", fontSize: 23 },
  nativeTitle: { color: "#cbd5e1", fontSize: 20, marginLeft: 14 },
  nativeTitlebar: { alignItems: "center", borderBottomColor: "rgba(148, 163, 184, 0.25)", borderBottomWidth: 1, flexDirection: "row", gap: 9, height: 58, paddingHorizontal: 22 },
  nativeWindow: { backgroundColor: "#020617", borderColor: "#67e8f9", borderRadius: 28, borderWidth: 2, height: 490, left: 170, overflow: "hidden", position: "absolute", shadowColor: "#22d3ee", shadowOpacity: 0.4, shadowRadius: 34, top: 28, width: 1340 },
  orbOne: { backgroundColor: "rgba(34, 211, 238, 0.3)", borderRadius: 130, height: 260, left: -80, position: "absolute", top: -90, width: 260 },
  orbTwo: { backgroundColor: "rgba(139, 92, 246, 0.28)", borderRadius: 180, bottom: -150, height: 360, position: "absolute", right: -190, width: 360 },
  sidebarLabel: { color: "#a5f3fc", fontSize: 17, fontWeight: "700", letterSpacing: 3, marginBottom: 26 },
});
