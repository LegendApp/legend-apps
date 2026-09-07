import { StyleSheet, Text, View } from "react-native";
import { stage, useEffectTime } from "../shared/effectRuntime";

const code = [
  "<Sidebar>",
  "  {histories.map(history =>",
  "    <SidebarRow title={history.title} />",
  "  )}",
  "</Sidebar>",
];

const rows = ["Build the desktop app", "Measure every version", "Add native glass", "Ship something useful"];

export function CodeToUI() {
  const time = useEffectTime(5.2);
  const bridge = stage(time, 0.7, 2.6);

  return (
    <View style={styles.frame}>
      <View style={styles.codePanel}>
        <Text style={styles.panelLabel}>APP.TSX</Text>
        {code.map((line, index) => {
          const move = stage(time, 0.55 + index * 0.16, 1.6);
          return (
            <Text key={line} style={[styles.code, { opacity: 1 - move * 0.62, transform: [{ translateX: move * 72 }] }]}>
              {line}
            </Text>
          );
        })}
      </View>
      <View style={styles.stream}>
        {[0, 1, 2, 3, 4].map((index) => {
          const travel = stage(time, 0.7 + index * 0.18, 2.4);
          return <View key={index} style={[styles.token, { opacity: travel * (1 - travel) * 4, transform: [{ translateX: travel * 210 }, { scale: 0.7 + travel * 0.6 }] }]} />;
        })}
      </View>
      <View style={[styles.window, { borderColor: `rgba(103, 232, 249, ${0.25 + bridge * 0.75})` }]}>
        <View style={styles.titlebar}>
          {["#fb7185", "#fbbf24", "#4ade80"].map((color) => <View key={color} style={[styles.dot, { backgroundColor: color }]} />)}
          <Text style={styles.windowTitle}>Chat History</Text>
        </View>
        <View style={styles.sidebar}>
          <Text style={styles.sidebarLabel}>CONVERSATIONS</Text>
          {rows.map((row, index) => {
            const appear = stage(time, 1.5 + index * 0.38, 0.8);
            return (
              <View key={row} style={[styles.row, index === 2 && styles.selected, { opacity: appear, transform: [{ translateX: (1 - appear) * 70 }] }]}>
                <Text style={styles.rowText}>{row}</Text>
              </View>
            );
          })}
        </View>
      </View>
      <Text style={styles.caption}>The component model survives the trip.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  caption: { bottom: 18, color: "#94a3b8", fontSize: 24, left: 42, position: "absolute" },
  code: { color: "#bae6fd", fontFamily: "Menlo", fontSize: 24, lineHeight: 44 },
  codePanel: { backgroundColor: "#0f172a", borderColor: "#334155", borderRadius: 24, borderWidth: 2, left: 40, padding: 34, position: "absolute", top: 50, width: 650 },
  dot: { borderRadius: 7, height: 14, width: 14 },
  frame: { height: 580, overflow: "hidden", position: "relative", width: 1680 },
  panelLabel: { color: "#67e8f9", fontSize: 18, fontWeight: "700", letterSpacing: 4, marginBottom: 24 },
  row: { borderRadius: 12, marginBottom: 10, paddingHorizontal: 20, paddingVertical: 14 },
  rowText: { color: "#f8fafc", fontSize: 24 },
  selected: { backgroundColor: "#155e75" },
  sidebar: { padding: 28 },
  sidebarLabel: { color: "#a5f3fc", fontSize: 17, fontWeight: "700", letterSpacing: 3, marginBottom: 22 },
  stream: { height: 80, left: 690, position: "absolute", top: 258, width: 230 },
  titlebar: { alignItems: "center", borderBottomColor: "#334155", borderBottomWidth: 1, flexDirection: "row", gap: 9, height: 58, paddingHorizontal: 22 },
  token: { backgroundColor: "#67e8f9", borderRadius: 7, height: 14, left: 0, position: "absolute", top: 26, width: 14 },
  window: { backgroundColor: "#020617", borderRadius: 24, borderWidth: 2, height: 454, overflow: "hidden", position: "absolute", right: 40, top: 50, width: 720 },
  windowTitle: { color: "#cbd5e1", fontSize: 20, marginLeft: 14 },
});
