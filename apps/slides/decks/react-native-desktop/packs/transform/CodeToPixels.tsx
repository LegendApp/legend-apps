import { StyleSheet, Text, View } from "react-native";
import { effectAmount, effectDuration, loopTime, type EffectProfileProps } from "../shared/effectProfile";
import { stage, useEffectTime } from "../shared/effectRuntime";

const code = ["const app =", "  <Window>", "    <Sidebar />", "    <History />", "  </Window>"];
const columns = 14;
const rows = 7;
const pixels = Array.from({ length: columns * rows }, (_, index) => ({ column: index % columns, row: Math.floor(index / columns) }));

export function CodeToPixels({
  durationSeconds,
  intensity = "heavy",
  previewProgress = 0.74,
  tempo = "fast",
}: EffectProfileProps) {
  const duration = effectDuration(tempo, durationSeconds, 6.4, 3.6);
  const amount = effectAmount(intensity, 0.42, 1);
  const time = useEffectTime(duration * previewProgress);
  const local = loopTime(time, duration, 1);

  return (
    <View style={styles.frame}>
      <View style={styles.codePanel}>
        <Text style={styles.codeLabel}>SOURCE</Text>
        {code.map((line, index) => {
          const dissolve = stage(local, duration * (0.12 + index * 0.035), duration * 0.34);
          return <Text key={line} style={[styles.code, { opacity: 1 - dissolve * 0.72, transform: [{ translateX: dissolve * 80 * amount }] }]}>{line}</Text>;
        })}
      </View>
      <View style={styles.stream}>
        {Array.from({ length: 9 }, (_, index) => {
          const travel = stage(local, duration * (0.1 + index * 0.025), duration * 0.56);
          return <View key={index} style={[styles.streamPixel, { left: travel * 310, opacity: travel * (1 - travel) * 4, top: 12 + Math.sin(index * 2.1 + travel * 8) * amount * 42 }]} />;
        })}
      </View>
      <View style={styles.pixelStage}>
        {pixels.map((pixel, index) => {
          const arrive = stage(local, duration * (0.16 + (index % 11) * 0.012), duration * 0.42);
          const isChrome = pixel.row === 0 || pixel.column < 4;
          const isContent = pixel.row > 1 && pixel.column > 5 && (pixel.column + pixel.row) % 3 !== 0;
          const visible = isChrome || isContent;
          return (
            <View
              key={index}
              style={[
                styles.pixel,
                {
                  backgroundColor: isChrome ? "#67e8f9" : "#818cf8",
                  left: pixel.column * 46,
                  opacity: visible ? arrive * (0.45 + amount * 0.5) : arrive * 0.08,
                  top: pixel.row * 46,
                  transform: [{ scale: 0.25 + arrive * 0.75 }, { rotate: `${(1 - arrive) * (index % 2 ? -18 : 18) * amount}deg` }],
                },
              ]}
            />
          );
        })}
      </View>
      <Text style={styles.caption}>The code dissolves into pixels, then resolves into interface.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  caption: { bottom: 2, color: "#94a3b8", fontSize: 24, left: 40, position: "absolute" },
  code: { color: "#bae6fd", fontFamily: "Menlo", fontSize: 26, lineHeight: 52 },
  codeLabel: { color: "#67e8f9", fontSize: 17, fontWeight: "800", letterSpacing: 4, marginBottom: 22 },
  codePanel: { backgroundColor: "#07101f", borderColor: "#334155", borderRadius: 24, borderWidth: 2, left: 40, padding: 32, position: "absolute", top: 52, width: 560 },
  frame: { height: 580, overflow: "hidden", position: "relative", width: 1680 },
  pixel: { borderRadius: 6, height: 32, position: "absolute", width: 32 },
  pixelStage: { height: 330, position: "absolute", right: 48, top: 82, width: 650 },
  stream: { height: 120, left: 600, position: "absolute", top: 244, width: 320 },
  streamPixel: { backgroundColor: "#67e8f9", borderRadius: 5, height: 12, position: "absolute", width: 12 },
});
