import NativeInstrumentation from "./NativeInstrumentation";

declare const __DEV__: boolean | undefined;

declare global {
  // eslint-disable-next-line no-var
  var __LEGEND_INSTRUMENTATION_ENABLED__: boolean | Record<string, boolean> | undefined;
  // eslint-disable-next-line no-var
  var __LEGEND_BENCHMARK_LOG_URL__: boolean | string | undefined;
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
  debugId?: string;
  memoryLabel?: string;
  namespace: string;
  timingLabel?: string;
};

export function instrumentationNowMs() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function isDev() {
  return typeof __DEV__ !== "undefined" && __DEV__;
}

function getEnvValue(name: string) {
  const processValue = (globalThis as typeof globalThis & {
    process?: { env?: Record<string, string | undefined> };
  }).process;
  return processValue?.env?.[name];
}

function isTruthyFlag(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
}

function isFalseyFlag(value: string) {
  const normalized = value.trim().toLowerCase();
  return normalized === "0" || normalized === "false" || normalized === "no" || normalized === "off";
}

function isNamespaceEnabled(namespace: string, value: string) {
  const normalized = value.trim().toLowerCase();
  if (isTruthyFlag(normalized) || normalized === "all" || normalized === "*") {
    return true;
  }
  if (isFalseyFlag(normalized)) {
    return false;
  }
  return normalized
    .split(/[\s,]+/)
    .filter(Boolean)
    .includes(namespace.toLowerCase());
}

function getNamespaceEnabledOverride(namespace: string) {
  const value = globalThis.__LEGEND_INSTRUMENTATION_ENABLED__;
  if (typeof value === "boolean") {
    return value;
  }
  if (value && typeof value === "object") {
    return Boolean(value[namespace]);
  }
  const envValue = getEnvValue("EXPO_PUBLIC_LEGEND_INSTRUMENTATION") ?? getEnvValue("LEGEND_INSTRUMENTATION");
  if (envValue !== undefined) {
    return isNamespaceEnabled(namespace, envValue);
  }
  return undefined;
}

export function isInstrumentationEnabled(namespace = "default") {
  return isDev() && (getNamespaceEnabledOverride(namespace) ?? false);
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

function getBenchmarkLogUrl() {
  const globalValue = globalThis.__LEGEND_BENCHMARK_LOG_URL__;
  if (typeof globalValue === "string") {
    return globalValue;
  }
  if (globalValue === true) {
    return "http://127.0.0.1:19395/log";
  }

  const envValue = getEnvValue("EXPO_PUBLIC_LEGEND_BENCHMARK_LOG_URL") ?? getEnvValue("LEGEND_BENCHMARK_LOG_URL");
  if (!envValue || isFalseyFlag(envValue)) {
    return null;
  }
  return isTruthyFlag(envValue) ? "http://127.0.0.1:19395/log" : envValue;
}

function sendBenchmarkLog(message: string) {
  const url = getBenchmarkLogUrl();
  if (isDev() && url) {
    fetch(url, {
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
  debugId,
  memoryLabel,
  namespace,
  timingLabel,
}: CreateInstrumentationLoggerOptions): InstrumentationLogger {
  const instrumentationDebugId = debugId ?? namespace;
  const timingLogLabel = timingLabel ?? namespace;
  const memoryLogLabel = memoryLabel ?? namespace;
  let seq = 0;
  const withMetadata = (payload?: InstrumentationPayloadInput) => () => ({
    ...resolvePayload(payload),
    debugId: instrumentationDebugId,
    seq: ++seq,
  });
  return {
    isEnabled: () => isInstrumentationEnabled(namespace),
    memory: (event, payload) => logInstrumentation("memory", namespace, memoryLogLabel, event, withMetadata(payload)),
    timing: (event, payload) => logInstrumentation("timing", namespace, timingLogLabel, event, withMetadata(payload)),
  };
}
