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
import { getSystemLegendDisplayTheme, useSystemLegendDisplayTheme } from "@legend-apps/theme";
import { setWindowOptions } from "@legend-apps/window-manager";
import {
  createUnifiedToolbarWindowStyle,
  createWindowsNavigator,
  type WindowsConfig,
  usePrimaryWindowLifecycle,
  useWindowId,
} from "@legend-apps/windows";
import {
  LegendList,
  type LegendListDataSourceRenderItemProps,
  type LegendListRef,
  type LegendListRenderItemProps,
} from "@legendapp/list/react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { Uniwind } from "uniwind";
import { ChatComposer } from "./ChatComposer";
import { readSelectedChatId, writeSelectedChatId } from "./chatStorage";
import { DemoTranscriptRow } from "./DemoTranscriptRow";
import {
  isDemoTranscriptMessage,
  TranscriptDataSource,
  type TranscriptListItem,
} from "./TranscriptDataSource";
import { TranscriptRow } from "./TranscriptRow";

Uniwind.setTheme("system");

const CHAT_HISTORY_WINDOW_IDENTIFIER = "chat-history";
const CHAT_HISTORY_WINDOW_MODULE_NAME = "ChatHistoryWindow";
const CHAT_HISTORY_TITLEBAR_HEIGHT = sidebarSplitViewTitlebarMetrics.contentInsetTop;
const CHAT_HISTORY_SIDEBAR_TOP_INSET = sidebarSplitViewTitlebarMetrics.sidebarInsetTop;
const CHAT_COMPOSER_INITIAL_HEIGHT = 90;
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
type TranscriptState =
  | { status: "idle" }
  | { selectedId: string; status: "loading" }
  | { document: ChatDocument; selectedId: string; status: "ready" }
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

function TranscriptList({ document }: { document: ChatDocument }) {
  const listRef = useRef<LegendListRef>(null);
  const demoMessageSequenceRef = useRef(0);
  const streamingDocumentIdRef = useRef<string | undefined>(undefined);
  const [activeTimers] = useState(() => new Set<ReturnType<typeof setTimeout>>());
  const [anchor, setAnchor] = useState<{ documentId: string; index: number } | undefined>(undefined);
  const [composerHeight, setComposerHeight] = useState(CHAT_COMPOSER_INITIAL_HEIGHT);
  const [streamingDocumentId, setStreamingDocumentId] = useState<string | undefined>(undefined);
  const dataSource = useMemo(() => new TranscriptDataSource(document), [document]);
  const anchorIndex = anchor?.documentId === document.documentId ? anchor.index : undefined;
  const isStreaming = streamingDocumentId === document.documentId;
  const renderItem = useCallback(
    ({ item }: LegendListDataSourceRenderItemProps<TranscriptListItem>) => {
      let row = null;
      if (item !== undefined) {
        row = isDemoTranscriptMessage(item)
          ? <DemoTranscriptRow message={item} />
          : <TranscriptRow document={document} index={item} />;
      }
      return row;
    },
    [document],
  );
  const getItemType = useCallback(
    (item: TranscriptListItem) => isDemoTranscriptMessage(item)
      ? `demo-${item.role}`
      : document.getRowMetadata(item).kind,
    [document],
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
    const id = `${document.documentId}:demo-assistant:${++demoMessageSequenceRef.current}`;
    const words = DEMO_STREAM_RESPONSE.split(" ");
    let wordCount = 1;
    dataSource.appendDemoMessage({
      id,
      role: "assistant",
      streaming: true,
      text: words[0],
    });

    const streamNextWord = () => {
      wordCount += 1;
      const streamContinues = wordCount < words.length;
      dataSource.updateDemoMessage(id, words.slice(0, wordCount).join(" "));
      if (streamContinues) {
        schedule(streamNextWord, DEMO_STREAM_WORD_DELAY_MS);
      } else {
        dataSource.finishDemoMessage(id);
        streamingDocumentIdRef.current = undefined;
        setStreamingDocumentId(undefined);
      }
    };
    schedule(streamNextWord, DEMO_STREAM_WORD_DELAY_MS);
  }, [dataSource, document.documentId, schedule]);
  const handleSendDemoMessage = useCallback((text: string) => {
    if (streamingDocumentIdRef.current === undefined) {
      streamingDocumentIdRef.current = document.documentId;
      const userIndex = dataSource.appendDemoMessage({
        id: `${document.documentId}:demo-user:${++demoMessageSequenceRef.current}`,
        role: "user",
        text,
      });
      setAnchor({ documentId: document.documentId, index: userIndex });
      setStreamingDocumentId(document.documentId);
      requestAnimationFrame(() => {
        void listRef.current?.scrollToEnd({ animated: true });
      });
      schedule(streamDemoResponse, DEMO_STREAM_START_DELAY_MS);
    }
  }, [dataSource, document.documentId, schedule, streamDemoResponse]);
  useEffect(() => () => {
    activeTimers.forEach(clearTimeout);
    activeTimers.clear();
    streamingDocumentIdRef.current = undefined;
    document.releaseNativeResources();
  }, [activeTimers, document]);

  return (
    <View className="flex-1 bg-background">
      <LegendList
        anchoredEndSpace={anchoredEndSpace}
        contentContainerStyle={listContentStyle}
        contentInset={chatHistoryListContentInset}
        dataKey={document.documentId}
        dataSource={dataSource}
        estimatedItemSize={500}
        estimatedListSize={CHAT_HISTORY_INITIAL_LIST_SIZE}
        getItemType={getItemType}
        initialScrollAtEnd
        recycleItems
        ref={listRef}
        renderItem={renderItem}
        style={styles.list}
        viewabilityConfig={chatHistoryListViewabilityConfig}
      />
      <View pointerEvents="box-none" style={styles.composerOverlay}>
        <ChatComposer
          disabled={isStreaming}
          onHeightChange={setComposerHeight}
          onSend={handleSendDemoMessage}
        />
      </View>
    </View>
  );
}

