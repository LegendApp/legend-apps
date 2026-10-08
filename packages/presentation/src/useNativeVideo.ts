import { Skia, useVideo, type SkImage, type Video } from "@shopify/react-native-skia";
import { Platform } from "react-native";
import { useEffect, useMemo, useState } from "react";
import { createWorkletRuntime, runOnJS, runOnRuntime, runOnUI, useDerivedValue, useFrameCallback, useSharedValue, useAnimatedReaction, type SharedValue } from "react-native-reanimated";

let loadingRuntime: ReturnType<typeof createWorkletRuntime> | undefined;

/** Retain the player and last decoded frame, but stop polling while paused. */
function useMacNativeVideo(source: string | null, playing: boolean, position?: SharedValue<number>, looping = true) {
  const [loaded, setLoaded] = useState<{ source: string; video: Video } | null>(null);
  const [failure, setFailure] = useState<{ source: string; message: string } | null>(null);
  const [readyVideo, setReadyVideo] = useState<Video | null>(null);
  const video = loaded?.source === source ? loaded.video : null;
  const currentFrame = useSharedValue<SkImage | null>(null);
  const currentTime = useSharedValue(0);
  const seeking = useSharedValue<number | null>(null);
  const metadata = useMemo(() => ({ duration: video?.duration() ?? 0,
    framerate: video?.framerate() ?? 0, rotation: video?.rotation() ?? 0,
    size: video?.size() ?? { width: 0, height: 0 } }), [video]);
  const hasFrame = useSharedValue(false);
  const frame = useFrameCallback(() => {
    "worklet";
    if (!video || (!playing && hasFrame.value)) return;
    currentTime.value = video.currentTime();
    if (seeking.value !== null) {
      if (Math.abs(currentTime.value - seeking.value) > 250) return;
      seeking.value = null;
    }
    const image = video.nextImage();
    if (image) {
      if (position) position.value = currentTime.value;
      currentFrame.value = image;
      if (!hasFrame.value) {
        hasFrame.value = true;
        runOnJS(setReadyVideo)(video);
      }
    }
  }, false);

  // Loading is an external resource lifecycle, not an animation clock. Metadata
  // stays on the background runtime, as in Skia's loader.
  useEffect(() => {
    if (!source) return;
    let cancelled = false;
    let owned: Video | null = null;
    const accept = (result: Video) => {
      if (cancelled) {
        runOnUI(() => { "worklet"; result.dispose(); })();
        return;
      }
      owned = result;
      setLoaded({ source, video: result });
    };
    const reject = (message: string) => {
      if (!cancelled) setFailure({ source, message });
    };
    setFailure(null);
    loadingRuntime ??= createWorkletRuntime("slides-video-loading");
    runOnRuntime(loadingRuntime, (uri: string) => {
      "worklet";
      try {
        const result = Skia.Video(uri) as Video | null;
        if (result) runOnJS(accept)(result);
        else runOnJS(reject)("Could not load video.");
      } catch (error) {
        runOnJS(reject)(String(error));
      }
    })(source);
    return () => {
      cancelled = true;
      setLoaded(null);
      setReadyVideo(null);
      frame.setActive(false);
      const previous = owned;
      runOnUI(() => {
        "worklet";
        currentFrame.value = null;
        currentTime.value = 0;
        hasFrame.value = false;
        seeking.value = null;
        previous?.dispose();
      })();
    };
  }, [source, frame, currentFrame, currentTime, hasFrame, seeking]);

  useEffect(() => {
    if (!video || !position) return;
    runOnUI(() => {
      "worklet";
      const time = Math.min(video.duration(), Math.max(0, position.value));
      seeking.value = time;
      video.seek(time);
    })();
  }, [video, position, seeking]);

  useEffect(() => {
    if (!video) return;
    runOnUI(() => {
      "worklet";
      video.setLooping(looping);
      video.setVolume(0);
      if (playing) video.play(); else video.pause();
    })();
    // A paused new player gets its first frame once, then retains it without
    // repeatedly creating native image wrappers or invalidating its canvas.
    frame.setActive(playing || readyVideo !== video);
    return () => frame.setActive(false);
  }, [video, playing, readyVideo, frame, looping]);

  return { currentFrame, currentTime, ...metadata, error: failure?.source === source ? failure.message : null };
}

// Other platforms retain Skia's platform-specific texture and loading handling.
function useStandardNativeVideo(source: string | null, playing: boolean, position?: SharedValue<number>, looping = true) {
  const paused = useDerivedValue(() => !playing, [playing]);
  const repeat = useDerivedValue(() => looping, [looping]);
  const seek = useSharedValue<number | null>(null);
  const video = useVideo(source, { paused, looping: repeat, volume: 0, seek });
  useEffect(() => {
    if (!position || !video.duration) return;
    runOnUI(() => { "worklet"; seek.value = Math.max(0, position.value); })();
  }, [video.duration, position, seek]);
  useAnimatedReaction(() => video.currentTime.value, time => {
    "worklet";
    if (position && time > 0) position.value = time;
  }, [video.currentTime, position]);
  return { ...video, error: null };
}
export const useNativeVideo = Platform.OS === "macos" ? useMacNativeVideo : useStandardNativeVideo;
