/** Two half-second buckets keep a rolling ~1s sample without per-frame allocation. */
export function createFrameCadence() {
  return { previous: -1, started: -1, frames: 0, elapsed: 0, priorFrames: 0, priorElapsed: 0, fps: 0, averageMs: 0 };
}

export function sampleFrameCadence(sample: ReturnType<typeof createFrameCadence>, timestamp: number) {
  "worklet";
  if (sample.previous < 0) {
    sample.previous = sample.started = timestamp;
    return false;
  }
  const elapsed = timestamp - sample.previous;
  if (elapsed <= 0) return false;
  sample.previous = timestamp;
  sample.frames++;
  sample.elapsed += elapsed;
  if (timestamp - sample.started < 500) return false;
  const frames = sample.frames + sample.priorFrames;
  const duration = sample.elapsed + sample.priorElapsed;
  sample.fps = frames * 1000 / duration;
  sample.averageMs = duration / frames;
  sample.priorFrames = sample.frames;
  sample.priorElapsed = sample.elapsed;
  sample.frames = sample.elapsed = 0;
  sample.started = timestamp;
  return true;
}
