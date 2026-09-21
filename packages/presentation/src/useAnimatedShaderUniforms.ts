import { useAnimatedReaction, useDerivedValue, useSharedValue } from "react-native-reanimated";
import { usePresentationValue } from "./runtime";
import { samplePlayback, useRenderPlayback } from "./playback";

type ShaderMotion = { clock?: "slide" | "step" | number; speed?: number; slideChangeBoost?: number; slideChangeDuration?: number };

/** All shader uniforms sample the surface controller in one UI-thread evaluation. */
export function useAnimatedShaderUniforms(
  uniforms: Record<string, number | number[]>, previewTime = 0,
  { clock = "slide", speed = 1, slideChangeBoost = 0, slideChangeDuration = 2 }: ShaderMotion = {},
) {
  const playback = useRenderPlayback();
  const slideIndex = usePresentationValue("slideIndex");
  const rate = Number.isFinite(speed) ? Math.max(0, speed) : 1;
  const boost = Number.isFinite(slideChangeBoost) ? Math.max(0, slideChangeBoost) : 0;
  const duration = Math.max(0.001, Number.isFinite(slideChangeDuration) ? slideChangeDuration : 2);
  const adjusted = rate !== 1 || boost !== 0;
  const motion = useSharedValue({ time: 0, raw: 0, burst: duration, slideIndex });
  // Background speed modulation integrates the shared elapsed clock. It owns
  // no frame loop, never caps elapsed time, and does not change step timing.
  useAnimatedReaction(() => ({ clock: playback.value, index: slideIndex }), ({ clock, index }) => {
    if (!adjusted) return;
    if (clock.phase === "preparing" || clock.slideTime < motion.value.raw) {
      motion.value = { time: 0, raw: 0, burst: duration, slideIndex: index };
    }
    if (clock.phase !== "playing") return;
    const old = motion.value;
    const dt = Math.max(0, clock.slideTime - old.raw);
    const start = index === old.slideIndex ? old.burst : 0;
    const end = Math.min(duration, start + dt);
    // Integral of the attack and decay, so dropped frames don't slow the effect.
    const attack = Math.min(0.12, duration * 0.25);
    const area = (t: number) => {
      const a = Math.min(t, attack) / attack;
      const d = Math.max(0, Math.min(1, (t - attack) / (duration - attack)));
      return attack * (a * a - a * a * a / 3)
        + (duration - attack) * (d - d * d + d * d * d / 3);
    };
    motion.value = { time: old.time + dt * rate + boost * (area(end) - area(start)),
      raw: clock.slideTime, burst: end, slideIndex: index };
  }, [adjusted, rate, boost, duration, slideIndex]);
  return useDerivedValue(() => {
    const state = playback.value;
    const sampled = samplePlayback(state, previewTime, clock);
    return { ...uniforms,
      time: adjusted && state.phase !== "preview" && state.phase !== "preparing" ? motion.value.time : sampled,
      slideTime: samplePlayback(state, previewTime),
      stepTime: samplePlayback(state, previewTime, "step"),
      stepIndex: state.stepIndex,
    };
  }, [uniforms, adjusted, previewTime, clock]);
}
