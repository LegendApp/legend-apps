import {
  createSidebarSplitViewTitlebarChrome,
  SidebarSplitView,
  sidebarSplitViewTitlebarMetrics,
} from "@legend-apps/appkit-split-view";
import {
  cancelPendingOpen,
  getRecentChats,
  openChat,
  type ChatDocument,
  type ChatProvider,
  type ChatSummary,
} from "@legend-apps/chat-history";
import { useSystemLegendDisplayTheme } from "@legend-apps/theme";
import { addApplicationReopenRequestedListener, setMainWindowOptions } from "@legend-apps/window-manager";
import {
  LegendList,
  type LegendListDataSource,
  type LegendListDataSourceRenderItemProps,
  type LegendListRef,
  type LegendListRenderItemProps,
} from "@legendapp/list/react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Uniwind } from "uniwind";
import { ChatComposer } from "./ChatComposer";
import {
  emitChatBenchmarkEvent,
  getChatBenchmarkConfig,
  type ChatBenchmarkEvent,
} from "./chatBenchmark";
import { flushSelectedChatWrite, readSavedChatSelection, writeSelectedChat } from "./chatStorage";
import { DemoTranscriptRow } from "./DemoTranscriptRow";
import {
  isDemoTranscriptMessage,
  TranscriptDataSource,
  type TranscriptListItem,
} from "./TranscriptDataSource";
import { TranscriptRow } from "./TranscriptRow";

Uniwind.setTheme("system");

const CHAT_HISTORY_TITLEBAR_HEIGHT = sidebarSplitViewTitlebarMetrics.contentInsetTop;
const CHAT_HISTORY_SIDEBAR_TOP_INSET = sidebarSplitViewTitlebarMetrics.sidebarInsetTop;
// The single-line composer is 88 pt: 28 pt outer padding plus a 60 pt glass field.
const CHAT_COMPOSER_INITIAL_HEIGHT = 88;
const CHAT_COMPOSER_CONTENT_GAP = 24;
const CHAT_HISTORY_INITIAL_LIST_SIZE = {
  height: 720,
  width: 1020,
};
const CHAT_PROVIDER_SECTIONS = [
  { provider: "codex", title: "Codex" },
  { provider: "claude", title: "Claude" },
] as const satisfies readonly { provider: ChatProvider; title: string }[];
const CHAT_SIDEBAR_CHAT_ROW_HEIGHT = 34;
const CHAT_SIDEBAR_SECTION_ROW_HEIGHT = 40;
const CHAT_SIDEBAR_SECTION_SPACER_HEIGHT = 12;
const DEMO_STREAM_START_DELAY_MS = 400;
const DEMO_STREAM_WORD_DELAY_MS = 30;
const DEMO_STREAM_RESPONSE = [
  "This is a deliberately long fake streamed response. Nothing was sent to a model, no network request was made, and none of this text will be saved to the transcript. The purpose of this response is to make the test turn substantially taller than the visible conversation area so that the anchored-end behavior can be evaluated while content grows, after it finishes growing, and while you manually scroll through the completed result.",
  "At the beginning of the stream, the new user message should remain positioned just below the titlebar. The assistant response should then expand underneath it one word at a time without pushing that user message away from its anchored position. As the response becomes taller, LegendList should reduce the synthetic space at the end by the same amount. The important invariant is that synthetic space and real message content replace each other rather than accumulating together and making the transcript artificially taller.",
  "Once this paragraph appears, the response should already occupy a meaningful portion of the window. You can drag the scrollbar toward the bottom before the stream finishes and compare the reachable end with the end after all words have arrived. A correct implementation should always expose the complete response, but it should not leave an additional viewport-sized empty region after the final line. If that empty region remains, the problem is likely in how the native scroll extent reacts when anchoredEndSpace shrinks rather than in the size of the assistant message itself.",
  "This test also exercises recycled, variable-height rows. The user message is short and right aligned, while this assistant message has no bubble and is intentionally much taller. Its measured height changes repeatedly during streaming. Those updates should flow into the list layout, the calculated content below the anchor, and the trailing content-container padding. The physical scroll range should therefore track the latest measurement instead of retaining the largest padding value that existed near the start of the stream.",
  "There is enough text here to continue beyond a typical macOS chat viewport even when the window is fairly wide. That matters because a short response can hide a stale-tail bug: the generated anchor space dominates the content and makes every offset look plausible. With a long response, the real row height eventually consumes all available anchor space. At that point the trailing padding should reach zero, leaving only the normal bottom spacing owned by the transcript and composer layout.",
  "You should now be able to scroll through several full paragraphs of fake content. Try moving to the absolute bottom, then slightly upward, then back to the bottom again. The last line should be reachable and should stop at the expected bottom edge. There should be no second blank screen after it, no rubber-band range that behaves like permanent content, and no sudden jump when the final streamed word causes the anchor calculation to update.",
  "The response continues for another paragraph to make the test unambiguous on large displays. While reading it, notice that the content itself is ordinary selectable text and that the composer remains visible below the list. The demo is still intentionally inert: sending only mutates the temporary in-memory data source used by this screen. Switching chats or reopening the application discards the generated turn, and no provider session, local transcript, or remote model is affected.",
  "This is the final portion of the fake response. By now the assistant row should be at least one screen tall, and on most window sizes it should be considerably taller. The final sentence marks the true end of the generated content so it is easy to identify whether LegendList stops at the correct location: this line should be the end, with only the normal small amount of bottom spacing after it.",
].join("\n\n");
const chatHistoryListContentInset = {
  bottom: 0,
  left: 0,
  right: 0,
  top: CHAT_HISTORY_TITLEBAR_HEIGHT,
};
const chatHistoryListViewabilityConfig = {
  startOffset: CHAT_HISTORY_TITLEBAR_HEIGHT,
};
const chatSidebarContentInset = {
  bottom: 0,
  left: 0,
  right: 0,
  top: CHAT_HISTORY_SIDEBAR_TOP_INSET,
};
const emptyTranscriptDataSource: LegendListDataSource<TranscriptListItem> = {
  getItem: () => undefined,
  getKey: (index) => `empty:${index}`,
  getLength: () => 0,
  getRevision: () => 0,
  subscribe: () => () => {},
};
type TranscriptState =
  | { status: "idle" }
  | { selectedId: string; status: "loading" }
  | {
    document: ChatDocument;
    openedAt: number;
    path: string;
    phase?: "initial" | "switch";
    selectedId: string;
    status: "ready";
  }
  | { error: string; selectedId: string; status: "error" };

