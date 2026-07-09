import { createInstrumentationLogger, type InstrumentationPayloadInput } from "@legend-desktop/instrumentation";

const diffInstrumentation = createInstrumentationLogger({
  debugId: "diff",
  memoryLabel: "DiffMemory",
  namespace: "diff",
  timingLabel: "DiffOpenTiming",
});

export const isDiffInstrumentationEnabled = diffInstrumentation.isEnabled;

export function logDiffOpenTiming(event: string, payload?: InstrumentationPayloadInput) {
  diffInstrumentation.timing(event, payload);
}

export function logDiffMemoryMark(event: string, payload?: InstrumentationPayloadInput) {
  diffInstrumentation.memory(`js.${event}`, payload);
}
