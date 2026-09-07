import { StyleSheet, Text, View } from "react-native";
import { effectAmount, effectDuration, loopTime, type EffectProfileProps } from "../shared/effectProfile";
import { smooth, useEffectTime } from "../shared/effectRuntime";

const conversations = ["Desktop support", "Native UI", "Ship one product"];

export function PlatformMetamorphosis({
  durationSeconds,
  intensity = "heavy",
  previewProgress = 0.78,
  tempo = "fast",
}: EffectProfileProps) {
  const duration = effectDuration(tempo, durationSeconds, 4.8, 2.7);
  const amount = effectAmount(intensity, 0.45, 1);
  const time = useEffectTime(duration * previewProgress);
  const local = loopTime(time, duration, 1.2);
  const progress = smooth(Math.min(1, local / duration));
  const overshoot = Math.sin(progress * Math.PI) * amount;
  const width = 390 + progress * 1050;
  const height = 500 - progress * 38;
  const sidebarWidth = 90 + progress * 330;

  return (
    <View style={styles.frame}>
      <View style={styles.labels}>
        <Text style={styles.label}>ONE COMPONENT TREE</Text>
        <Text style={styles.arrow}>→</Text>
        <Text style={[styles.label, { opacity: 0.35 + progress * 0.65 }]}>DESKTOP-SHAPED</Text>
      </View>
      <View
        style={[
          styles.device,
          {
            height,
            transform: [
              { rotate: `${(1 - progress) * -2.2 * amount + overshoot * 0.35}deg` },
              { scale: 0.96 + overshoot * 0.035 },
            ],
            width,
          },
        ]}
      >
        <View style={[styles.titlebar, { opacity: 0.25 + progress * 0.75 }]}>
          <View style={styles.traffic}><View style={[styles.dot, { backgroundColor: "#fb7185" }]} /><View style={[styles.dot, { backgroundColor: "#fbbf24" }]} /><View style={[styles.dot, { backgroundColor: "#4ade80" }]} /></View>
          <Text style={styles.windowTitle}>Chat History</Text>
          <View style={[styles.toolbar, { opacity: progress }]}><Text style={styles.toolbarText}>⌘K</Text></View>
        </View>
        <View style={styles.body}>
          <View style={[styles.sidebar, { width: sidebarWidth }]}>
            <Text style={[styles.sidebarTitle, { opacity: progress }]}>CONVERSATIONS</Text>
            {conversations.map((conversation, index) => (
              <View key={conversation} style={[styles.row, index === 1 && styles.selected]}>
                <View style={[styles.avatar, { opacity: 0.35 + progress * 0.65 }]} />
                <Text numberOfLines={1} style={[styles.rowText, { opacity: progress }]}>{conversation}</Text>
              </View>
            ))}
          </View>
          <View style={[styles.content, { opacity: 0.35 + progress * 0.65 }]}>
            <Text style={styles.you}>YOU</Text>
            <Text style={styles.heading}>Can this become a desktop app?</Text>
            <View style={styles.reply}><Text style={styles.replyText}>It already is one.</Text></View>
          </View>
        </View>
      </View>
      <Text style={styles.caption}>The layout changes shape. The component model stays familiar.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  arrow: { color: "#67e8f9", fontSize: 28 },
  avatar: { backgroundColor: "#67e8f9", borderRadius: 10, height: 20, width: 20 },
  body: { flex: 1, flexDirection: "row" },
  caption: { bottom: 2, color: "#94a3b8", fontSize: 24, left: 40, position: "absolute" },
  content: { flex: 1, padding: 40 },
  device: { alignSelf: "center", backgroundColor: "#020617", borderColor: "#67e8f9", borderRadius: 30, borderWidth: 2, marginTop: 18, overflow: "hidden", shadowColor: "#22d3ee", shadowOpacity: 0.3, shadowRadius: 28 },
  dot: { borderRadius: 7, height: 14, width: 14 },
  frame: { height: 580, overflow: "hidden", position: "relative", width: 1680 },
  heading: { color: "#f8fafc", fontSize: 38, fontWeight: "700", marginTop: 18 },
  label: { color: "#a5f3fc", fontSize: 16, fontWeight: "800", letterSpacing: 3 },
  labels: { alignItems: "center", flexDirection: "row", gap: 20, justifyContent: "center" },
  reply: { backgroundColor: "#164e63", borderRadius: 18, marginTop: 42, padding: 26, width: "78%" },
  replyText: { color: "#ecfeff", fontSize: 29 },
  row: { alignItems: "center", borderRadius: 12, flexDirection: "row", gap: 14, height: 58, marginBottom: 10, paddingHorizontal: 18 },
  rowText: { color: "#e2e8f0", fontSize: 21 },
  selected: { backgroundColor: "#155e75" },
  sidebar: { backgroundColor: "#111c30", paddingHorizontal: 18, paddingTop: 28 },
  sidebarTitle: { color: "#67e8f9", fontSize: 14, fontWeight: "800", letterSpacing: 2, marginBottom: 20 },
  titlebar: { alignItems: "center", borderBottomColor: "#334155", borderBottomWidth: 1, flexDirection: "row", height: 62, paddingHorizontal: 22 },
  toolbar: { backgroundColor: "#172033", borderColor: "#475569", borderRadius: 8, borderWidth: 1, marginLeft: "auto", paddingHorizontal: 12, paddingVertical: 6 },
  toolbarText: { color: "#cbd5e1", fontSize: 14 },
  traffic: { flexDirection: "row", gap: 8 },
  windowTitle: { color: "#cbd5e1", fontSize: 19, marginLeft: 18 },
  you: { color: "#67e8f9", fontSize: 18, fontWeight: "800", letterSpacing: 3 },
});
