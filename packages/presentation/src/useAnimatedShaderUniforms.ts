import { useBackgroundBrightnessScale, useBackgroundMotion } from "./background";
import { useAnimatedReaction, useDerivedValue, useSharedValue } from "react-native-reanimated";
import { usePresentationValue } from "./runtime";
import { samplePlayback, usePlayback } from "./playback";

type ShaderMotion = { active?: boolean; persistentBackground?: boolean | "read"; clocks?: Record<string, number>; clock?: "slide" | "step" | number; speed?: number; slideChangeBoost?: number; slideChangeDuration?: number };

/** All shader uniforms sample the surface controller in one UI-thread evaluation. */
export function useAnimatedShaderUniforms(
  uniforms: Record<string, number | number[]>, previewTime = 0,
  { active = true, persistentBackground = false, clocks, clock = "slide", speed = 1, slideChangeBoost = 0, slideChangeDuration = 2 }: ShaderMotion = {},
) {
  const playback = usePlayback();
  const brightnessScale=useBackgroundBrightnessScale();
  const slideIndex = usePresentationValue("slideIndex");
  const rate = Number.isFinite(speed) ? Math.max(0, speed) : 1;
  const boost = Number.isFinite(slideChangeBoost) ? Math.max(0, slideChangeBoost) : 0;
  const duration = Math.max(0.001, Number.isFinite(slideChangeDuration) ? slideChangeDuration : 2);
  const adjusted = rate !== 1 || boost !== 0;
  const sharedMotion=useBackgroundMotion();
  const localMotion=useSharedValue({time:0,raw:0,burst:duration,slideIndex,owner:""});
  const persistent=Boolean(persistentBackground) && sharedMotion!==null;
  const integrates=active && adjusted && persistentBackground!=="read";
  const motion=persistent ? sharedMotion! : localMotion;
  // Background speed modulation integrates the shared elapsed clock. It owns
  // no frame loop, never caps elapsed time, and does not change step timing.
  // Do not subscribe this optional integrator to every frame for normal-speed
  // shaders. Their uniform derivation below is the only clock consumer needed.
  useAnimatedReaction(() => integrates ? { clock: playback.value, index: slideIndex } : null, (sample) => {
    if (!sample) return;
    const { clock, index } = sample;
    if (!persistent && (clock.phase === "preparing" || clock.slideTime < motion.value.raw)) {
      motion.value = { time: 0, raw: 0, burst: duration, slideIndex: index, owner:clock.slideKey };
    }
    if (clock.phase !== "playing") return;
    const old = motion.value;
    const dt = persistent && old.owner!==clock.slideKey ? 0 : Math.max(0, clock.slideTime - old.raw);
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
      raw: clock.slideTime, burst: end, slideIndex: index, owner:clock.slideKey };
  }, [integrates, rate, boost, duration, slideIndex, persistent, motion]);
  return useDerivedValue(() => {
    // A frozen card must not subscribe to the live clock. Sample its stable
    // preview pose until it approaches the visible carousel region.
    if (!active) {
      const frozenClocks: Record<string, number> = {};
      for (const name of Object.keys(clocks ?? {})) frozenClocks[name] = previewTime;
      return { ...uniforms, ...frozenClocks, time: previewTime,
        slideTime: previewTime, stepTime: previewTime, stepIndex: 0 };
    }
    const state = playback.value;
    const sampled = samplePlayback(state, previewTime, clock);
    const extraClocks: Record<string, number> = {};
    for (const name of Object.keys(clocks ?? {})) extraClocks[name] = samplePlayback(state, previewTime, clocks![name]);
    return { ...uniforms, ...extraClocks,
      brightness: typeof uniforms.brightness === "number" ? uniforms.brightness*(brightnessScale?.value ?? 1) : 0,
      time: (adjusted || persistent) && state.phase !== "preview" && state.phase !== "preparing" ? motion.value.time : sampled,
      slideTime: samplePlayback(state, previewTime),
      stepTime: samplePlayback(state, previewTime, "step"),
      stepIndex: state.stepIndex,
    };
  }, [active, uniforms, clocks, adjusted, persistent, previewTime, clock, brightnessScale]);
}

/** Interaction geometry rides on the persistent background, never its slide clock
 * or stage-sized resolution. Kept here so the derivation is host-worklet compiled. */
export function useBackgroundInteractionUniforms(
  base: { readonly value: Record<string, number | number[]> },
  interaction?: { readonly value: Record<string, number | number[]> },
) {
  return useDerivedValue(() => {
    const background = base.value;
    const feed = interaction?.value;
    return { ...background,
      titleFeed: feed?.titleFeed ?? background.titleFeed ?? 0,
      bestRect: feed?.bestRect ?? background.bestRect,
      drops: feed?.drops ?? background.drops,
      backgroundTime: background.time,
    };
  }, [base, interaction]);
}
