export type ResolutionState = {
  scale: number; key: string; lastTimestamp: number | null; warmupUntil: number;
  elapsed: number; frames: number; healthyWindows: number; cooldownUntil: number;
};
export type ResolutionSample = { timestamp: number | null; playing: boolean; key: string };

export function createResolutionState(): ResolutionState {
  "worklet";
  return { scale: 1, key: "", lastTimestamp: null, warmupUntil: 0, elapsed: 0, frames: 0, healthyWindows: 0, cooldownUntil: 0 };
}

export function advanceResolution(state: ResolutionState, sample: ResolutionSample): ResolutionState {
  "worklet";
  const timestamp = sample.timestamp;
  if (!sample.playing || timestamp === null || !Number.isFinite(timestamp)) {
    return state.lastTimestamp === null ? state : { ...state, lastTimestamp: null, elapsed: 0, frames: 0, healthyWindows: 0 };
  }
  if (state.key !== sample.key || state.lastTimestamp === null || timestamp < state.lastTimestamp) {
    return { ...createResolutionState(), key: sample.key, scale: state.key === sample.key ? state.scale : 1,
      lastTimestamp: timestamp, warmupUntil: timestamp + 500, cooldownUntil: state.key === sample.key ? state.cooldownUntil : 0 };
  }
  if (timestamp === state.lastTimestamp) return state;
  const interval = Math.min(100, timestamp - state.lastTimestamp);
  if (timestamp < state.warmupUntil) return { ...state, lastTimestamp: timestamp };
  const elapsed = state.elapsed + interval, frames = state.frames + 1;
  if (elapsed < 1000) return { ...state, lastTimestamp: timestamp, elapsed, frames };
  const mean = elapsed / frames;
  const healthyWindows = mean <= 17.5 ? Math.min(5, state.healthyWindows + 1) : 0;
  const lower = mean > 18.5 && state.scale > 0.5;
  const raise = healthyWindows >= 5 && state.scale < 1;
  const change = timestamp >= state.cooldownUntil && (lower || raise);
  return { ...state, lastTimestamp: timestamp, elapsed: 0, frames: 0,
    scale: change ? Math.max(0.5, Math.min(1, state.scale + (lower ? -0.125 : 0.125))) : state.scale,
    healthyWindows: change ? 0 : healthyWindows,
    warmupUntil: change ? timestamp + 500 : state.warmupUntil,
    cooldownUntil: change ? timestamp + 3000 : state.cooldownUntil };
}
