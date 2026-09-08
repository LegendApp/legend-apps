import { useSlideLifecycle } from "@legend-apps/presentation";
import { useEffect, useState } from "react";
import { glassTimeline } from "./packs/glass";

const captions = ["We can fake the glass", "More refraction should help", "Perfect. Ship it."];

export function GlassCaption() {
  const { isActive, isPreview, stepIndex, stepStartedAt } = useSlideLifecycle();
  const [timeline, setTimeline] = useState({ stage: 0, startedAt: stepStartedAt });

  useEffect(() => {
    if (!isActive || isPreview) return;
    if (stepIndex === 0) {
      return;
    }
    const elapsed = Math.max(0, (performance.now() - (stepStartedAt ?? performance.now())) / 1000);
    setTimeline({
      stage: elapsed >= glassTimeline.peak ? 2 : elapsed >= glassTimeline.moreRefraction ? 1 : 0,
      startedAt: stepStartedAt,
    });
    // Only the caption updates at each beat; the host's shader clock owns motion.
    const middle = elapsed < glassTimeline.moreRefraction
      ? setTimeout(() => setTimeline({ stage: 1, startedAt: stepStartedAt }), (glassTimeline.moreRefraction - elapsed) * 1000) : undefined;
    const peak = elapsed < glassTimeline.peak
      ? setTimeout(() => setTimeline({ stage: 2, startedAt: stepStartedAt }), (glassTimeline.peak - elapsed) * 1000) : undefined;
    return () => {
      clearTimeout(middle);
      clearTimeout(peak);
    };
  }, [isActive, isPreview, stepIndex, stepStartedAt]);

  const stage = stepIndex > 0 && timeline.startedAt === stepStartedAt ? timeline.stage : 0;
  return captions[isPreview ? 2 : stage];
}
