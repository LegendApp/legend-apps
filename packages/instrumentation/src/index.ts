import NativeInstrumentation from "./NativeInstrumentation";

declare const __DEV__: boolean | undefined;

declare global {
  // eslint-disable-next-line no-var
  var __LEGEND_INSTRUMENTATION_ENABLED__: boolean | Record<string, boolean> | undefined;
}

export type InstrumentationPayload = Record<string, unknown>;
export type InstrumentationPayloadFactory = () => InstrumentationPayload;
export type InstrumentationPayloadInput = InstrumentationPayload | InstrumentationPayloadFactory;
export type InstrumentationKind = "memory" | "timing";

export type InstrumentationLogger = {
  isEnabled: () => boolean;
  memory: (event: string, payload?: InstrumentationPayloadInput) => void;
  timing: (event: string, payload?: InstrumentationPayloadInput) => void;
};

export type CreateInstrumentationLoggerOptions = {
  memoryLabel?: string;
  namespace: string;
  timingLabel?: string;
};

function isDev() {
  return typeof __DEV__ !== "undefined" && __DEV__;
}

function getNamespaceEnabledOverride(namespace: string) {
  const value = globalThis.__LEGEND_INSTRUMENTATION_ENABLED__;
  if (typeof value === "boolean") {
    return value;
  }
  if (value && typeof value === "object") {
    return Boolean(value[namespace]);
  }
  return undefined;
}

export function isInstrumentationEnabled(namespace = "default") {
  return getNamespaceEnabledOverride(namespace) ?? isDev();
}

function resolvePayload(payload: InstrumentationPayloadInput | undefined) {
  return typeof payload === "function" ? payload() : payload ?? {};
}

function safeStringify(value: unknown) {
  try {
    return JSON.stringify(value);
  } catch {
    return JSON.stringify({ error: "Unable to serialize instrumentation payload." });
  }
}

function sendBenchmarkLog(message: string) {
  if (isDev()) {
    fetch("http://127.0.0.1:19395/log", {
      body: message,
      method: "POST",
    }).catch(() => {});
  }
}

export function logInstrumentation(
  kind: InstrumentationKind,
  namespace: string,
  label: string,
  event: string,
  payload?: InstrumentationPayloadInput,
) {
  if (isInstrumentationEnabled(namespace)) {
    const resolvedPayload = resolvePayload(payload);
    const message = `${Date.now()} [${label}] ${event} ${safeStringify(resolvedPayload)}`;
    console.info(message);
    sendBenchmarkLog(message);
    NativeInstrumentation?.log(kind, message);
  }
}

export function createInstrumentationLogger({
  memoryLabel,
  namespace,
  timingLabel,
}: CreateInstrumentationLoggerOptions): InstrumentationLogger {
  const timingLogLabel = timingLabel ?? namespace;
  const memoryLogLabel = memoryLabel ?? namespace;
  return {
    isEnabled: () => isInstrumentationEnabled(namespace),
    memory: (event, payload) => logInstrumentation("memory", namespace, memoryLogLabel, event, payload),
    timing: (event, payload) => logInstrumentation("timing", namespace, timingLogLabel, event, payload),
  };
}
