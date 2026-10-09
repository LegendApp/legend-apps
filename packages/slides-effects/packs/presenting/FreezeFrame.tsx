import { usePlayback } from "@legend-apps/presentation";
import { type ReactNode } from "react";
import { StyleSheet, View } from "react-native";
import { useAnimatedReaction, useDerivedValue, useSharedValue, type SharedValue } from "react-native-reanimated";
import { FrameView } from "./FrameView";
import { useMotion } from "./Motion";
/** Pausing accumulates shared-clock deltas entirely on UI. */
export function FreezeFrame({ paused, children, annotation, previewTime = 1.5 }: {
  paused: boolean; children: (seconds: SharedValue<number>) => ReactNode; annotation?: ReactNode; previewTime?: number;
}) {
  const playback = usePlayback();
  const held = useSharedValue({ key: "", last: 0, seconds: 0, paused });
  const opacity = useMotion([paused ? 1 : 0], 250);
  useAnimatedReaction(() => playback.value, clock => {
    if (clock.phase !== "playing") return;
    const old = held.value;
    const reset = old.key !== clock.slideKey;
    held.value = { key: clock.slideKey, last: clock.slideTime, paused,
      seconds: reset ? 0 : old.seconds + (paused || old.paused ? 0 : Math.max(0, clock.slideTime - old.last)) };
  }, [paused]);
  const seconds = useDerivedValue(() => playback.value.phase === "preview" ? previewTime : playback.value.phase === "preparing" ? 0 : held.value.seconds, [previewTime]);
  return <View style={styles.frame}>
    {children(seconds)}
    <FrameView pointerEvents={paused ? "auto" : "none"} accessibilityElementsHidden={!paused}
      importantForAccessibility={paused ? "auto" : "no-hide-descendants"} frameStyle={() => { "worklet"; return [StyleSheet.absoluteFill, { opacity: opacity.value[0] }]; }}>{annotation}</FrameView>
  </View>;
}
const styles = StyleSheet.create({ frame: { position: "relative" } });