type ChatSidebarEntry =
  | { id: string; summary: ChatSummary; type: "chat" }
  | { id: string; title: string; type: "section" }
  | { id: string; type: "spacer" };

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

function relativeDate(timestamp: number) {
  const elapsed = Math.max(0, Date.now() - timestamp);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) {
    return "now";
  }
  if (minutes < 60) {
    return `${minutes}m`;
  }
  const hours = Math.floor(minutes / 60);
  if (hours < 24) {
    return `${hours}h`;
  }
  const days = Math.floor(hours / 24);
  return days < 7 ? `${days}d` : new Date(timestamp).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function sortChatsNewestFirst(first: ChatSummary, second: ChatSummary) {
  return second.updatedAt - first.updatedAt;
}

function getChatSidebarItemKey(entry: ChatSidebarEntry) {
  return entry.id;
}

function getChatSidebarItemType(entry: ChatSidebarEntry) {
  return entry.type;
}

function getChatSidebarItemSize(entry: ChatSidebarEntry) {
  let size = CHAT_SIDEBAR_CHAT_ROW_HEIGHT;
  if (entry.type === "section") {
    size = CHAT_SIDEBAR_SECTION_ROW_HEIGHT;
  } else if (entry.type === "spacer") {
    size = CHAT_SIDEBAR_SECTION_SPACER_HEIGHT;
  }
  return size;
}

