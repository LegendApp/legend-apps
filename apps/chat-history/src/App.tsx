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
import {
  LegendList,
  type LegendListDataSourceRenderItemProps,
} from "@legendapp/list/react-native";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, StyleSheet, Text, View } from "react-native";
import { Uniwind } from "uniwind";
import { readSelectedChatId, writeSelectedChatId } from "./chatStorage";
import { TranscriptDataSource } from "./TranscriptDataSource";
import { TranscriptRow } from "./TranscriptRow";

Uniwind.setTheme("light");

type TranscriptState = {
  document?: ChatDocument;
  error?: string;
  loading: boolean;
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
  const dataSource = useMemo(() => new TranscriptDataSource(document), [document]);
  const renderItem = useCallback(
    ({ item }: LegendListDataSourceRenderItemProps<number>) => (
      item === undefined ? null : <TranscriptRow document={document} index={item} />
    ),
    [document],
  );
  const getItemType = useCallback(
    (index: number) => document.getRowMetadata(index).kind,
    [document],
  );

  useEffect(() => () => {
    document.releaseNativeResources();
  }, [document]);

  return (
    <View className="flex-1 bg-background">
      {document.warningCount > 0 ? (
        <View className="border-b border-amber-200 bg-amber-50 px-5 py-2">
          <Text className="text-xs text-amber-900">
            Some unsupported or malformed transcript records were skipped.
          </Text>
        </View>
      ) : null}
      <LegendList
        contentContainerStyle={styles.listContent}
        dataKey={document.documentId}
        dataSource={dataSource}
        getItemType={getItemType}
        initialScrollAtEnd
        recycleItems
        renderItem={renderItem}
        style={styles.list}
      />
    </View>
  );
}

function TranscriptPane({ state }: { state: TranscriptState }) {
  if (state.loading) {
    return (
      <View className="flex-1 items-center justify-center gap-3 bg-background">
        <ActivityIndicator />
        <Text className="text-sm text-muted">Loading transcript…</Text>
      </View>
    );
  }
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

export function App() {
  const [summaries, setSummaries] = useState<ChatSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | undefined>();
  const [catalogError, setCatalogError] = useState<string | undefined>();
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [transcriptState, setTranscriptState] = useState<TranscriptState>({ loading: false });
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
      setTranscriptState({ loading: true });
      void openChat(selected.provider as ChatProvider, selected.path)
        .then((document) => {
          if (loadGenerationRef.current === generation) {
            setTranscriptState({ document, loading: false });
          } else {
            document.releaseNativeResources();
          }
        })
        .catch((error) => {
          if (loadGenerationRef.current === generation) {
            setTranscriptState({ error: errorMessage(error), loading: false });
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
      contentTitlebarHeight={38}
      contentTitlebarMaterial="titlebar"
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
