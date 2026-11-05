import { mixVector, shotOrigin, type ClockSample, type Vec3 } from "./camera";
import type { TubePulse } from "./stage";

export function routePoint(points: Vec3[], lengths: number[], distance: number): Vec3 {
  "worklet";
  const end = lengths[lengths.length - 1], d = Math.max(0, Math.min(end, distance));
  let segment = 0;
  while (segment < points.length - 2 && lengths[segment + 1] < d) segment++;
  return mixVector(points[segment], points[segment + 1], (d - lengths[segment]) / (lengths[segment + 1] - lengths[segment]));
}
export function tubePulseProgress(pulse: TubePulse, clock: ClockSample) {
  "worklet";
  if (pulse.at === undefined && clock.stepIndex < (pulse.step ?? 0)) return -1;
  if (pulse.at === undefined && clock.stepIndex > (pulse.step ?? 0) && clock.stepOrigins[pulse.step ?? 0] === undefined) return 2;
  const elapsed = clock.slideTime - shotOrigin(pulse, clock) - (pulse.delay ?? 0);
  return (pulse.every && elapsed >= 0 ? elapsed % pulse.every : elapsed) / (pulse.duration ?? 0.5);
}
// Clockwise from the top, with the middle segment last.
export const digitSegments = [63, 6, 91, 79, 102, 109, 125, 7, 127, 111];
