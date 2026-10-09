import { usePlaybackTween } from "@legend-apps/presentation";
import { useDerivedValue } from "react-native-reanimated";
/** Retarget on the shared UI clock; callers consume the result in worklets. */
export function useMotion(target: number[], duration = 600) {
  const values = Object.fromEntries(target.map((value, index) => [index, value]));
  const motion = usePlaybackTween(values, duration, undefined, "smoothstep");
  return useDerivedValue(() => target.map((value, index) => motion.value[index] ?? value), [target]);
}
