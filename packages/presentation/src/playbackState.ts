export type PlaybackPhase = "preparing" | "preview" | "playing" | "outgoing" | "paused";

export interface PlaybackInput {
  phase: PlaybackPhase;
  slideKey: string;
  stepKey: string;
  stepIndex: number;
}

export interface PlaybackState extends PlaybackInput {
  slideTime: number;
  stepTime: number;
  lastTimestamp: number | null;
  stepPending: boolean;
  stepOrigins: Record<number, number>;
}

export function createPlaybackState(input: PlaybackInput): PlaybackState {
  "worklet";
  return { ...input, slideTime: 0, stepTime: 0, lastTimestamp: null, stepPending: false, stepOrigins: { [input.stepIndex]: 0 } };
}

export function transitionPlayback(state: PlaybackState, input: PlaybackInput): PlaybackState {
  "worklet";
  if (state.phase === input.phase && state.slideKey === input.slideKey &&
      state.stepKey === input.stepKey && state.stepIndex === input.stepIndex) {
    return state;
  }

  // Outgoing projections can lose their activation keys. They must retain the
  // exact live frame and identity rather than interpreting that as a new slide.
  if (input.phase === "outgoing" || input.phase === "paused") {
    if (state.phase === input.phase) return state;
    return { ...state, phase: input.phase, lastTimestamp: null };
  }

  const slideChanged = state.slideKey !== input.slideKey;
  const stepChanged = state.stepKey !== input.stepKey || state.stepIndex !== input.stepIndex;
  const enteringPlayback = input.phase === "playing" && state.phase !== "playing";
  const restart = slideChanged || input.phase === "preparing" ||
    (enteringPlayback && state.phase !== "paused");
  return {
    ...input,
    stepOrigins: restart ? { [input.stepIndex]: 0 } : stepChanged
      ? { ...Object.fromEntries(Object.entries(state.stepOrigins).filter(([step]) => Number(step) < input.stepIndex)),
          [input.stepIndex]: state.slideTime } : state.stepOrigins,
    slideTime: restart ? 0 : state.slideTime,
    stepTime: restart || stepChanged ? 0 : state.stepTime,
    lastTimestamp: restart || enteringPlayback || input.phase !== "playing" ? null : state.lastTimestamp,
    // A step begins on its first rendered tick, while the slide clock keeps running.
    stepPending: !restart && input.phase === "playing" && (stepChanged || state.stepPending),
  };
}

export function advancePlayback(state: PlaybackState, timestamp: number): PlaybackState {
  "worklet";
  if (state.phase !== "playing" || !Number.isFinite(timestamp) ||
      (state.lastTimestamp !== null && timestamp <= state.lastTimestamp)) {
    return state;
  }
  const elapsed = state.lastTimestamp === null ? 0 : (timestamp - state.lastTimestamp) / 1000;
  return {
    ...state,
    slideTime: state.slideTime + elapsed,
    stepOrigins: state.stepPending ? { ...state.stepOrigins, [state.stepIndex]: state.slideTime + elapsed } : state.stepOrigins,
    stepTime: state.stepPending ? 0 : state.stepTime + elapsed,
    lastTimestamp: timestamp,
    stepPending: false,
  };
}
