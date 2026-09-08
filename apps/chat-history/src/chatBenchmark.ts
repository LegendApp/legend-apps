import type { ChatProvider, ChatSummary } from "@legend-apps/chat-history";
import { writeApplicationSupportJson } from "@legend-apps/storage/src/applicationSupport";
import { getReactNativeStartupTiming } from "@legend-apps/window-manager";

const benchmarkArgumentPrefix = "--chat-history-benchmark=";
const defaultTopDelayMs = 0;

export type ChatBenchmarkTarget = Pick<ChatSummary, "id" | "provider">;

export type ChatBenchmarkFixture = ChatSummary & {
  provider: ChatProvider;
  sha256: string;
  sourceBytes: number;
};

export type ChatBenchmarkConfig = {
  eventFileName: string;
  loadImages: boolean;
  switchDelayMs: number;
  topDelayMs: number;
  targets: [ChatBenchmarkTarget, ChatBenchmarkTarget];
  version: 2;
};

export type ChatBenchmarkContentReadyEvent = {
  discoveryMs?: number;
  durationMs: number;
  name: "contentReady";
  path: string;
  phase: "initial" | "switch";
  recordCount: number;
  rowCount: number;
  sourceBytes: number;
  timing: {
    documentMs: number;
    loadMs: number;
    nativeTotalMs: number;
    parseMs: number;
    scanMs: number;
  };
};

export type ChatBenchmarkContentDigestEvent = {
  contentDigest: string;
  name: "contentDigest";
  path: string;
  phase: "initial" | "switch";
};

export type ChatBenchmarkViewportReadyEvent = {
  durationMs: number;
  name: "viewportReady";
  path: string;
  phase: "top";
};

export type ChatBenchmarkEvent =
  | ChatBenchmarkContentDigestEvent
  | ChatBenchmarkContentReadyEvent
  | ChatBenchmarkViewportReadyEvent
  | { name: "windowShown" };
type LoggedChatBenchmarkEvent = ChatBenchmarkEvent & {
  reactNativeClockOffsetMs?: number;
  reactNativeStartupTiming?: ReturnType<typeof getReactNativeStartupTiming>;
  timestampMs: number;
};
type PendingChatBenchmarkEvent = {
  event: ChatBenchmarkEvent;
  timestampMs: number;
};
const eventsByFile = new Map<string, LoggedChatBenchmarkEvent[]>();
const pendingEventsByFile = new Map<string, PendingChatBenchmarkEvent[]>();
const flushTimersByFile = new Map<string, ReturnType<typeof setTimeout>>();

export function getChatBenchmarkConfig(launchArguments?: string[]) {
  const encoded = launchArguments
    ?.find((argument) => argument.startsWith(benchmarkArgumentPrefix))
    ?.slice(benchmarkArgumentPrefix.length);
  if (!encoded) {
    return undefined;
  }
  try {
    const config = JSON.parse(decodeURIComponent(encoded)) as Partial<ChatBenchmarkConfig>;
    const topDelayMs = config.topDelayMs ?? defaultTopDelayMs;
    return config.version === 2
      && Array.isArray(config.targets) && config.targets.length === 2
      && typeof config.eventFileName === "string" && config.eventFileName.length > 0
      && typeof config.loadImages === "boolean"
      && typeof config.switchDelayMs === "number" && Number.isFinite(config.switchDelayMs) && config.switchDelayMs >= 0
      && typeof topDelayMs === "number" && Number.isFinite(topDelayMs) && topDelayMs >= 0
      ? { ...config, topDelayMs } as ChatBenchmarkConfig
      : undefined;
  } catch {
    return undefined;
  }
}

function flushChatBenchmarkEvents(config: ChatBenchmarkConfig) {
  flushTimersByFile.delete(config.eventFileName);
  const pendingEvents = pendingEventsByFile.get(config.eventFileName);
  if (!pendingEvents) {
    return;
  }
  pendingEventsByFile.delete(config.eventFileName);
  const events = eventsByFile.get(config.eventFileName) ?? [];
  for (const pending of pendingEvents) {
    const startupTiming = pending.event.name === "contentReady" || pending.event.name === "windowShown"
      ? getReactNativeStartupTiming()
      : undefined;
    const nativeWindowTime = startupTiming?.mainWindowFirstVisibleTime;
    const clockOffset = startupTiming?.clockOffsetMs;
    // The host is presented before React mounts. Convert its native timestamp only
    // during the deferred flush so reporting still does no work on the layout path.
    const timestampMs = pending.event.name === "windowShown"
      && typeof nativeWindowTime === "number" && nativeWindowTime > 0 && Number.isFinite(nativeWindowTime)
      && typeof clockOffset === "number" && Number.isFinite(clockOffset)
      ? nativeWindowTime + clockOffset
      : pending.timestampMs;
    events.push({
      ...pending.event,
      reactNativeClockOffsetMs: startupTiming?.clockOffsetMs,
      reactNativeStartupTiming: startupTiming,
      timestampMs,
    });
  }
  eventsByFile.set(config.eventFileName, events);
  writeApplicationSupportJson(`chat-history-benchmark/${config.eventFileName}`, events);
}

export function emitChatBenchmarkEvent(config: ChatBenchmarkConfig, event: ChatBenchmarkEvent) {
  const pendingEvents = pendingEventsByFile.get(config.eventFileName) ?? [];
  pendingEvents.push({ event, timestampMs: Date.now() });
  pendingEventsByFile.set(config.eventFileName, pendingEvents);
  if (!flushTimersByFile.has(config.eventFileName)) {
    // Keep benchmark diagnostics and disk I/O outside layout and visual-readiness callbacks.
    flushTimersByFile.set(config.eventFileName, setTimeout(() => {
      flushChatBenchmarkEvents(config);
    }, 0));
  }
}