function ChatSidebarRow({
  entry,
  onSelect,
  selectedId,
}: {
  entry: ChatSidebarEntry;
  onSelect: (id: string) => void;
  selectedId?: string;
}) {
  const handlePress = useCallback(() => {
    if (entry.type === "chat") {
      onSelect(entry.summary.id);
    }
  }, [entry, onSelect]);

  let row;
  if (entry.type === "section") {
    row = (
      <View className="justify-center px-4" style={styles.sidebarSection}>
        <Text className="text-[13px] font-bold text-muted">{entry.title}</Text>
      </View>
    );
  } else if (entry.type === "spacer") {
    row = <View style={styles.sidebarSectionSpacer} />;
  } else {
    const selected = entry.summary.id === selectedId;
    row = (
      <View className="px-2" style={styles.sidebarItem}>
        <Pressable
          accessibilityLabel={entry.summary.title}
          accessibilityRole="button"
          accessibilityState={{ selected }}
          className={selected
            ? "flex-1 flex-row items-center gap-1 rounded-lg bg-primary px-2"
            : "flex-1 flex-row items-center gap-1 rounded-lg px-2"}
          onPress={handlePress}
          style={({ pressed }) => ({ opacity: pressed ? 0.72 : 1 })}
        >
          <Text
            className={selected
              ? "min-w-0 flex-1 text-[13px] font-semibold text-white"
              : "min-w-0 flex-1 text-[13px] font-semibold text-foreground"}
            numberOfLines={1}
          >
            {entry.summary.title}
          </Text>
          <Text className={selected ? "shrink-0 text-[11px] text-white/70" : "shrink-0 text-[11px] text-muted"}>
            {relativeDate(entry.summary.updatedAt)}
          </Text>
        </Pressable>
      </View>
    );
  }

  return row;
}

