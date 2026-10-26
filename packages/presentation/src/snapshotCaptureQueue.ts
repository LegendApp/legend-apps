type Job = { run: () => Promise<void>; cancelled: boolean };

/** Serialize native view readbacks and leave foreground transitions free of new captures. */
export function createSnapshotCaptureQueue(
  requestFrame: (callback: () => void) => number = callback => requestAnimationFrame(callback),
  cancelFrame: (id: number) => void = id => cancelAnimationFrame(id),
) {
  const jobs: Job[] = [];
  const blockers = new Set<object>();
  let frame: number | undefined;
  let active = false;
  function pump() {
    if (active || frame !== undefined || blockers.size || !jobs.length) return;
    // One-shot layout settling, not an animation loop. At most one native
    // readback runs at a time, with a fresh frame between queued captures.
    frame = requestFrame(() => {
      frame = requestFrame(() => {
        frame = undefined;
        if (blockers.size) return;
        let job = jobs.shift();
        while (job?.cancelled) job = jobs.shift();
        if (!job) return;
        active = true;
        void job.run().catch(() => { /* Capture callers retain live content on failure. */ }).finally(() => {
          active = false;
          pump();
        });
      });
    });
  }
  return {
    enqueue(run: Job["run"]) {
      const job = { run, cancelled: false };
      jobs.push(job); pump();
      return () => {
        job.cancelled = true;
        const index = jobs.indexOf(job);
        if (index >= 0) jobs.splice(index, 1);
        if (!jobs.length && frame !== undefined) { cancelFrame(frame); frame = undefined; }
      };
    },
    block(owner: object, blocked: boolean) {
      if (blocked) blockers.add(owner); else blockers.delete(owner);
      if (blockers.size && frame !== undefined) { cancelFrame(frame); frame = undefined; }
      pump();
    },
  };
}
export const snapshotCaptureQueue = createSnapshotCaptureQueue();

/** One-shot cleanup two frames later, once a canvas (including a native UI-thread draw) no longer replays what it frees. */
export function afterTwoFrames(callback: () => void) {
  // Hidden web tabs pause frames, and their canvases with them, so free now rather than retain.
  if (typeof document !== "undefined" && document.hidden) {
    callback();
    return () => {};
  }
  let frame = requestAnimationFrame(() => { frame = requestAnimationFrame(callback); });
  return () => cancelAnimationFrame(frame);
}
