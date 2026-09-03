import type { ChatProvider, ChatSummary } from "@legend-apps/chat-history";
import { writeApplicationSupportJson } from "@legend-apps/storage/src/applicationSupport";
import { getReactNativeStartupTiming } from "@legend-apps/window-manager";

const benchmarkArgumentPrefix = "--chat-history-benchmark=";

export type ChatBenchmarkFixture = ChatSummary & {
  provider: ChatProvider;
  sha256: string;
  sourceBytes: number;
};

export type ChatBenchmarkConfig = {
  eventFileName: string;
  fixtures: [ChatBenchmarkFixture, ChatBenchmarkFixture];
  loadImages: boolean;
  switchDelayMs: number;
  version: 1;
};

export type ChatBenchmarkContentReadyEvent = {
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

export type ChatBenchmarkEvent =
  | ChatBenchmarkContentDigestEvent
  | ChatBenchmarkContentReadyEvent
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
    const config = JSON.parse(decodeURIComponent(encoded)) as ChatBenchmarkConfig;
    return config.version === 1 && config.fixtures.length === 2 && config.eventFileName.length > 0
      ? config
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
    const startupTiming = pending.event.name === "contentReady"
      ? getReactNativeStartupTiming()
      : undefined;
    events.push({
      ...pending.event,
      reactNativeClockOffsetMs: startupTiming?.clockOffsetMs,
      reactNativeStartupTiming: startupTiming,
      timestampMs: pending.timestampMs,
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
