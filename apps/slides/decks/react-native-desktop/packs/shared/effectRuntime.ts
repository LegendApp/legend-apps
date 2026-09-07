import { useSlideLifecycle } from "@legend-apps/presentation";
import { useEffect, useState } from "react";

export function clamp01(value: number) {
  return Math.max(0, Math.min(1, value));
}

export function smooth(value: number) {
  const clamped = clamp01(value);
  return clamped * clamped * (3 - 2 * clamped);
}

export function stage(time: number, start: number, duration: number) {
  return smooth((time - start) / duration);
}

export function useEffectTime(previewTime: number) {
  const { isActive, isPreview, startedAt } = useSlideLifecycle();
  const [time, setTime] = useState(isPreview ? previewTime : 0);

  useEffect(() => {
    if (isPreview) {
      setTime(previewTime);
      return;
    }
    if (!isActive) return;
    let frame = 0;
    const epoch = startedAt ?? performance.now();
    const update = (now: number) => {
      setTime(Math.max(0, now - epoch) / 1000);
      frame = requestAnimationFrame(update);
    };
    setTime(Math.max(0, performance.now() - epoch) / 1000);
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [isActive, isPreview, previewTime, startedAt]);

  return time;
}