function TranscriptPane({ selectedId, state }: { selectedId?: string; state: TranscriptState }) {
  const isCurrentSelection = "selectedId" in state && state.selectedId === selectedId;
  if (isCurrentSelection && state.status === "error") {
    return (
      <View className="flex-1 items-center justify-center bg-background px-10">
        <Text className="text-sm text-danger">{state.error}</Text>
      </View>
    );
  }
  if (isCurrentSelection && state.status === "ready") {
    return <TranscriptList document={state.document} />;
  }
  if (selectedId !== undefined) {
    return <View className="flex-1 bg-background" />;
  }
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <Text className="text-sm text-muted">No transcript selected.</Text>
    </View>
  );
}

export function ChatHistoryWindow() {
  const windowIdentifier = useWindowId();
  const displayTheme = useSystemLegendDisplayTheme();
  const [summaries, setSummaries] = useState<ChatSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [catalogError, setCatalogError] = useState<string | undefined>();
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [transcriptState, setTranscriptState] = useState<TranscriptState>({ status: "idle" });
  const loadGenerationRef = useRef(0);
  const selectedTitle = summaries.find((summary) => summary.id === selectedId)?.title;

  useEffect(() => {
    setWindowOptions(windowIdentifier, {
      title: selectedTitle ?? "Legend Chat History",
      windowStyle: {
        appearance: "system",
        backgroundColor: displayTheme.colors.windowBackground,
        titlebarSeparatorStyle: "shadow",
      },
    }).catch(reportChatHistoryWindowError);
  }, [displayTheme.colors.windowBackground, selectedTitle, windowIdentifier]);

  useEffect(() => {
    let active = true;
    void getRecentChats(20)
      .then((recentChats) => {
        if (active) {
          const sortedChats = [...recentChats].sort(sortChatsNewestFirst);
          const restoredId = readSelectedChatId();
          const initialId = sortedChats.some((summary) => summary.id === restoredId)
            ? restoredId
            : sortedChats[0]?.id;
          setSummaries(sortedChats);
          setSelectedId(initialId);
          setCatalogLoading(false);
        }
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
  }, []);

  useEffect(() => {
    const selected = summaries.find((summary) => summary.id === selectedId);
    if (selected) {
      const generation = loadGenerationRef.current + 1;
      loadGenerationRef.current = generation;
      cancelPendingOpen();
      writeSelectedChatId(selected.id);
      setTranscriptState({ selectedId: selected.id, status: "loading" });
      void openChat(selected.provider as ChatProvider, selected.path)
        .then((document) => {
          if (loadGenerationRef.current === generation) {
            setTranscriptState({ document, selectedId: selected.id, status: "ready" });
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
  }, [selectedId, summaries]);

  const handleSelect = useCallback((id: string) => {
    setSelectedId(id);
  }, []);

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
      style={styles.root}
    >
      <ChatSidebar summaries={summaries} selectedId={selectedId} onSelect={handleSelect} />
      {summaries.length > 0 ? (
        <TranscriptPane selectedId={selectedId} state={transcriptState} />
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

const chatHistoryWindowsConfig = {
  [CHAT_HISTORY_WINDOW_MODULE_NAME]: {
    component: ChatHistoryWindow,
    identifier: CHAT_HISTORY_WINDOW_IDENTIFIER,
    options: {
      title: "Legend Chat History",
      transparentBackground: true,
      windowStyle: {
        ...createUnifiedToolbarWindowStyle({
          appearance: "system",
          frame: {
            width: 1280,
            height: 720,
            minWidth: 640,
            minHeight: 460,
          },
          includeFrame: true,
          miniaturizable: true,
        }),
        contentLayoutMode: "fullSize",
        titlebarSeparatorStyle: "shadow",
        titleVisibility: "visible",
        titlebarControls: [],
      },
    },
  },
} satisfies WindowsConfig;

const ChatHistoryWindowsNavigator = createWindowsNavigator(chatHistoryWindowsConfig);

function openChatHistoryWindow() {
  return ChatHistoryWindowsNavigator.open(CHAT_HISTORY_WINDOW_MODULE_NAME, {
    windowStyle: {
      backgroundColor: getSystemLegendDisplayTheme().colors.windowBackground,
    },
  });
}

function reportChatHistoryWindowError(error: unknown) {
  console.error(`[ChatHistoryWindow] ${errorMessage(error)}`);
}

export function App() {
  usePrimaryWindowLifecycle({
    onInitialOpen: openChatHistoryWindow,
    onReopenRequested: openChatHistoryWindow,
    reportError: reportChatHistoryWindowError,
  });

  return null;
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
