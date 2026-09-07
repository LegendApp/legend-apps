import LottieView, { type AnimationObject } from "lottie-react-native";
import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { useEffectTime } from "../shared/effectRuntime";
import nativeOrbit from "./native-orbit.json";

type LottiePlayerProps = {
  durationSeconds?: number;
  loop?: boolean;
  previewProgress?: number;
  source: AnimationObject;
  style?: StyleProp<ViewStyle>;
};

function LottieProgress({
  durationSeconds,
  loop,
  previewProgress,
  source,
  style,
}: Required<Pick<LottiePlayerProps, "durationSeconds" | "loop" | "previewProgress">> &
  Pick<LottiePlayerProps, "source" | "style">) {
  const time = useEffectTime(durationSeconds * previewProgress);
  const elapsed = loop ? time % durationSeconds : Math.min(time, durationSeconds);
  const progress = elapsed / durationSeconds;

  return (
    <LottieView
      autoPlay={false}
      loop={false}
      progress={progress}
      resizeMode="contain"
      source={source}
      style={style}
    />
  );
}

export function LottiePlayer({
  durationSeconds = 5,
  loop = true,
  previewProgress = 0.72,
  source,
  style,
}: LottiePlayerProps) {
  return (
    <LottieProgress
      durationSeconds={Math.max(0.1, durationSeconds)}
      loop={loop}
      previewProgress={Math.max(0, Math.min(1, previewProgress))}
      source={source}
      style={style}
    />
  );
}

export function NativeOrbitLottie() {
  return (
    <View style={styles.frame}>
      <View style={styles.meta}>
        <Text style={styles.eyebrow}>DECK-LOCAL JSON</Text>
        <Text style={styles.title}>One asset. Native vector playback.</Text>
        <Text style={styles.detail}>The slide clock controls progress, preview and replay.</Text>
      </View>
      <View style={styles.stage}>
        <LottiePlayer source={nativeOrbit as AnimationObject} style={styles.animation} />
      </View>
      <Text style={styles.caption}>Generated Lottie JSON rendered by the native macOS runtime.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  animation: { height: 500, width: 980 },
  caption: { bottom: 4, color: "#94a3b8", fontSize: 24, left: 40, position: "absolute" },
  detail: { color: "#94a3b8", fontSize: 24, lineHeight: 34, marginTop: 22, width: 440 },
  eyebrow: { color: "#67e8f9", fontSize: 18, fontWeight: "700", letterSpacing: 4 },
  frame: { flexDirection: "row", height: 580, paddingHorizontal: 40, position: "relative", width: 1680 },
  meta: { justifyContent: "center", paddingBottom: 42, width: 500 },
  stage: { alignItems: "center", height: 520, justifyContent: "center", width: 1100 },
  title: { color: "#f8fafc", fontSize: 50, fontWeight: "700", lineHeight: 58, marginTop: 18, width: 470 },
});
