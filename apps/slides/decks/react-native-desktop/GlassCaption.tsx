import { useSlideLifecycle } from "@legend-apps/presentation";
import { useEffect, useState } from "react";
import { glassTimeline } from "./glassShader";

const captions = ["We can fake the glass", "More refraction should help", "Perfect. Ship it."];

export function GlassCaption() {
  const { isActive, isPreview } = useSlideLifecycle();
  const [stage, setStage] = useState(0);

  useEffect(() => {
    if (!isActive || isPreview) return;
    setStage(0);
    // Only the caption updates at each beat; the host's shader clock owns motion.
    const middle = setTimeout(() => setStage(1), glassTimeline.moreRefraction * 1000);
    const peak = setTimeout(() => setStage(2), glassTimeline.peak * 1000);
    return () => {
      clearTimeout(middle);
      clearTimeout(peak);
    };
  }, [isActive, isPreview]);

  return captions[isPreview ? 2 : stage];
}
