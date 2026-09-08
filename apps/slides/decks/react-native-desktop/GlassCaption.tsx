import { usePresentation } from "@legend-apps/presentation";
import { useEffect, useState } from "react";
import { glassTimeline } from "./packs/glass";

const captions = ["We can fake the glass", "More refraction should help", "Perfect. Ship it."];

export function GlassCaption() {
  const { isActive, isPreview, isPreparing, stepIndex, stepEpochs } = usePresentation();
  const startedAt = stepEpochs?.[1];
  const [completedEpoch, setCompletedEpoch] = useState<number>();

  useEffect(() => {
    if (!isActive || isPreview || stepIndex < 1 || startedAt === undefined) return;
    const elapsed = Math.max(0, (performance.now() - startedAt) / 1000);
    const timeout = setTimeout(() => setCompletedEpoch(startedAt), Math.max(0, glassTimeline.peak - elapsed) * 1000);
    return () => clearTimeout(timeout);
  }, [isActive, isPreview, stepIndex, startedAt]);

  // The first advance acknowledges the action in the same render as navigation.
  // Only the final punchline waits for the animation clock.
  if (stepIndex < 1) return captions[0];
  if (isPreview && !isPreparing) return captions[2];
  return captions[startedAt !== undefined && completedEpoch === startedAt ? 2 : 1];
}
