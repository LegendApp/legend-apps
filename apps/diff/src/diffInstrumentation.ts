import { createInstrumentationLogger, type InstrumentationPayloadInput } from "@legend-apps/instrumentation";

const diffInstrumentation = createInstrumentationLogger({
  debugId: "diff-startup-boundaries-v2",
  memoryLabel: "DiffMemory",
  namespace: "diff",
  timingLabel: "DiffOpenTiming",
});

const fenwickScrollTargetInstrumentation = createInstrumentationLogger({
  debugId: "fenwick-scroll-target-v2",
  namespace: "diff",
  timingLabel: "FenwickScrollTarget",
});

declare global {
  // Temporary bridge for LegendList indexed-scroll diagnostics.
  // eslint-disable-next-line no-var
  var __LEGEND_LIST_SCROLL_TARGET_LOG__:
    | ((event: string, payload: Record<string, unknown>) => void)
    | undefined;
}

if (__DEV__) {
  const enabled = globalThis.__LEGEND_INSTRUMENTATION_ENABLED__;
  if (enabled !== true) {
    globalThis.__LEGEND_INSTRUMENTATION_ENABLED__ = {
      ...(typeof enabled === "object" ? enabled : {}),
      diff: true,
    };
  }
  globalThis.__LEGEND_LIST_SCROLL_TARGET_LOG__ = (event, payload) => {
    fenwickScrollTargetInstrumentation.timing(event, payload);
  };
  fenwickScrollTargetInstrumentation.timing("logger.ready", {
    source: "apps/diff/src/diffInstrumentation.ts",
  });
}

export const isDiffInstrumentationEnabled = diffInstrumentation.isEnabled;

export function logDiffOpenTiming(event: string, payload?: InstrumentationPayloadInput) {
  diffInstrumentation.timing(event, payload);
}

export function logDiffMemoryMark(event: string, payload?: InstrumentationPayloadInput) {
  diffInstrumentation.memory(`js.${event}`, payload);
}
