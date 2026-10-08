import { useBackgroundBrightnessScale, useBackgroundMotion } from "./background";
import { useAnimatedReaction, useDerivedValue, useSharedValue, type SharedValue } from "react-native-reanimated";
import { usePresentationValue } from "./runtime";
import { samplePlayback, usePlayback } from "./playback";
import type { PlaybackState } from "./playbackState";

type ShaderMotion = { active?: boolean; inactivityDelay?: number; persistentBackground?: boolean | "read"; clocks?: Record<string, number>; clock?: "slide" | "step" | number; maxTime?: number; speed?: number; slideChangeBoost?: number; slideChangeDuration?: number };

/** Retire a previously live effect after its exit, without a JS timer or frame subscription once idle. */
function useShaderPlayback(active: boolean, delay: number, playback: SharedValue<PlaybackState>, activation: string, phase: PlaybackState["phase"] | undefined, selectedClock: "slide" | "step" | number, maxTime: number | undefined) {
  const activity = useSharedValue({ requested: active, active, activation, until: 0, frozen: false, retained: null as PlaybackState | null });
  useAnimatedReaction(() => {
    const old = activity.value;
    const reset = phase === "preview" || phase === "preparing" || phase === "playing" && old.activation !== activation;
    return active || old.active || reset && old.retained !== null ? playback.value : null;
  }, clock => {
    if (!clock) return;
    const old = activity.value;
    if (active) {
      const elapsed = samplePlayback(clock, 0, selectedClock);
      const finite = maxTime !== undefined && clock.phase !== "preview" && clock.phase !== "preparing";
      const finished = finite && elapsed >= maxTime!;
      const frozen = finished || finite && typeof selectedClock === "number" && clock.stepIndex < selectedClock;
      if (!old.requested || !old.retained || old.retained.slideKey !== clock.slideKey ||
          old.retained.stepKey !== clock.stepKey || old.retained.stepPending !== clock.stepPending ||
          old.retained.phase !== clock.phase || old.activation !== activation || frozen !== old.frozen) {
        const overrun = finished ? elapsed - maxTime! : 0;
        const retained = finished ? { ...clock, slideTime: Math.max(0, clock.slideTime - overrun),
          stepTime: Math.max(0, clock.stepTime - overrun) } : clock;
        activity.value = { requested: true, active: !frozen, activation, until: 0, frozen, retained };
      }
    } else if (clock.phase === "preview" || clock.phase === "preparing" || phase === "playing" && old.activation !== activation) {
      activity.value = { requested: false, active: false, activation, until: 0, frozen: false, retained: null };
    } else if (old.requested) {
      activity.value = { requested: false, active: !old.frozen && delay > 0, activation, until: clock.slideTime + delay / 1000, frozen: old.frozen, retained: old.retained };
    } else if (old.retained?.slideKey !== clock.slideKey) {
      activity.value = { requested: false, active: false, activation, until: 0, frozen: false, retained: null };
    } else if (clock.slideTime >= old.until) {
      activity.value = { ...old, active: false };
    }
  }, [active, delay, playback, activation, phase, selectedClock, maxTime]);
  return useDerivedValue(() => {
    const old = activity.value;
    if (!active && (phase === "preview" || phase === "preparing" ||
        phase === "playing" && old.activation !== activation)) return null;
    const live = active ? playback.value : null;
    if (old.frozen && (!live || old.activation === activation && old.retained?.slideKey === live.slideKey &&
        old.retained.stepKey === live.stepKey && old.retained.phase === live.phase)) return old.retained;
    if (live) return live;
    if (!old.retained) return null;
    const current = old.active || old.requested ? playback.value : null;
    const until = old.requested && current ? current.slideTime + delay / 1000 : old.until;
    const slideTime = current ? Math.min(current.slideTime, until) : until;
    return { ...old.retained, phase: current?.phase ?? "paused",
      slideTime, stepTime: old.retained.stepTime + Math.max(0, slideTime - old.retained.slideTime) };
  }, [active, playback, activation, phase, delay]);
}

/** All shader uniforms sample the surface controller in one UI-thread evaluation. */
export function useAnimatedShaderUniforms(
  uniforms: Record<string, number | number[]>, previewTime = 0,
  { active = true, inactivityDelay = 1000, persistentBackground = false, clocks, clock = "slide", maxTime, speed = 1, slideChangeBoost = 0, slideChangeDuration = 2 }: ShaderMotion = {},
) {
  const playback = usePlayback();
  const brightnessScale=useBackgroundBrightnessScale();
  const slideIndex = usePresentationValue("slideIndex");
  const startedAt = usePresentationValue("startedAt");
  const phase = usePresentationValue("playbackPhase");
  const endTime = maxTime !== undefined && Number.isFinite(maxTime) ? Math.max(0, maxTime) : undefined;
  const shaderPlayback = useShaderPlayback(active, Number.isFinite(inactivityDelay) ? Math.max(0, inactivityDelay) : 1000,
    playback, `${slideIndex}:${startedAt ?? 0}:${clock}:${endTime ?? "live"}`, phase, clock, endTime);
  const rate = Number.isFinite(speed) ? Math.max(0, speed) : 1;
  const boost = Number.isFinite(slideChangeBoost) ? Math.max(0, slideChangeBoost) : 0;
  const duration = Math.max(0.001, Number.isFinite(slideChangeDuration) ? slideChangeDuration : 2);
  const adjusted = rate !== 1 || boost !== 0;
  const sharedMotion=useBackgroundMotion();
  const localMotion=useSharedValue({time:0,raw:0,burst:duration,slideIndex,owner:""});
  const persistent=Boolean(persistentBackground) && sharedMotion!==null;
  const integrates=adjusted && persistentBackground!=="read";
  const motion=persistent ? sharedMotion! : localMotion;
  // Background speed modulation integrates the shared elapsed clock. It owns
  // no frame loop, never caps elapsed time, and does not change step timing.
  // Do not subscribe this optional integrator to every frame for normal-speed
  // shaders. Their uniform derivation below is the only clock consumer needed.
  useAnimatedReaction(() => {
    const state = integrates ? shaderPlayback.value : null;
    return state ? { clock: state, index: slideIndex } : null;
  }, (sample) => {
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
    const state = shaderPlayback.value;
    if (!state) {
      const frozenClocks: Record<string, number> = {};
      for (const name of Object.keys(clocks ?? {})) frozenClocks[name] = previewTime;
      return { ...uniforms, ...frozenClocks, time: previewTime,
        slideTime: previewTime, stepTime: previewTime, stepIndex: 0 };
    }
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
  }, [shaderPlayback, uniforms, clocks, adjusted, persistent, previewTime, clock, brightnessScale]);
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
