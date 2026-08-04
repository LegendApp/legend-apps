import { SidebarSplitView } from "@legend-apps/appkit-split-view";
import {
  cancelPendingOpen,
  getRecentChats,
  openChat,
  type ChatDocument,
  type ChatProvider,
  type ChatSummary,
} from "@legend-apps/chat-history";
import { Sidebar, SidebarItem } from "@legend-apps/sidebar";
import { addApplicationReopenRequestedListener } from "@legend-apps/window-manager";
import {
  createUnifiedToolbarWindowStyle,
  createWindowsNavigator,
  type WindowsConfig,
} from "@legend-apps/windows";
import {
  LegendList,
  type LegendListDataSourceRenderItemProps,
  type LegendListRef,
} from "@legendapp/list/react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
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

Uniwind.setTheme("light");

const CHAT_HISTORY_WINDOW_IDENTIFIER = "chat-history";
const CHAT_HISTORY_WINDOW_MODULE_NAME = "ChatHistoryWindow";
const CHAT_HISTORY_TITLEBAR_HEIGHT = 52;
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
type TranscriptState = {
  document?: ChatDocument;
  error?: string;
};

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

function ChatSidebar({
  summaries,
  selectedId,
  onSelect,
}: {
  summaries: readonly ChatSummary[];
  selectedId?: string;
  onSelect: (id: string) => void;
}) {
  return (
    <View className="flex-1 bg-surface-muted pt-10">
      <Text className="px-3 pb-3 text-lg font-bold text-foreground">Chat History</Text>
      <Sidebar
        defaultRowHeight={54}
        onSidebarSelectionChange={(event) => {
          onSelect(event.nativeEvent.id);
        }}
        selectedId={selectedId}
        style={styles.sidebar}
      >
        {summaries.map((summary) => (
          <SidebarItem itemId={summary.id} key={summary.id} rowHeight={54} style={styles.sidebarItem}>
            <View className="min-w-0 flex-1 justify-center px-2">
              <Text className="text-[13px] font-semibold text-foreground" numberOfLines={1}>
                {summary.title}
              </Text>
              <View className="mt-0.5 flex-row items-center justify-between gap-2">
                <Text className="text-[11px] capitalize text-muted">{summary.provider}</Text>
                <Text className="text-[11px] text-muted">{relativeDate(summary.updatedAt)}</Text>
              </View>
            </View>
          </SidebarItem>
        ))}
      </Sidebar>
    </View>
  );
}

function TranscriptList({ document }: { document: ChatDocument }) {
  const listRef = useRef<LegendListRef>(null);
  const demoMessageSequenceRef = useRef(0);
  const pendingAnchorIndexRef = useRef<number | undefined>(undefined);
  const [activeTimers] = useState(() => new Set<ReturnType<typeof setTimeout>>());
  const [anchor, setAnchor] = useState<{ documentId: string; index: number } | undefined>(undefined);
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
  const handleAnchorReady = useCallback(({
    anchorIndex: readyAnchorIndex,
  }: {
    anchorIndex: number | undefined;
  }) => {
    if (readyAnchorIndex !== undefined && pendingAnchorIndexRef.current === readyAnchorIndex) {
      pendingAnchorIndexRef.current = undefined;
      void listRef.current?.scrollToEnd({ animated: true });
    }
  }, []);
  const anchoredEndSpace = useMemo(() => anchorIndex === undefined
    ? undefined
    : {
      anchorIndex,
      onReady: handleAnchorReady,
    }, [anchorIndex, handleAnchorReady]);
  const streamDemoResponse = useCallback(() => {
    const id = `${document.documentId}:demo-assistant:${++demoMessageSequenceRef.current}`;
    const words = DEMO_STREAM_RESPONSE.split(" ");
    let wordCount = 1;
    dataSource.appendDemoMessage({
      id,
      role: "assistant",
      text: words[0],
    });

    const streamNextWord = () => {
      wordCount += 1;
      dataSource.updateDemoMessage(id, words.slice(0, wordCount).join(" "));
      if (wordCount < words.length) {
        schedule(streamNextWord, DEMO_STREAM_WORD_DELAY_MS);
      } else {
        setStreamingDocumentId(undefined);
      }
    };
    schedule(streamNextWord, DEMO_STREAM_WORD_DELAY_MS);
  }, [dataSource, document.documentId, schedule]);
  const handleSendDemoMessage = useCallback((text: string) => {
    if (!isStreaming) {
      const userIndex = dataSource.appendDemoMessage({
        id: `${document.documentId}:demo-user:${++demoMessageSequenceRef.current}`,
        role: "user",
        text,
      });
      pendingAnchorIndexRef.current = userIndex;
      setAnchor({ documentId: document.documentId, index: userIndex });
      setStreamingDocumentId(document.documentId);
      schedule(streamDemoResponse, DEMO_STREAM_START_DELAY_MS);
    }
  }, [dataSource, document.documentId, isStreaming, schedule, streamDemoResponse]);

  useEffect(() => () => {
    activeTimers.forEach(clearTimeout);
    activeTimers.clear();
    pendingAnchorIndexRef.current = undefined;
    document.releaseNativeResources();
  }, [activeTimers, document]);

  return (
    <View className="flex-1 bg-background">
      <LegendList
        anchoredEndSpace={anchoredEndSpace}
        contentContainerStyle={styles.listContent}
        dataKey={document.documentId}
        dataSource={dataSource}
        estimatedItemSize={500}
        getItemType={getItemType}
        initialScrollAtEnd
        recycleItems
        ref={listRef}
        renderItem={renderItem}
        style={styles.list}
      />
      <ChatComposer disabled={isStreaming} onSend={handleSendDemoMessage} />
    </View>
  );
}

