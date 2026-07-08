import { isString } from "@legendapp/state";
import { useCallback, useLayoutEffect, useRef } from "react";
import { InteractionManager } from "react-native";

declare global {
  // eslint-disable-next-line no-var
  var __LEGEND_PERF_LOG__: boolean | undefined;
  // eslint-disable-next-line no-var
  var __LEGEND_PERF_LAST_MARKS__: Record<string, number> | undefined;
  // eslint-disable-next-line no-var
  var __LEGEND_PERF_START__: number | undefined;
  // eslint-disable-next-line no-var
  var __LEGEND_PERF_COUNT_HOOK__: ((label: string) => void) | undefined;
}

globalThis.__LEGEND_PERF_LOG__ = false;

const lastMarks = globalThis.__LEGEND_PERF_LAST_MARKS__ ?? {};
globalThis.__LEGEND_PERF_LAST_MARKS__ = lastMarks;
const startTime = globalThis.__LEGEND_PERF_START__ ?? Date.now();
globalThis.__LEGEND_PERF_START__ = startTime;

export function useStableCallback<T extends (...args: any[]) => void>(unstableCallback: T): T {
  const ref = useRef<T>(unstableCallback);
  useLayoutEffect(() => {
    ref.current = unstableCallback;
  }, [unstableCallback]);
  const callback = useCallback((...args: Parameters<T>) => ref.current?.(...args), []);
  return callback as unknown as T;
}

export function useRefValue<T>(value: T) {
  const ref = useRef(value);
  useLayoutEffect(() => {
    ref.current = value;
  }, [value]);
  return ref;
}

export const isPerfLoggingEnabled = (): boolean =>
  typeof globalThis.__LEGEND_PERF_LOG__ === "boolean" ? Boolean(globalThis.__LEGEND_PERF_LOG__) : false;

export function perfLog(label: string, data?: string | Record<string, unknown> | unknown, ...args: any[]): void {
  perfMark(label, data, ...args);
}

export function perfMark(
  label: string,
  data?: string | Record<string, unknown> | unknown,
  ...args: any[]
): number | undefined {
  if (!isPerfLoggingEnabled()) {
    return undefined;
  }

  const now = Date.now();
  const last = lastMarks[label];
  lastMarks[label] = now;
  const payload: Record<string, unknown> = isString(data)
    ? { data }
    : {
        ...(typeof data === "object" ? data : { data }),
      };
  const sinceStartMs = now - startTime;

  if (typeof last === "number") {
    payload.sinceLastMs = now - last;
  }

  console.log(`${sinceStartMs} [PERF:${label}]`, payload, ...args);
  return now;
}

export function perfCount(label: string): void {
  globalThis.__LEGEND_PERF_COUNT_HOOK__?.(label);
  if (isPerfLoggingEnabled()) {
    console.count(`[PERF:${label}]`);
  }
}

export function perfDelta(label: string): number | undefined {
  if (!isPerfLoggingEnabled()) {
    return undefined;
  }

  const now = Date.now();
  const last = lastMarks[label];
  lastMarks[label] = now;
  return typeof last === "number" ? now - last : undefined;
}

export function perfTime<T>(label: string, fn: () => T): T;
export function perfTime<T>(label: string, fn: () => Promise<T>): Promise<T>;
export function perfTime<T>(label: string, fn: () => T | Promise<T>): T | Promise<T> {
  if (!isPerfLoggingEnabled()) {
    return fn();
  }

  const start = Date.now();
  try {
    const result = fn();

    if (result instanceof Promise) {
      return result.finally(() => {
        const duration = Date.now() - start;
        console.log(`[PERF:${label}] duration=${duration}ms`);
      }) as Promise<T>;
    }

    const duration = Date.now() - start;
    console.log(`[PERF:${label}] duration=${duration}ms`);
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    console.log(`[PERF:${label}] duration=${duration}ms (error)`);
    throw error;
  }
}

export const runAfterInteractions = (callback: () => void) => {
  return InteractionManager.runAfterInteractions(callback);
};

export const runAfterInteractionsWithLabel = (callback: () => void, label: string) => {
  const scheduledAt = Date.now();

  return InteractionManager.runAfterInteractions(() => {
    perfLog("runAfterInteractions", { label, waitMs: Date.now() - scheduledAt });
    callback();
  });
};
