import { samplePlayback, type PlaybackState } from "@legend-apps/presentation";
import { defineAnimation, type Animation, type SharedValue, type withTiming } from "react-native-reanimated";

interface ClockAnimation extends Animation<ClockAnimation> {
  current: number;
  startValue: number;
  slideKey: string;
  stepKey: string;
}

export function numberFlowTiming(playback: SharedValue<PlaybackState>): typeof withTiming {
  const createAnimation = defineAnimation;
  const sampleClock = samplePlayback;
  return ((toValue: number, config, callback) => {
    "worklet";
    const duration = config?.duration ?? 900;
    const easing = config?.easing;
    return createAnimation<ClockAnimation>(toValue, () => {
      "worklet";
      return {
        current: toValue,
        startValue: toValue,
        slideKey: "",
        stepKey: "",
        callback,
        onStart(animation, value) {
          animation.current = Number(value);
          animation.startValue = Number(value);
          animation.slideKey = playback.value.slideKey;
          animation.stepKey = playback.value.stepKey;
        },
        onFrame(animation) {
          const clock = playback.value;
          if (clock.slideKey !== animation.slideKey || clock.stepKey !== animation.stepKey) return true;
          if (clock.phase === "outgoing" || clock.phase === "paused") return false;
          const elapsed = sampleClock(clock, duration / 1000, "step") * 1000;
          const progress = duration <= 0 ? 1 : Math.min(1, Math.max(0, elapsed / duration));
          const eased = typeof easing === "function" ? easing(progress) : progress;
          animation.current = progress === 1 ? toValue : animation.startValue + (toValue - animation.startValue) * eased;
          return progress === 1;
        },
      };
    });
  }) as typeof withTiming;
}