function TranscriptPane({ state }: { state: TranscriptState }) {
  if (state.error) {
    return (
      <View className="flex-1 items-center justify-center bg-background px-10">
        <Text className="text-sm text-danger">{state.error}</Text>
      </View>
    );
  }
  if (state.document) {
    return <TranscriptList document={state.document} />;
  }
  return (
    <View className="flex-1 items-center justify-center bg-background">
      <Text className="text-sm text-muted">No transcript selected.</Text>
    </View>
  );
}

export function ChatHistoryWindow() {
  const [summaries, setSummaries] = useState<ChatSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [catalogError, setCatalogError] = useState<string | undefined>();
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [transcriptState, setTranscriptState] = useState<TranscriptState>({});
  const loadGenerationRef = useRef(0);

  useEffect(() => {
    let active = true;
    void getRecentChats(20)
      .then((recentChats) => {
        if (active) {
          const restoredId = readSelectedChatId();
          const initialId = recentChats.some((summary) => summary.id === restoredId)
            ? restoredId
            : recentChats[0]?.id;
          setSummaries(recentChats);
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
      void openChat(selected.provider as ChatProvider, selected.path)
        .then((document) => {
          if (loadGenerationRef.current === generation) {
            setTranscriptState({ document });
          } else {
            document.releaseNativeResources();
          }
        })
        .catch((error) => {
          if (loadGenerationRef.current === generation) {
            setTranscriptState({ error: errorMessage(error) });
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

  return (
    <SidebarSplitView
      appearance="light"
      contentMinWidth={420}
      contentTitlebarHeight={CHAT_HISTORY_TITLEBAR_HEIGHT}
      contentTitlebarMaterial="glass"
      sidebarMinWidth={220}
      sidebarWidth={260}
      style={styles.root}
    >
      <ChatSidebar summaries={summaries} selectedId={selectedId} onSelect={handleSelect} />
      {summaries.length > 0 ? (
        <TranscriptPane state={transcriptState} />
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
          appearance: "light",
          backgroundColor: "#f5f6f8",
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
        titleVisibility: "hidden",
        titlebarControls: [],
      },
    },
  },
} satisfies WindowsConfig;

const ChatHistoryWindowsNavigator = createWindowsNavigator(chatHistoryWindowsConfig);

function openChatHistoryWindow() {
  return ChatHistoryWindowsNavigator.open(CHAT_HISTORY_WINDOW_MODULE_NAME);
}

function reportChatHistoryWindowError(error: unknown) {
  console.error(`[ChatHistoryWindow] ${errorMessage(error)}`);
}

export function App() {
  useEffect(() => {
    openChatHistoryWindow().catch(reportChatHistoryWindowError);
    const reopenSubscription = addApplicationReopenRequestedListener(({ hasVisibleWindows }) => {
      if (!hasVisibleWindows) {
        openChatHistoryWindow().catch(reportChatHistoryWindowError);
      }
    });
    return () => reopenSubscription.remove();
  }, []);

  return null;
}

export default App;

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 24,
    paddingTop: 12,
  },
  root: {
    flex: 1,
  },
  sidebar: {
    flex: 1,
  },
  sidebarItem: {
    height: 54,
  },
});
