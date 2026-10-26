// Temporary diagnose probe. Bounded, disabled until the native launch flag is
// acknowledged, and batches cross the bridge rather than individual row events.
export const SCROLL_TRACE_STATUS = -7100;
export const SCROLL_TRACE_BATCH = -7101;
export function createScrollTrace() {
  let enabled = false;
  let seq = 0;
  let dropped = 0;
  let events: { timestamp: number; seq: number; event: string; fields: Record<string, unknown> }[] = [];
  return {
    get enabled() { return enabled; },
    enable() { enabled = true; },
    record(event: string, fields: Record<string, unknown>) {
      if (!enabled) return;
      if (events.length >= 4000) { dropped++; return; }
      events.push({ timestamp: Date.now(), seq: ++seq, event, fields });
    },
    drain() {
      const batch = JSON.stringify({ events, dropped }); events = []; dropped = 0; return batch;
    },
    stop() { enabled = false; events = []; dropped = 0; },
  };
}
