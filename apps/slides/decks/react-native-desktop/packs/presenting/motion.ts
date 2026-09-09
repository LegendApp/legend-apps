import { useSlideLifecycle } from "@legend-apps/presentation";
import { useEffect, useRef, useState } from "react";

/** Retarget from the current value, including reversals midway through a transition. */
export function useMotion(target: number[], duration = 600) {
  const { isActive, isPreview } = useSlideLifecycle();
  const key = JSON.stringify(target);
  const [value, setValue] = useState(target);
  const current = useRef(target);
  useEffect(() => {
    const next: number[] = JSON.parse(key);
    if (!isActive || isPreview || duration <= 0 || current.current.length !== next.length) {
      current.current = next;
      setValue(next);
      return;
    }
    const from = current.current;
    if (from.every((item, index) => item === next[index])) return;
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = t * t * (3 - 2 * t);
      current.current = next.map((item, index) => from[index] + (item - from[index]) * eased);
      setValue(current.current);
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [key, duration, isActive, isPreview]);
  return isPreview || !isActive ? target : value;
}
