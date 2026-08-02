import type { ChatDocument, ChatRowMetadata } from "@legend-apps/chat-history";
import { useRecyclingState } from "@legendapp/list/react-native";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { EnrichedMarkdownText, type MarkdownStyle } from "react-native-enriched-markdown";

const TOOL_PREVIEW_BYTES = 64 * 1024;

const markdownStyle: MarkdownStyle = {
  blockquote: {
    backgroundColor: "#eff6ff",
    borderColor: "#93c5fd",
    borderWidth: 3,
    color: "#1e3a8a",
    fontSize: 15,
    lineHeight: 22,
  },
  code: {
    backgroundColor: "#e2e8f0",
    color: "#0f172a",
    fontFamily: "Menlo",
    fontSize: 13,
  },
  codeBlock: {
    backgroundColor: "#0f172a",
    borderColor: "#1e293b",
    borderRadius: 7,
    borderWidth: 1,
    color: "#e2e8f0",
    fontFamily: "Menlo",
    fontSize: 12,
    lineHeight: 18,
    padding: 12,
  },
  h1: {
    color: "#0f172a",
    fontSize: 22,
    fontWeight: "700",
    lineHeight: 28,
  },
  h2: {
    color: "#0f172a",
    fontSize: 19,
    fontWeight: "700",
    lineHeight: 25,
  },
  link: {
    color: "#2563eb",
    underline: true,
  },
  list: {
    color: "#1e293b",
    fontSize: 15,
    gapWidth: 8,
    lineHeight: 22,
    markerColor: "#475569",
  },
  paragraph: {
    color: "#1e293b",
    fontSize: 15,
    lineHeight: 22,
  },
};

function openLink({ url }: { url: string }) {
  void Linking.openURL(url);
}

function ImagePlaceholder() {
  return (
    <View className="mt-2 rounded-md border border-border bg-surface-muted px-3 py-2">
      <Text className="text-xs text-muted">Image or attachment omitted</Text>
    </View>
  );
}

function MessageRow({ metadata }: { metadata: ChatRowMetadata }) {
  const isUser = metadata.kind === "user";
  return (
    <View className={isUser ? "items-end px-5 py-2" : "items-start px-5 py-2"}>
      <View
        className={isUser
          ? "max-w-[82%] rounded-xl border border-blue-200 bg-blue-50 px-4 py-3"
          : "max-w-[92%] rounded-xl border border-border bg-surface px-4 py-3"}
        style={styles.messageBubble}
      >
        <Text className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted">
          {isUser ? "You" : "Assistant"}
        </Text>
        {metadata.markdownBlockId ? (
          <EnrichedMarkdownText
            allowTrailingMargin={false}
            containerStyle={styles.markdown}
            flavor="github"
            markdownStyle={markdownStyle}
            nativeMarkdownBlockId={metadata.markdownBlockId}
            onLinkPress={openLink}
            selectable
          />
        ) : null}
        {metadata.hasImagePlaceholder ? <ImagePlaceholder /> : null}
      </View>
    </View>
  );
}

function ToolRow({ document, index, metadata }: {
  document: ChatDocument;
  index: number;
  metadata: ChatRowMetadata;
}) {
  const [expanded, setExpanded] = useRecyclingState(false);
  const [preview, setPreview] = useRecyclingState<string | undefined>(undefined);
  const canExpand = metadata.hasToolPreview;

  const toggleExpanded = () => {
    if (canExpand) {
      const nextExpanded = !expanded;
      if (nextExpanded && preview === undefined && metadata.hasToolPreview) {
        setPreview(document.getToolPreview(index, TOOL_PREVIEW_BYTES));
      }
      setExpanded(nextExpanded);
    }
  };

  return (
    <View className="px-5 py-2">
      <Pressable
        className="border-b border-border py-3"
        disabled={!canExpand}
        onPress={toggleExpanded}
      >
        <View className="flex-row items-center gap-2">
          <Text className="text-sm font-medium text-muted">
            {metadata.toolName ?? "Worked"}
          </Text>
          <Text className="text-lg leading-5 text-muted">{expanded ? "⌄" : "›"}</Text>
        </View>
        {expanded && preview ? (
          <Text className="mt-4 text-sm leading-6 text-foreground" selectable>
            {preview}
          </Text>
        ) : null}
      </Pressable>
    </View>
  );
}

export function TranscriptRow({ document, index }: { document: ChatDocument; index: number }) {
  const metadata = document.getRowMetadata(index);
  return metadata.kind === "tool"
    ? <ToolRow document={document} index={index} metadata={metadata} />
    : <MessageRow metadata={metadata} />;
}

const styles = StyleSheet.create({
  markdown: {
    alignSelf: "stretch",
  },
  messageBubble: {
    minWidth: 140,
  },
});
