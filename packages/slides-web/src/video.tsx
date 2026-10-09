import { useEffect, useMemo, useRef } from "react";
import type { SharedValue } from "react-native-reanimated";
import { preloadedSource } from "./preload";
export function NativeVideoView({ source, poster, playing, position, looping = true }: {
  source: string; poster: string; playing: boolean; position?: SharedValue<number>; looping?: boolean;
}) {
  const ref = useRef<HTMLVideoElement>(null);
  const mediaSource = useMemo(() => preloadedSource(source), [source]);
  const mediaPoster = useMemo(() => preloadedSource(poster), [poster]);
  useEffect(() => {
    const video = ref.current!;
    let live = true;
    if (playing) void video.play().catch(error => {
      if (live && error.name !== "AbortError") window.dispatchEvent(new ErrorEvent("error", { message: String(error) }));
    });
    else video.pause();
    return () => { live = false; };
  }, [playing, source]);
  return <video ref={ref} src={mediaSource} poster={mediaPoster} muted playsInline loop={looping} preload="auto"
    onLoadedMetadata={event => { if (position) event.currentTarget.currentTime = Math.min(event.currentTarget.duration, Math.max(0, position.value / 1000)); }}
    onTimeUpdate={event => { if (position) position.value = event.currentTarget.currentTime * 1000; }}
    onError={event => window.dispatchEvent(new ErrorEvent("error", { message: `Could not load video: ${source}: ${event.currentTarget.error?.message}` }))}
    style={{ width: "100%", height: "100%", objectFit: "contain" }} />;
}
