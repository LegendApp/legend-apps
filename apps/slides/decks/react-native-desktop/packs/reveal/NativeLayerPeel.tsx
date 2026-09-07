import { StyleSheet, Text, View } from "react-native";
import { stage, useEffectTime } from "../shared/effectRuntime";

const layers = [
  { color: "#155e75", detail: "Components · state · events", label: "React" },
  { color: "#164e63", detail: "Reconciliation · props · commands", label: "Fabric" },
  { color: "#312e81", detail: "NSView · native layout · input", label: "AppKit views" },
  { color: "#4c1d95", detail: "Windows · menus · materials", label: "Platform services" },
];

export function NativeLayerPeel() {
  const time = useEffectTime(4.2);
  const reveal = stage(time, 0.55, 2.8);
  const settle = stage(time, 3.2, 0.7);

  return (
    <View style={styles.frame}>
      <View style={[styles.spine, { opacity: reveal }]} />
      {layers.map((layer, index) => {
        const offset = (index - 1.5) * reveal;
        return (
          <View
            key={layer.label}
            style={[
              styles.layer,
              {
                backgroundColor: layer.color,
                borderColor: index === 0 ? "#67e8f9" : "#64748b",
                top: 190 + offset * 104,
                transform: [
                  { perspective: 1100 },
                  { translateX: offset * 52 },
                  { rotateX: `${-7 * reveal + settle * 3}deg` },
                  { scale: 1 - Math.abs(offset) * 0.018 },
                ],
                zIndex: layers.length - index,
              },
            ]}
          >
            <Text style={styles.number}>{String(index + 1).padStart(2, "0")}</Text>
            <Text style={styles.label}>{layer.label}</Text>
            <Text style={styles.detail}>{layer.detail}</Text>
          </View>
        );
      })}
      <Text style={styles.caption}>One component tree. Real platform layers.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  caption: { bottom: 26, color: "#94a3b8", fontSize: 26, left: 42, position: "absolute" },
  detail: { color: "#cbd5e1", fontSize: 24, marginLeft: "auto" },
  frame: { height: 580, overflow: "hidden", position: "relative", width: 1680 },
  label: { color: "#fff", fontSize: 34, fontWeight: "700", marginLeft: 28 },
  layer: {
    alignItems: "center",
    alignSelf: "center",
    borderRadius: 24,
    borderWidth: 2,
    flexDirection: "row",
    height: 92,
    paddingHorizontal: 30,
    position: "absolute",
    shadowColor: "#020617",
    shadowOffset: { height: 18, width: 0 },
    shadowOpacity: 0.55,
    shadowRadius: 24,
    width: 1260,
  },
  number: { color: "#67e8f9", fontSize: 22, fontVariant: ["tabular-nums"], fontWeight: "700" },
  spine: { alignSelf: "center", backgroundColor: "#67e8f9", height: 430, position: "absolute", top: 54, width: 2 },
});