function ChatSidebar({
  summaries,
  selectedId,
  onSelect,
}: {
  summaries: readonly ChatSummary[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  const entries = useMemo(() => {
    const nextEntries: ChatSidebarEntry[] = [];
    for (const section of CHAT_PROVIDER_SECTIONS) {
      if (section.provider === "claude") {
        nextEntries.push({ id: "provider-section-spacer:claude", type: "spacer" });
      }
      nextEntries.push({
        id: `provider-section:${section.provider}`,
        title: section.title,
        type: "section",
      });
      for (const summary of summaries) {
        if (summary.provider === section.provider) {
          nextEntries.push({ id: summary.id, summary, type: "chat" });
        }
      }
    }
    return nextEntries;
  }, [summaries]);
  const renderItem = useCallback(({ item }: LegendListRenderItemProps<ChatSidebarEntry>) => (
    <ChatSidebarRow entry={item} onSelect={onSelect} selectedId={selectedId} />
  ), [onSelect, selectedId]);

  return (
    <View className="flex-1 bg-surface-muted">
      <LegendList
        contentContainerStyle={styles.sidebarContent}
        contentInset={chatSidebarContentInset}
        data={entries}
        estimatedItemSize={CHAT_SIDEBAR_CHAT_ROW_HEIGHT}
        extraData={selectedId}
        getFixedItemSize={getChatSidebarItemSize}
        getItemType={getChatSidebarItemType}
        keyExtractor={getChatSidebarItemKey}
        recycleItems
        renderItem={renderItem}
        style={styles.sidebar}
      />
    </View>
  );
}

function TranscriptList({
  dataKey,
  document,
  loadImages,
  onBenchmarkEvent,
  openedAt,
  path,
  phase,
}: {
  dataKey: string;
  document?: ChatDocument;
  loadImages: boolean;
  onBenchmarkEvent?: (event: ChatBenchmarkEvent) => void;
  openedAt?: number;
  path?: string;
  phase?: "initial" | "switch";
}) {
  const listRef = useRef<LegendListRef>(null);
  const reportedDocumentIdRef = useRef<string | undefined>(undefined);
  const demoMessageSequenceRef = useRef(0);
  const streamingDocumentIdRef = useRef<string | undefined>(undefined);
  const [activeTimers] = useState(() => new Set<ReturnType<typeof setTimeout>>());
  const [anchor, setAnchor] = useState<{ documentId: string; index: number } | undefined>(undefined);
  const [composerHeight, setComposerHeight] = useState(CHAT_COMPOSER_INITIAL_HEIGHT);
  const [streamingDocumentId, setStreamingDocumentId] = useState<string | undefined>(undefined);
  const documentId = document?.documentId;
  const transcriptDataSource = useMemo(
    () => document ? new TranscriptDataSource(document) : undefined,
    [document],
  );
  const dataSource = transcriptDataSource ?? emptyTranscriptDataSource;
  const anchorIndex = anchor && anchor.documentId === documentId ? anchor.index : undefined;
  const isStreaming = documentId !== undefined && streamingDocumentId === documentId;
  const lastDocumentRowIndex = (document?.rowCount ?? 0) - 1;
  const handleInitialTailLayout = useCallback(() => {
    if (!document || openedAt === undefined || path === undefined || reportedDocumentIdRef.current === document.documentId) {
      return;
    }
    reportedDocumentIdRef.current = document.documentId;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (phase) {
          const timing = document.getTiming();
          onBenchmarkEvent?.({
            durationMs: performance.now() - openedAt,
            name: "contentReady",
            path,
            phase,
            recordCount: timing.recordCount,
            rowCount: timing.rowCount,
            sourceBytes: timing.sourceBytes,
            timing: {
              documentMs: timing.documentMs,
              loadMs: timing.mappedMs,
              nativeTotalMs: timing.totalMs,
              parseMs: timing.normalizedMs,
              scanMs: timing.scannedMs,
            },
          });
          // Parser parity must not delay the visual readiness boundary being measured.
          setTimeout(() => {
            onBenchmarkEvent?.({
              contentDigest: document.contentDigest,
              name: "contentDigest",
              path,
              phase,
            });
          }, 0);
        }
      });
    });
  }, [document, onBenchmarkEvent, openedAt, path, phase]);
  const renderItem = useCallback(
    ({ item }: LegendListDataSourceRenderItemProps<TranscriptListItem>) => {
      let row = null;
      if (item !== undefined && document) {
        row = isDemoTranscriptMessage(item)
          ? <DemoTranscriptRow message={item} />
          : (
            <TranscriptRow
              document={document}
              index={item}
              loadImages={loadImages}
              metadata={transcriptDataSource!.getRowMetadata(item)}
              onLayout={item === lastDocumentRowIndex && phase ? handleInitialTailLayout : undefined}
            />
          );
      }
      return row;
    },
    [document, handleInitialTailLayout, lastDocumentRowIndex, loadImages, phase, transcriptDataSource],
  );
  const getItemType = useCallback(
    (item: TranscriptListItem) => isDemoTranscriptMessage(item)
      ? `demo-${item.role}`
      : transcriptDataSource?.getRowMetadata(item).kind ?? "",
    [transcriptDataSource],
  );
  const schedule = useCallback((callback: () => void, delay: number) => {
    const timer = setTimeout(() => {
      activeTimers.delete(timer);
      callback();
    }, delay);
    activeTimers.add(timer);
  }, [activeTimers]);
  const anchoredEndSpace = useMemo(() => anchorIndex === undefined
    ? undefined
    : {
      anchorIndex,
      anchorOffset: CHAT_HISTORY_TITLEBAR_HEIGHT,
    }, [anchorIndex]);
  const listContentStyle = useMemo(() => [
    styles.listContent,
    { paddingBottom: composerHeight + CHAT_COMPOSER_CONTENT_GAP },
  ], [composerHeight]);
  const streamDemoResponse = useCallback(() => {
    if (!documentId || !transcriptDataSource) {
      return;
    }
    const id = `${documentId}:demo-assistant:${++demoMessageSequenceRef.current}`;
    const words = DEMO_STREAM_RESPONSE.split(" ");
    let wordCount = 1;
    transcriptDataSource.appendDemoMessage({
      id,
      role: "assistant",
      streaming: true,
      text: words[0],
    });

    const streamNextWord = () => {
      wordCount += 1;
      const streamContinues = wordCount < words.length;
      transcriptDataSource.updateDemoMessage(id, words.slice(0, wordCount).join(" "));
      if (streamContinues) {
        schedule(streamNextWord, DEMO_STREAM_WORD_DELAY_MS);
      } else {
        transcriptDataSource.finishDemoMessage(id);
        streamingDocumentIdRef.current = undefined;
        setStreamingDocumentId(undefined);
      }
    };
    schedule(streamNextWord, DEMO_STREAM_WORD_DELAY_MS);
  }, [documentId, schedule, transcriptDataSource]);
  const handleSendDemoMessage = useCallback((text: string) => {
    if (documentId && transcriptDataSource && streamingDocumentIdRef.current === undefined) {
      streamingDocumentIdRef.current = documentId;
      const userIndex = transcriptDataSource.appendDemoMessage({
        id: `${documentId}:demo-user:${++demoMessageSequenceRef.current}`,
        role: "user",
        text,
      });
      setAnchor({ documentId, index: userIndex });
      setStreamingDocumentId(documentId);
      requestAnimationFrame(() => {
        void listRef.current?.scrollToEnd({ animated: true });
      });
      schedule(streamDemoResponse, DEMO_STREAM_START_DELAY_MS);
    }
  }, [documentId, schedule, streamDemoResponse, transcriptDataSource]);
  useEffect(() => () => {
    activeTimers.forEach(clearTimeout);
    activeTimers.clear();
    streamingDocumentIdRef.current = undefined;
    document?.releaseNativeResources();
  }, [activeTimers, document]);
  return (
    <View className="flex-1 bg-background">
      <LegendList
        anchoredEndSpace={anchoredEndSpace}
        contentContainerStyle={listContentStyle}
        contentInset={chatHistoryListContentInset}
        dataKey={dataKey}
        dataSource={dataSource}
        estimatedItemSize={500}
        estimatedListSize={CHAT_HISTORY_INITIAL_LIST_SIZE}
        getItemType={getItemType}
        initialScrollAtEnd
        onLoad={document?.rowCount === 0 && phase ? handleInitialTailLayout : undefined}
        recycleItems
        ref={listRef}
        renderItem={renderItem}
        style={styles.list}
        viewabilityConfig={chatHistoryListViewabilityConfig}
      />
      <View pointerEvents="box-none" style={styles.composerOverlay}>
        <ChatComposer
          disabled={!document || isStreaming}
          onHeightChange={setComposerHeight}
          onSend={handleSendDemoMessage}
          transcriptId={dataKey}
        />
      </View>
    </View>
  );
}

