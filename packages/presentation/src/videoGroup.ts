import type { Video } from "@shopify/react-native-skia";

/** macOS Skia extension supplied by the repository patch. Times are milliseconds. */
export type SynchronizedVideo = Video & {
  prepareSync(position: number): void;
  syncStatus(): number; // -2 unsupported, -1 failed, 0 preparing, 1 decoded, 2 final frame decoded after native end
  playSync(position: number, hostTime: number): void;
  syncHostTime(): number;
};
export type VideoGroupInput = {
  active: boolean;
  playing: boolean;
  restartHoldMs?: number;
  resetKey: string;
  seek: { id: number; position: number } | null;
};
export type VideoGroupState = {
  phase: "inactive" | "preparing" | "paused" | "playing" | "error";
  resetKey: string | null;
  seekId: number | null;
  position: number;
  duration: number;
  cycle: number;
  origin: number;
  hostStart: number;
  preparingAt: number;
};
export function createVideoGroupState(): VideoGroupState {
  "worklet";
  return { phase: "inactive", resetKey: null, seekId: null, position: 0, duration: 0, cycle: 0, origin: 0, hostStart: 0, preparingAt: 0 };
}
function prepare(players: SynchronizedVideo[], position: number) {
  "worklet";
  for (const player of players) player.prepareSync(Math.min(position, Math.max(0, player.duration() - 1)));
}
/** Runs only on the UI runtime. Native players share the host clock, not JS ticks. */
export function updateVideoGroup(previous: VideoGroupState, players: SynchronizedVideo[], input: VideoGroupInput, now: number): VideoGroupState {
  "worklet";
  const duration = Math.max(0, ...players.map(player => player.duration()));
  if (!input.active) {
    if (previous.phase !== "inactive") prepare(players, 0);
    return { ...createVideoGroupState(), duration };
  }
  const restart = previous.phase === "inactive" || previous.resetKey !== input.resetKey;
  let state = { ...previous, duration };
  if (state.phase === "playing") state.position = Math.min(duration, state.origin + Math.max(0, now - state.hostStart));
  const seekChanged = !restart && input.seek !== null && input.seek.id !== state.seekId;
  const pause = state.phase === "playing" && !input.playing;
  const resume = state.phase === "paused" && input.playing;
  const ended = state.phase === "playing" && state.position >= duration
    && players.every(player => player.duration() < duration || player.syncStatus() === 2);
  if (restart || seekChanged || pause || resume || ended) {
    state = { ...state, phase: "preparing", resetKey: input.resetKey, seekId: input.seek?.id ?? (restart ? null : state.seekId),
      position: restart || ended || (resume && state.position >= duration) ? 0 : seekChanged ? Math.min(duration, Math.max(0, input.seek?.position ?? 0)) : state.position,
      cycle: restart ? 0 : ended ? state.cycle + 1 : state.cycle, preparingAt: now };
    prepare(players, state.position);
    return state;
  }
  if (state.phase === "error") return state;
  if (players.some(player => player.syncStatus() < 0) || (state.phase === "preparing" && now - state.preparingAt > 15000)) {
    prepare(players, state.position);
    return { ...state, phase: "error" };
  }
  if (state.phase === "preparing" && players.length > 0 && players.every(player => player.syncStatus() === 1)) {
    if (input.playing && state.position >= duration) {
      prepare(players, 0);
      return { ...state, position: 0, cycle: state.cycle + 1, preparingAt: now };
    }
    state.phase = input.playing ? "playing" : "paused";
    state.origin = state.position;
    // Keep decoded first frames visible until the common native start deadline.
    state.hostStart = now + (state.position === 0 ? Math.max(100, input.restartHoldMs ?? 0) : 100);
    if (input.playing) {
      for (const player of players) {
        if (state.position < player.duration()) player.playSync(state.position, state.hostStart);
      }
    }
  }
  return state;
}
