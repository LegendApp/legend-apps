import { Skia, type SkImage } from "@shopify/react-native-skia";
import { useEffect, useLayoutEffect, useMemo, useState } from "react";
import { Platform } from "react-native";
import { createWorkletRuntime, runOnJS, runOnRuntime, runOnUI, useFrameCallback, useSharedValue } from "react-native-reanimated";
import { createVideoGroupState, updateVideoGroup, type SynchronizedVideo, type VideoGroupInput } from "./videoGroup";

let loadingRuntime: ReturnType<typeof createWorkletRuntime> | undefined;

/** Pass only visible sources. Change resetKey for slide entry or a reveal. */
export function useNativeVideoGroup(sources: readonly string[], { active, playing = true, resetKey, seek = null }: {
  active: boolean;
  playing?: boolean;
  resetKey: string;
  seek?: VideoGroupInput["seek"];
}) {
  const sourceKey = JSON.stringify(sources);
  const uris = useMemo(() => JSON.parse(sourceKey) as string[], [sourceKey]);
  const [loaded, setLoaded] = useState<{ key: string; players: SynchronizedVideo[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const players = loaded?.key === sourceKey ? loaded.players : null;
  const frames = useSharedValue<(SkImage | null)[]>([]);
  const state = useSharedValue(createVideoGroupState());
  const input = useSharedValue<VideoGroupInput>({ active, playing, resetKey, seek });
  const frame = useFrameCallback(() => {
    "worklet";
    if (!players?.length) return;
    const previous = state.value;
    if (previous.phase === "paused" || previous.phase === "error") return;
    const next = updateVideoGroup(previous, players, input.value, players[0].syncHostTime());
    state.value = next;
    if (next.phase === "playing" || (previous.phase === "preparing" && next.phase === "paused")) {
      // Publish all images in one UI transaction, after the entire seek barrier.
      frames.value = players.map(player => player.nextImage());
    }
    if (previous.phase === "preparing" && (next.phase === "playing" || next.phase === "paused")) runOnJS(setError)(null);
    if (next.phase === "error") runOnJS(setError)("Native video group preparation failed.");
  }, false);

  useEffect(() => {
    let cancelled = false;
    let owned: SynchronizedVideo[] = [];
    setError(null);
    if (Platform.OS !== "macos") {
      setError("Synchronized native video groups require macOS.");
      return;
    }
    const accept = (result: SynchronizedVideo[]) => {
      if (cancelled) {
        runOnUI(() => { "worklet"; for (const player of result) player.dispose(); })();
      } else {
        owned = result;
        setLoaded({ key: sourceKey, players: result });
      }
    };
    const reject = (message: string) => { if (!cancelled) setError(message); };
    loadingRuntime ??= createWorkletRuntime("slides-video-group-loading");
    runOnRuntime(loadingRuntime, (paths: string[]) => {
      "worklet";
      const result: SynchronizedVideo[] = [];
      try {
        for (const path of paths) {
          const player = Skia.Video(path) as SynchronizedVideo | null;
          if (!player) throw new Error(`Could not load video: ${path}`);
          result.push(player);
          if (typeof player.prepareSync !== "function" || player.syncStatus() === -2) {
            throw new Error("Native video synchronization is unavailable; rebuild with the Skia synchronization patch.");
          }
          if (!Number.isFinite(player.duration()) || player.duration() <= 0) throw new Error(`Video has no finite duration: ${path}`);
          player.setLooping(false);
          player.setVolume(0);
        }
        runOnJS(accept)(result);
      } catch (failure) {
        for (const player of result) player.dispose();
        runOnJS(reject)(String(failure));
      }
    })(uris);
    return () => {
      cancelled = true;
      frame.setActive(false);
      setLoaded(null);
      const previous = owned;
      runOnUI(() => {
        "worklet";
        frames.value = [];
        state.value = createVideoGroupState();
        for (const player of previous) player.dispose();
      })();
    };
  }, [sourceKey, uris, frame, frames, state]);

  const seekId = seek?.id ?? null;
  const seekPosition = seek?.position ?? 0;
  useLayoutEffect(() => {
    runOnUI(() => {
      "worklet";
      input.value = { active, playing, resetKey, seek: seekId === null ? null : { id: seekId, position: seekPosition } };
      if (!players?.length) return;
      state.value = updateVideoGroup(state.value, players, input.value, players[0].syncHostTime());
      if (!active) frames.value = [];
    })();
    frame.setActive(active && !!players?.length);
    return () => frame.setActive(false);
  }, [active, playing, resetKey, seekId, seekPosition, players, input, state, frames, frame]);

  return { frames, state, error };
}
export type NativeVideoGroup = ReturnType<typeof useNativeVideoGroup>;
