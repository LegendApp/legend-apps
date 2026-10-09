import Animated, { useAnimatedProps } from "react-native-reanimated";
import LottieView, { type AnimationObject } from "lottie-react-native";
import type { StyleProp, ViewStyle } from "react-native";
import { samplePlayback, usePlayback } from "@legend-apps/presentation";
import { useDerivedValue } from "react-native-reanimated";
type LottiePlayerProps = {
  durationSeconds?: number;
  loop?: boolean;
  previewProgress?: number;
  source: AnimationObject;
  style?: StyleProp<ViewStyle>;
};
const AnimatedLottie = Animated.createAnimatedComponent(LottieView);
function LottieProgress({
  durationSeconds,
  loop,
  previewProgress,
  source,
  style
}: Required<Pick<LottiePlayerProps, "durationSeconds" | "loop" | "previewProgress">> & Pick<LottiePlayerProps, "source" | "style">) {
  const playback = usePlayback();
  const time = useDerivedValue(() => samplePlayback(playback.value, durationSeconds * previewProgress, "slide"));
  const animatedProps = useAnimatedProps(() => ({ progress: (loop ? time.value % durationSeconds : Math.min(time.value, durationSeconds)) / durationSeconds }));
  return <AnimatedLottie autoPlay={false} loop={false} animatedProps={animatedProps} resizeMode="contain" source={source} style={style} />;
}
export function LottiePlayer({
  durationSeconds = 5,
  loop = true,
  previewProgress = 0.72,
  source,
  style
}: LottiePlayerProps) {
  return <LottieProgress durationSeconds={Math.max(0.1, durationSeconds)} loop={loop} previewProgress={Math.max(0, Math.min(1, previewProgress))} source={source} style={style} />;
}
