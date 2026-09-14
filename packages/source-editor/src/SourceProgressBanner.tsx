import { useSyncExternalStore } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { progressLabel, type createSourceProgress } from "./sourceProgress";

export function SourceProgressBanner({ progress, loading }: { progress: ReturnType<typeof createSourceProgress>; loading: boolean }) {
  const value = useSyncExternalStore(progress.subscribe, progress.getSnapshot, progress.getSnapshot);
  const label = progressLabel(value, loading);
  if (!label) return null;
  if (!loading) {
    const percent = Math.min(99, Math.max(0, Math.floor(value.completedLines / value.totalLines * 100)));
    return <View pointerEvents="none" style={styles.highlighting}
      accessible accessibilityRole="progressbar" accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: percent }}>
      <View style={styles.circle}>
        <View style={[styles.fill, { height: `${percent}%` }]} />
      </View>
    </View>;
  }
  return <View pointerEvents="none" style={styles.banner}>
    <View accessibilityRole="progressbar" accessibilityLabel={label}
      accessibilityValue={loading ? undefined : { min: 0, max: value.totalLines, now: Math.min(value.completedLines, value.totalLines) }}
      style={styles.surface}>
      <ActivityIndicator size="small" color="#60a5fa" />
      <Text style={styles.text}>{label}</Text>
    </View>
  </View>;
}

export const progressBannerStyles = StyleSheet.create({
  highlighting: { position: "absolute", bottom: 8, right: 12, width: 20, height: 20, zIndex: 35 },
  circle: { flex: 1, borderRadius: 10, borderWidth: 1, borderColor: "#60a5fa", backgroundColor: "#202020e6", overflow: "hidden" },
  fill: { position: "absolute", bottom: 0, left: 0, right: 0, backgroundColor: "#60a5fa" },
  banner: { position: "absolute", top: 10, left: 0, right: 0, alignItems: "center", zIndex: 35 },
  surface: { flexDirection: "row", alignItems: "center", gap: 11, paddingHorizontal: 16, paddingVertical: 8,
    maxWidth: "95%",
    borderRadius: 10, borderWidth: 1, borderColor: "#60a5fa", backgroundColor: "#202020f5" },
  text: { color: "#eeeeee", fontSize: 12, fontVariant: ["tabular-nums"], flexShrink: 1 },
});
const styles = progressBannerStyles;
