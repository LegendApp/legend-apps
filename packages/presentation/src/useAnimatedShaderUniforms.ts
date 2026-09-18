import { useEffect, useLayoutEffect, useRef } from "react";
import { useDerivedValue, useFrameCallback, useSharedValue } from "react-native-reanimated";
import { usePresentationValue } from "./runtime";

type ShaderMotion = {
  /** Constant clock rate, default 1. */
  speed?: number;
  /** Additional peak clock rate on a slide change, default 0. */
  slideChangeBoost?: number;
  /** Length of the smooth acceleration/deceleration in seconds. */
  slideChangeDuration?: number;
};

/** Adds a UI-thread `time` uniform in seconds; previews hold a fixed frame. */
export function useAnimatedShaderUniforms(
  uniforms: Record<string, number | number[]>,
  previewTime = 0,
  { speed = 1, slideChangeBoost = 0, slideChangeDuration = 2 }: ShaderMotion = {},
) {
  const active = usePresentationValue("isActive");
  const preview = usePresentationValue("isPreview");
  const slideIndex = usePresentationValue("slideIndex");
  const previousSlide = useRef(slideIndex);
  const burstElapsed = useSharedValue(slideChangeDuration);
  const clockSpeed = Number.isFinite(speed) ? Math.max(0, speed) : 1;
  const boost = Number.isFinite(slideChangeBoost) ? Math.max(0, slideChangeBoost) : 0;
  const duration = Number.isFinite(slideChangeDuration) ? Math.max(0.001, slideChangeDuration) : 2;
  const time = useSharedValue(preview ? previewTime : 0);
  const frame = useFrameCallback((info) => {
    // Integrate velocity instead of scaling absolute time, so speed changes do not jump.
    const dt = Math.min(info.timeSincePreviousFrame ?? 0, 64) / 1000;
    const elapsed = Math.min(duration, burstElapsed.value + dt);
    // Respond promptly, then spend most of the burst settling back to idle.
    const attack = Math.min(0.12, duration * 0.25);
    const ramp = Math.min(1, elapsed / attack);
    const decay = Math.max(0, (elapsed - attack) / (duration - attack));
    const pulse = elapsed < attack
      ? ramp * (2 - ramp)
      : (1 - decay) * (1 - decay);
    time.value += dt * (clockSpeed + boost * pulse);
    burstElapsed.value = Math.min(duration, burstElapsed.value + dt);
  }, false);

  useLayoutEffect(() => {
    if (previousSlide.current !== slideIndex && active && !preview) {
      burstElapsed.value = 0;
    }
    if (!active || preview) {
      burstElapsed.value = duration;
    }
    previousSlide.current = slideIndex;
  }, [slideIndex, active, preview, duration, burstElapsed]);

  useEffect(() => {
    if (preview) {
      time.value = previewTime;
    }
    frame.setActive(active && !preview);
    return () => frame.setActive(false);
  }, [active, preview, previewTime, frame, time]);

  return useDerivedValue(() => ({ ...uniforms, time: time.value }), [uniforms]);
}
