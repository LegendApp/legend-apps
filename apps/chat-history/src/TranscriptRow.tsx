import type { ChatDocument, ChatFileChange, ChatRowMetadata } from "@legend-apps/chat-history";
import { useRecyclingState } from "@legendapp/list/react-native";
import { useEffect, useState } from "react";
import { Image, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import { EnrichedMarkdownText, type MarkdownStyle } from "react-native-enriched-markdown";

const TOOL_PREVIEW_BYTES = 64 * 1024;
const COLLAPSED_FILE_COUNT = 3;

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

function imageUri(source: string) {
  if (/^[a-z][a-z\d+.-]*:/i.test(source)) {
    return source;
  }
  return `file://${source.split("/").map(encodeURIComponent).join("/")}`;
}

function MessageImage({ source }: { source: string }) {
  const uri = imageUri(source);
  const [aspectRatio, setAspectRatio] = useState(16 / 9);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    Image.getSize(
      uri,
      (width, height) => {
        if (active && width > 0 && height > 0) {
          setAspectRatio(width / height);
        }
      },
      () => {},
    );
    return () => {
      active = false;
    };
  }, [uri]);

  let image = (
    <Image
      accessibilityLabel="Attached image"
      onError={() => setFailed(true)}
      resizeMode="contain"
      source={{ uri }}
      style={[styles.messageImage, { aspectRatio }]}
    />
  );
  if (failed) {
    image = <ImagePlaceholder />;
  }
  return image;
}

function MessageRow({ document, index, metadata }: {
  document: ChatDocument;
  index: number;
  metadata: ChatRowMetadata;
}) {
  const isUser = metadata.kind === "user";
  const imageSources = Array.from(
    { length: metadata.imageCount },
    (_, imageIndex) => document.getImageSource(index, imageIndex),
  );
  return (
    <View className={isUser ? "items-end px-5 py-2" : "items-start px-5 py-3"}>
      <View
        className={isUser
          ? "max-w-[82%] self-end rounded-2xl bg-gray-200 px-4 py-3"
          : "w-full max-w-[92%]"}
      >
        {imageSources.map((source, imageIndex) => (
          <MessageImage key={`${source}:${imageIndex}`} source={source} />
        ))}
        {metadata.markdownBlockId ? (
          <EnrichedMarkdownText
            allowTrailingMargin={false}
            containerStyle={isUser ? styles.userMarkdown : styles.assistantMarkdown}
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

function FileChangeLine({ file }: { file: ChatFileChange }) {
  const separatorIndex = file.path.lastIndexOf("/") + 1;
  const directory = file.path.slice(0, separatorIndex);
  const name = file.path.slice(separatorIndex);
  return (
    <View className="flex-row items-center gap-4 px-4 py-3">
      <Text className="min-w-0 flex-1 text-sm" numberOfLines={1} selectable>
        <Text className="text-muted">{directory}</Text>
        <Text className="text-foreground">{name}</Text>
      </Text>
      <View className="flex-row items-center gap-1.5">
        <Text className="text-sm font-medium text-green-600">+{file.additions}</Text>
        <Text className="text-sm font-medium text-red-600">-{file.deletions}</Text>
      </View>
    </View>
  );
}

function FileChangesRow({ document, index, metadata }: {
  document: ChatDocument;
  index: number;
  metadata: ChatRowMetadata;
}) {
  const [expanded, setExpanded] = useRecyclingState(false);
  const fileCount = metadata.fileCount ?? 0;
  const visibleFileCount = expanded ? fileCount : Math.min(COLLAPSED_FILE_COUNT, fileCount);
  const hiddenFileCount = fileCount - COLLAPSED_FILE_COUNT;
  const files = Array.from(
    { length: visibleFileCount },
    (_, fileIndex) => document.getFileChange(index, fileIndex),
  );

  return (
    <View className="px-5 py-2">
      <View className="overflow-hidden rounded-xl border border-border bg-surface">
        <View className="flex-row items-center gap-3 px-4 py-4">
          <View className="h-10 w-10 items-center justify-center rounded-lg bg-surface-muted">
            <View className="h-5 w-5 items-center justify-center rounded border-2 border-muted">
              <Text className="text-base font-semibold leading-4 text-muted">+</Text>
            </View>
          </View>
          <View className="flex-1">
            <Text className="text-base font-semibold text-foreground">
              Edited {fileCount} {fileCount === 1 ? "file" : "files"}
            </Text>
            <View className="mt-1 flex-row items-center gap-2">
              <Text className="text-sm font-medium text-green-600">+{metadata.fileAdditions ?? 0}</Text>
              <Text className="text-sm font-medium text-red-600">-{metadata.fileDeletions ?? 0}</Text>
            </View>
          </View>
        </View>
        <View className="border-t border-border">
          {files.map((file) => <FileChangeLine file={file} key={file.path} />)}
        </View>
        {hiddenFileCount > 0 ? (
          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded }}
            className="flex-row items-center gap-2 border-t border-border bg-surface-muted px-4 py-3"
            onPress={() => setExpanded(!expanded)}
          >
            <Text className="text-sm font-medium text-foreground">
              {expanded ? "Show less" : `Show ${hiddenFileCount} more files`}
            </Text>
            <Text className="text-lg leading-4 text-muted">{expanded ? "⌃" : "⌄"}</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

export function TranscriptRow({ document, index }: { document: ChatDocument; index: number }) {
  const metadata = document.getRowMetadata(index);
  let row = <MessageRow document={document} index={index} metadata={metadata} />;
  if (metadata.kind === "tool") {
    row = <ToolRow document={document} index={index} metadata={metadata} />;
  } else if (metadata.kind === "files") {
    row = <FileChangesRow document={document} index={index} metadata={metadata} />;
  }
  return row;
}

const styles = StyleSheet.create({
  assistantMarkdown: {
    alignSelf: "stretch",
  },
  userMarkdown: {
    alignSelf: "flex-start",
  },
  messageImage: {
    borderRadius: 12,
    marginBottom: 8,
    maxWidth: "100%",
    width: 300,
  },
});
