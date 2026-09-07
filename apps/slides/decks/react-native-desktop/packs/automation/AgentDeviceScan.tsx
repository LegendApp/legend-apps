import { StyleSheet, Text, View } from "react-native";
import { stage, useEffectTime } from "../shared/effectRuntime";

const rows = ["Build the desktop app", "Measure every version", "Add native glass", "Ship something useful"];

export function AgentDeviceScan() {
  const time = useEffectTime(5.6);
  const scan = stage(time, 0.45, 2.7);
  const target = stage(time, 1.15, 1.75);
  const verified = stage(time, 3.45, 0.5);

  return (
    <View style={styles.frame}>
      <View style={styles.window}>
        <View style={styles.titlebar}>
          {[
            "#fb7185",
            "#fbbf24",
            "#4ade80",
          ].map((color) => <View key={color} style={[styles.dot, { backgroundColor: color }]} />)}
          <Text style={styles.windowTitle}>Chat History</Text>
          <Text style={styles.connected}>DEVICE CONNECTED</Text>
        </View>
        <View style={styles.sidebar}>
          <Text style={styles.sidebarLabel}>CONVERSATIONS</Text>
          {rows.map((row, index) => (
            <View key={row} style={[styles.row, index === 2 && styles.selected]}>
              <Text style={styles.rowText}>{row}</Text>
            </View>
          ))}
        </View>
        <View style={styles.content}>
          <Text style={styles.contentLabel}>ADD NATIVE GLASS</Text>
          <View style={styles.message}><Text style={styles.messageText}>Can we use the actual platform material?</Text></View>
          <View style={[styles.message, styles.reply]}><Text style={styles.messageText}>Yes. The native view owns it.</Text></View>
        </View>
        <View style={[styles.scanLine, { opacity: scan < 1 ? 0.85 : 0, top: 62 + scan * 430 }]} />
        <View
          style={[
            styles.target,
            {
              borderColor: `rgba(103, 232, 249, ${0.35 + target * 0.65})`,
              left: 64 + target * 560,
              top: 242 - target * 42,
              transform: [{ scale: 0.72 + target * 0.28 }],
            },
          ]}
        >
          <View style={styles.crosshairHorizontal} />
          <View style={styles.crosshairVertical} />
        </View>
      </View>
      <View style={[styles.badge, { opacity: verified, transform: [{ scale: 0.72 + verified * 0.28 }] }]}>
        <Text style={styles.badgeCheck}>✓</Text>
        <View>
          <Text style={styles.badgeLabel}>VISIBLE RESULT VERIFIED</Text>
          <Text style={styles.badgeDetail}>Selected conversation + expected content</Text>
        </View>
      </View>
      <Text style={styles.caption}>Observe the app. Act on a target. Verify what appeared.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: "center", backgroundColor: "#083344", borderColor: "#67e8f9", borderRadius: 18, borderWidth: 2, bottom: 28, flexDirection: "row", gap: 16, paddingHorizontal: 24, paddingVertical: 16, position: "absolute", right: 46, shadowColor: "#22d3ee", shadowOpacity: 0.35, shadowRadius: 20 },
  badgeCheck: { color: "#67e8f9", fontSize: 38, fontWeight: "800" },
  badgeDetail: { color: "#a5f3fc", fontSize: 17, marginTop: 3 },
  badgeLabel: { color: "#ecfeff", fontSize: 18, fontWeight: "800", letterSpacing: 2 },
  caption: { bottom: 20, color: "#94a3b8", fontSize: 24, left: 42, position: "absolute" },
  connected: { color: "#67e8f9", fontSize: 16, fontWeight: "700", letterSpacing: 2, marginLeft: "auto" },
  content: { left: 500, padding: 42, position: "absolute", right: 0, top: 58 },
  contentLabel: { color: "#67e8f9", fontSize: 18, fontWeight: "700", letterSpacing: 3, marginBottom: 34 },
  crosshairHorizontal: { backgroundColor: "#67e8f9", height: 2, left: -13, position: "absolute", top: 27, width: 80 },
  crosshairVertical: { backgroundColor: "#67e8f9", height: 80, left: 27, position: "absolute", top: -13, width: 2 },
  dot: { borderRadius: 7, height: 14, width: 14 },
  frame: { height: 580, overflow: "hidden", position: "relative", width: 1680 },
  message: { backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: 18, borderWidth: 1, marginBottom: 22, padding: 24, width: 780 },
  messageText: { color: "#f8fafc", fontSize: 26 },
  reply: { backgroundColor: "#164e63", marginLeft: 130 },
  row: { borderRadius: 12, marginBottom: 10, paddingHorizontal: 20, paddingVertical: 14 },
  rowText: { color: "#f8fafc", fontSize: 22 },
  scanLine: { backgroundColor: "#67e8f9", height: 2, left: 2, position: "absolute", right: 2, shadowColor: "#67e8f9", shadowOpacity: 1, shadowRadius: 14 },
  selected: { backgroundColor: "#155e75" },
  sidebar: { backgroundColor: "#111c30", bottom: 0, left: 0, padding: 28, position: "absolute", top: 58, width: 500 },
  sidebarLabel: { color: "#a5f3fc", fontSize: 17, fontWeight: "700", letterSpacing: 3, marginBottom: 22 },
  target: { borderRadius: 28, borderWidth: 3, height: 56, position: "absolute", width: 56 },
  titlebar: { alignItems: "center", borderBottomColor: "#334155", borderBottomWidth: 1, flexDirection: "row", gap: 9, height: 58, paddingHorizontal: 22 },
  window: { backgroundColor: "#020617", borderColor: "#334155", borderRadius: 26, borderWidth: 2, height: 490, left: 40, overflow: "hidden", position: "absolute", right: 40, top: 28 },
  windowTitle: { color: "#cbd5e1", fontSize: 20, marginLeft: 14 },
});
