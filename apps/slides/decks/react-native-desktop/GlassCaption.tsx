import { useSlideLifecycle } from "@legend-apps/presentation";
import { useEffect, useState } from "react";
import { glassTimeline } from "./glassShader";

const captions = ["We can fake the glass", "More refraction should help", "Perfect. Ship it."];

export function GlassCaption() {
  const { isActive, isPreview, startedAt } = useSlideLifecycle();
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (!isActive || isPreview) return;
    const elapsed = Math.max(0, (performance.now() - (startedAt ?? performance.now())) / 1000);
    setStage(elapsed >= glassTimeline.peak ? 2 : elapsed >= glassTimeline.moreRefraction ? 1 : 0);
    // Only the caption updates at each beat; the host's shader clock owns motion.
    const middle = elapsed < glassTimeline.moreRefraction
      ? setTimeout(() => setStage(1), (glassTimeline.moreRefraction - elapsed) * 1000) : undefined;
    const peak = elapsed < glassTimeline.peak
      ? setTimeout(() => setStage(2), (glassTimeline.peak - elapsed) * 1000) : undefined;
    return () => {
      clearTimeout(middle);
      clearTimeout(peak);
    };
  }, [isActive, isPreview, startedAt]);

  return captions[isPreview ? 2 : stage];
}
