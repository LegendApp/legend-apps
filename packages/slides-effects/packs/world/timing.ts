import type { PlaybackState } from "@legend-apps/presentation";
import type { ClockSample } from "./camera";
import { easeProgress } from "./camera";

export type WorldClock = "global" | "slide" | "step";
export type CatchUp = { request: number; key: string; start: number; from: number; to: number };

/** Pure UI-clock projection: never changes the presentation's authoritative time. */
export function sampleWorldClock(state: PlaybackState, previewTime: number, mode: WorldClock,
  duration: number | undefined, settledBack: boolean, catchUp: CatchUp | null = null, advanceDuration = 0.3): ClockSample {
  "worklet";
  const fixed = state.phase === "preview" ? previewTime : 0;
  const live = state.phase !== "preview" && state.phase !== "preparing";
  const slideTime = live ? state.slideTime : fixed, stepTime = live ? state.stepTime : fixed;
  let time = mode === "step" ? stepTime : slideTime;
  if (live && settledBack && duration !== undefined) time += duration;
  if (live && catchUp && catchUp.key === `${state.slideKey}/${state.stepKey}`) {
    const progress = advanceDuration <= 0 ? 1 : (slideTime - catchUp.start) / advanceDuration;
    time = catchUp.from + (catchUp.to - catchUp.from) * easeProgress(progress, "smoothstep");
  }
  if (mode === "step") return { slideTime: time, stepTime: time, stepIndex: state.stepIndex, stepOrigins: { [state.stepIndex]: 0 }, entryTime: state.stepIndex > 0 ? Infinity : time };
  const delta = time - slideTime;
  return { slideTime: time, stepTime: stepTime + delta, stepIndex: state.stepIndex, stepOrigins: state.stepOrigins };
}
