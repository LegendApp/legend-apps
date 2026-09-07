import { StyleSheet, Text, View } from "react-native";
import { stage, useEffectTime } from "../shared/effectRuntime";

export function WindowPortal() {
  const time = useEffectTime(4.8);
  const portal = stage(time, 0.35, 1.7);
  const window = stage(time, 0.9, 2.3);
  const settle = stage(time, 3.25, 0.65);

  return (
    <View style={styles.frame}>
      {[0, 1, 2].map((index) => (
        <View
          key={index}
          style={[
            styles.ring,
            {
              opacity: (1 - portal * 0.55) * (0.55 - index * 0.12),
              transform: [{ scale: 0.45 + portal * (1.2 + index * 0.28) }],
            },
          ]}
        />
      ))}
      <Text style={[styles.source, { opacity: 1 - window * 0.72, transform: [{ scale: 1 - window * 0.08 }] }]}>
        {"<DesktopWindow>\n  <Sidebar />\n  <Transcript />\n</DesktopWindow>"}
      </Text>
      <View
        style={[
          styles.window,
          {
            opacity: window,
            transform: [
              { perspective: 1400 },
              { scale: 0.16 + window * 0.84 + settle * 0.015 },
              { rotateY: `${(1 - window) * -28}deg` },
              { rotateZ: `${(1 - window) * 7}deg` },
            ],
          },
        ]}
      >
        <View style={styles.titlebar}>
          {["#fb7185", "#fbbf24", "#4ade80"].map((color) => <View key={color} style={[styles.dot, { backgroundColor: color }]} />)}
          <Text style={styles.windowTitle}>Chat History</Text>
        </View>
        <View style={styles.sidebar}>
          <Text style={styles.sidebarLabel}>CONVERSATIONS</Text>
          <View style={styles.selected}><Text style={styles.rowText}>Build a desktop app</Text></View>
          <Text style={styles.rowText}>Make it feel native</Text>
          <Text style={styles.rowText}>Measure everything</Text>
        </View>
        <View style={styles.content}>
          <Text style={styles.contentLabel}>REACT NATIVE / DESKTOP</Text>
          <Text style={styles.headline}>A real window arrives.</Text>
          <Text style={styles.body}>Menus, input, resizing and native services come with it.</Text>
        </View>
      </View>
      <Text style={styles.caption}>Turn the component tree into a desktop place.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  body: { color: "#94a3b8", fontSize: 26, lineHeight: 39, marginTop: 22, maxWidth: 620 },
  caption: { bottom: 14, color: "#94a3b8", fontSize: 24, left: 42, position: "absolute" },
  content: { left: 450, padding: 44, position: "absolute", right: 0, top: 58 },
  contentLabel: { color: "#67e8f9", fontSize: 17, fontWeight: "700", letterSpacing: 3 },
  dot: { borderRadius: 7, height: 14, width: 14 },
  frame: { alignItems: "center", height: 580, justifyContent: "center", overflow: "hidden", position: "relative", width: 1680 },
  headline: { color: "#fff", fontSize: 55, fontWeight: "700", marginTop: 76 },
  ring: { borderColor: "#22d3ee", borderRadius: 270, borderWidth: 3, height: 540, position: "absolute", shadowColor: "#22d3ee", shadowOpacity: 0.45, shadowRadius: 22, width: 540 },
  rowText: { color: "#f8fafc", fontSize: 21, marginBottom: 24 },
  selected: { backgroundColor: "#155e75", borderRadius: 12, marginBottom: 22, paddingHorizontal: 16, paddingTop: 18 },
  sidebar: { backgroundColor: "#111c30", bottom: 0, left: 0, padding: 28, position: "absolute", top: 58, width: 450 },
  sidebarLabel: { color: "#a5f3fc", fontSize: 16, fontWeight: "700", letterSpacing: 3, marginBottom: 28 },
  source: { color: "#67e8f9", fontFamily: "Menlo", fontSize: 28, lineHeight: 46, position: "absolute", textAlign: "left" },
  titlebar: { alignItems: "center", borderBottomColor: "#334155", borderBottomWidth: 1, flexDirection: "row", gap: 9, height: 58, paddingHorizontal: 22 },
  window: { backgroundColor: "#020617", borderColor: "#67e8f9", borderRadius: 28, borderWidth: 2, height: 485, overflow: "hidden", position: "absolute", shadowColor: "#22d3ee", shadowOffset: { height: 18, width: 0 }, shadowOpacity: 0.38, shadowRadius: 34, width: 1390 },
  windowTitle: { color: "#cbd5e1", fontSize: 20, marginLeft: 14 },
});