function TranscriptPane({
  loadImages,
  onBenchmarkEvent,
  selectedId,
  state,
}: {
  loadImages: boolean;
  onBenchmarkEvent?: (event: ChatBenchmarkEvent) => void;
  selectedId?: string;
  state: TranscriptState;
}) {
  const isCurrentSelection = "selectedId" in state && state.selectedId === selectedId;
  const document = isCurrentSelection && state.status === "ready" ? state.document : undefined;
  const message = isCurrentSelection && state.status === "error"
    ? state.error
    : selectedId === undefined
      ? "No transcript selected."
      : undefined;
  return (
    <View className="flex-1 bg-background">
      <TranscriptList
        dataKey={selectedId ?? "none"}
        document={document}
        loadImages={loadImages}
        onBenchmarkEvent={onBenchmarkEvent}
        openedAt={isCurrentSelection && state.status === "ready" ? state.openedAt : undefined}
        path={isCurrentSelection && state.status === "ready" ? state.path : undefined}
        phase={isCurrentSelection && state.status === "ready" ? state.phase : undefined}
      />
      {message ? (
        <View className="absolute inset-0 items-center justify-center bg-background px-10">
          <Text className={isCurrentSelection && state.status === "error" ? "text-sm text-danger" : "text-sm text-muted"}>
            {message}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

type ChatHistoryWindowProps = {
  launchArguments?: string[];
};

export function ChatHistoryWindow({ launchArguments }: ChatHistoryWindowProps) {
  const displayTheme = useSystemLegendDisplayTheme();
  const benchmark = useMemo(() => getChatBenchmarkConfig(launchArguments), [launchArguments]);
  const [savedSelection] = useState(() => benchmark ? {} : readSavedChatSelection());
  const [summaries, setSummaries] = useState<ChatSummary[]>(() => savedSelection.selectedChat
    ? [savedSelection.selectedChat]
    : []);
  const [selectedId, setSelectedId] = useState<string | undefined>(savedSelection.selectedId);
  const [catalogError, setCatalogError] = useState<string | undefined>();
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [transcriptState, setTranscriptState] = useState<TranscriptState>({ status: "idle" });
  const benchmarkDiscoveryMsRef = useRef<number | undefined>(undefined);
  const loadGenerationRef = useRef(0);
  const switchTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const windowShownRef = useRef(false);
  const selectedSummary = summaries.find((summary) => summary.id === selectedId);
  const selectedTitle = selectedSummary?.title;

  useEffect(() => {
    setMainWindowOptions({
      title: selectedTitle ?? "Legend Chat History",
      windowStyle: {
        appearance: "system",
        backgroundColor: displayTheme.colors.windowBackground,
        titlebarSeparatorStyle: "shadow",
      },
    }).catch(reportChatHistoryWindowError);
  }, [displayTheme.colors.windowBackground, selectedTitle]);

  useEffect(() => {
    let active = true;
    if (benchmark) {
      const discoveryStartedAt = performance.now();
      void getRecentChats(1_000_000)
        .then((discoveredChats) => {
          if (!active) {
            return;
          }
          const targets = benchmark.targets.map((target) => discoveredChats.find(
            (summary) => summary.id === target.id && summary.provider === target.provider,
          ));
          if (targets.some((target) => !target)) {
            throw new Error("A pinned benchmark chat was not found during native history discovery");
          }
          const resolvedTargets = targets as [ChatSummary, ChatSummary];
          benchmarkDiscoveryMsRef.current = performance.now() - discoveryStartedAt;
          const visibleChats = discoveredChats.slice(0, 20);
          for (const target of resolvedTargets) {
            if (!visibleChats.some((summary) => summary.id === target.id)) {
              visibleChats.push(target);
            }
          }
          setSummaries(visibleChats);
          setSelectedId(resolvedTargets[0].id);
          setCatalogError(undefined);
          setCatalogLoading(false);
        })
        .catch((error) => {
          if (active) {
            setCatalogError(errorMessage(error));
            setCatalogLoading(false);
          }
        });
      return () => {
        active = false;
        cancelPendingOpen();
      };
    }
    let catalogGeneration = 0;
    const refreshCatalog = () => {
      catalogGeneration = catalogGeneration + 1;
      const generation = catalogGeneration;
      void getRecentChats(20)
      .then((recentChats) => {
        if (active && generation === catalogGeneration) {
          const sortedChats = [...recentChats].sort(sortChatsNewestFirst);
          // Preserve unchanged models so reopening does not reload the selected transcript.
          setSummaries((previous) => sortedChats.map((summary) => {
            const existing = previous.find((candidate) => candidate.id === summary.id);
            return existing && existing.path === summary.path && existing.provider === summary.provider
              && existing.title === summary.title && existing.updatedAt === summary.updatedAt
              ? existing : summary;
          }));
          setSelectedId((currentId) => {
            const preferredId = currentId ?? savedSelection.selectedId;
            return sortedChats.some((summary) => summary.id === preferredId)
              ? preferredId : sortedChats[0]?.id;
          });
          setCatalogError(undefined);
          setCatalogLoading(false);
        }
      })
      .catch((error) => {
        if (active && generation === catalogGeneration) {
          setCatalogError(errorMessage(error));
          setCatalogLoading(false);
        }
      });
    };
    refreshCatalog();
    const reopenSubscription = addApplicationReopenRequestedListener(({ hasVisibleWindows }) => {
      if (!hasVisibleWindows) {
        refreshCatalog();
      }
    });
    return () => {
      active = false;
      reopenSubscription.remove();
      cancelPendingOpen();
      flushSelectedChatWrite();
    };
  }, [benchmark]);

  useEffect(() => {
    const selected = selectedSummary;
    if (selected) {
      const generation = loadGenerationRef.current + 1;
      const openedAt = benchmark ? performance.now() : 0;
      const phase = benchmark
        ? selected.id === benchmark.targets[0].id
          ? "initial"
          : selected.id === benchmark.targets[1].id
            ? "switch"
            : undefined
        : undefined;
      loadGenerationRef.current = generation;
      cancelPendingOpen();
      if (!benchmark) {
        writeSelectedChat(selected);
      }
      setTranscriptState({ selectedId: selected.id, status: "loading" });
      void openChat(selected.provider as ChatProvider, selected.path)
        .then((document) => {
          if (loadGenerationRef.current === generation) {
            setTranscriptState({
              document,
              openedAt,
              path: selected.path,
              phase,
              selectedId: selected.id,
              status: "ready",
            });
          } else {
            document.releaseNativeResources();
          }
        })
        .catch((error) => {
          if (loadGenerationRef.current === generation) {
            setTranscriptState({ error: errorMessage(error), selectedId: selected.id, status: "error" });
          }
        });
    }
  }, [benchmark, selectedSummary]);

  useEffect(() => () => {
    if (switchTimerRef.current !== undefined) {
      clearTimeout(switchTimerRef.current);
    }
  }, []);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
  }, []);
  const handleBenchmarkEvent = useCallback((event: ChatBenchmarkEvent) => {
    if (!benchmark) {
      return;
    }
    emitChatBenchmarkEvent(
      benchmark,
      event.name === "contentReady" && event.phase === "initial"
        ? { ...event, discoveryMs: benchmarkDiscoveryMsRef.current }
        : event,
    );
    if (
      event.name === "contentReady"
      && event.phase === "initial"
      && switchTimerRef.current === undefined
    ) {
      switchTimerRef.current = setTimeout(() => {
        switchTimerRef.current = undefined;
        setSelectedId(benchmark.targets[1].id);
      }, benchmark.switchDelayMs);
    }
  }, [benchmark]);
  const handleWindowLayout = useCallback(() => {
    if (benchmark && !windowShownRef.current) {
      windowShownRef.current = true;
      emitChatBenchmarkEvent(benchmark, { name: "windowShown" });
    }
  }, [benchmark]);

  const emptyMessage = catalogLoading
    ? "Scanning recent chats…"
    : catalogError
      ? catalogError
      : "No local Codex or Claude transcripts found.";
  const titlebarChromeProps = createSidebarSplitViewTitlebarChrome({
    colorScheme: displayTheme.appearance ?? "light",
    contentBackgroundColor: displayTheme.colors.background,
    sidebarBackgroundColor: displayTheme.colors.surfaceMuted,
  });

  return (
    <SidebarSplitView
      {...titlebarChromeProps}
      appearance="system"
      contentMinWidth={420}
      sidebarMinWidth={220}
      sidebarWidth={260}
      onLayout={benchmark ? handleWindowLayout : undefined}
      style={styles.root}
    >
      <ChatSidebar summaries={summaries} selectedId={selectedId} onSelect={handleSelect} />
      {summaries.length > 0 ? (
        <TranscriptPane
          loadImages={benchmark?.loadImages ?? true}
          onBenchmarkEvent={benchmark ? handleBenchmarkEvent : undefined}
          selectedId={selectedId}
          state={transcriptState}
        />
      ) : (
        <View className="flex-1 items-center justify-center bg-background px-10">
          {catalogLoading ? <ActivityIndicator /> : null}
          <Text className={catalogError ? "mt-3 text-sm text-danger" : "mt-3 text-sm text-muted"}>
            {emptyMessage}
          </Text>
        </View>
      )}
    </SidebarSplitView>
  );
}

function reportChatHistoryWindowError(error: unknown) {
  console.error(`[ChatHistoryWindow] ${errorMessage(error)}`);
}

type ChatHistoryAppProps = {
  launchArguments?: string[];
};

export function App({ launchArguments }: ChatHistoryAppProps) {
  return <ChatHistoryWindow launchArguments={launchArguments} />;
}

export default App;

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  listContent: {
    paddingTop: 12,
  },
  composerOverlay: {
    bottom: 0,
    left: 0,
    position: "absolute",
    right: 0,
    zIndex: 1,
  },
  root: {
    flex: 1,
  },
  sidebar: {
    flex: 1,
  },
  sidebarContent: {
    paddingBottom: 8,
  },
  sidebarItem: {
    height: 34,
  },
  sidebarSection: {
    height: 40,
  },
  sidebarSectionSpacer: {
    height: 12,
  },
});
