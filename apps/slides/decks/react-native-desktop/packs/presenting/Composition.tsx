import type { ReactNode } from "react";
import { useState } from "react";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { clamp } from "./geometry";
import { useMotion } from "./motion";

export function ProgressiveDetail({ expanded, summary, detail, style }: {
  expanded: boolean; summary: ReactNode; detail: ReactNode; style?: StyleProp<ViewStyle>;
}) {
  const [amount] = useMotion([expanded ? 1 : 0], 700);
  return <View style={[styles.row, style]}>
    <View style={{ flex: 1, justifyContent: "center", paddingRight: amount * 32 }}>{summary}</View>
    <View pointerEvents={expanded ? "auto" : "none"} accessibilityElementsHidden={!expanded}
      importantForAccessibility={expanded ? "auto" : "no-hide-descendants"}
      style={{ width: `${amount * 63}%`, overflow: "hidden", opacity: amount, justifyContent: "center" }}>{detail}</View>
  </View>;
}

export function ComparisonWipe({ position, before, after, beforeLabel = "Before", afterLabel = "After", style }: {
  position: number; before: ReactNode; after: ReactNode; beforeLabel?: string; afterLabel?: string; style?: StyleProp<ViewStyle>;
}) {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [amount] = useMotion([clamp(position, 0, 1)], 900);
  return <View style={[styles.wipe, style]} onLayout={({ nativeEvent: { layout } }) => setSize((old) =>
    old.width === layout.width && old.height === layout.height ? old : { width: layout.width, height: layout.height })}>
    <View style={StyleSheet.absoluteFill}>{before}</View>
    <View style={[styles.clip, { width: size.width * amount }]}>
      <View style={{ width: size.width, height: size.height }}>{after}</View>
    </View>
    <View pointerEvents="none" style={[styles.divider, { left: Math.max(0, size.width * amount - 2) }]}>
      <View style={styles.handle}><Text style={styles.handleText}>↔</Text></View>
    </View>
    <View pointerEvents="none" style={styles.wipeLabels}>
      <Text style={styles.badge}>{afterLabel}</Text><Text style={styles.badge}>{beforeLabel}</Text>
    </View>
  </View>;
}

export function ContentSwap({ active, before, after, duration = 500, style }: {
  active: boolean; before: ReactNode; after: ReactNode; duration?: number; style?: StyleProp<ViewStyle>;
}) {
  const [amount] = useMotion([active ? 1 : 0], duration);
  return <View style={[styles.swap, style]}>
    <View pointerEvents={active ? "none" : "auto"} accessibilityElementsHidden={active} importantForAccessibility={active ? "no-hide-descendants" : "auto"}
      style={[StyleSheet.absoluteFill, { opacity: 1 - amount, transform: [{ scale: 1 - amount * 0.025 }] }]}>{before}</View>
    <View pointerEvents={active ? "auto" : "none"} accessibilityElementsHidden={!active} importantForAccessibility={active ? "auto" : "no-hide-descendants"}
      style={[StyleSheet.absoluteFill, { opacity: amount, transform: [{ scale: 0.975 + amount * 0.025 }] }]}>{after}</View>
  </View>;
}

export type ExplodedLayer = { id: string; label: string; content: ReactNode; color?: string };
export function ExplodedLayers({ expanded, layers, style }: { expanded: boolean; layers: ExplodedLayer[]; style?: StyleProp<ViewStyle> }) {
  const [amount] = useMotion([expanded ? 1 : 0], 850);
  const [height, setHeight] = useState(580);
  const available = Math.max(0, height - 80);
  const layerHeight = Math.min(130, available / Math.max(1, layers.length) - 14);
  return <View style={[styles.exploded, style]} onLayout={({ nativeEvent: { layout } }) => setHeight(layout.height)}>
    {layers.map((layer, index) => {
      const collapsedTop = (height - layerHeight) / 2 + index * 7;
      const expandedTop = 40 + index * (layerHeight + 14);
      return <View key={layer.id} style={[styles.layer, {
        top: collapsedTop + (expandedTop - collapsedTop) * amount,
        height: Math.max(40, layerHeight), backgroundColor: layer.color ?? "#153044", zIndex: layers.length - index,
        transform: [{ perspective: 1200 }, { rotateX: `${amount * 12}deg` }, { translateX: (index - (layers.length - 1) / 2) * 22 * amount }],
      }]}>
        <Text style={styles.layerLabel}>{layer.label}</Text><View style={{ flex: 1 }}>{layer.content}</View>
      </View>;
    })}
  </View>;
}
const styles = StyleSheet.create({
  row: { flexDirection: "row", overflow: "hidden" },
  wipe: { position: "relative", overflow: "hidden", borderRadius: 24 },
  clip: { position: "absolute", left: 0, top: 0, bottom: 0, overflow: "hidden" },
  divider: { position: "absolute", top: 0, bottom: 0, width: 3, backgroundColor: "#67e8f9", justifyContent: "center" },
  handle: { width: 58, height: 58, marginLeft: -27, alignItems: "center", justifyContent: "center", borderRadius: 29, backgroundColor: "#102e40", borderColor: "#67e8f9", borderWidth: 2 },
  handleText: { color: "#ecfeff", fontSize: 30 },
  wipeLabels: { position: "absolute", top: 18, left: 18, right: 18, flexDirection: "row", justifyContent: "space-between" },
  badge: { color: "#fff", fontSize: 22, backgroundColor: "#020617", paddingHorizontal: 18, paddingVertical: 10, borderRadius: 12 },
  swap: { position: "relative" },
  exploded: { position: "relative", overflow: "hidden" },
  layer: { position: "absolute", left: "12%", width: "76%", flexDirection: "row", alignItems: "center", gap: 34, padding: 28, borderWidth: 2, borderColor: "#67e8f9", borderRadius: 20 },
  layerLabel: { color: "#ecfeff", fontSize: 32, fontWeight: "700", width: 240 },
});
