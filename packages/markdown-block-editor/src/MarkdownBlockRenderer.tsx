import { EnrichedMarkdownText, type EnrichedMarkdownTextProps } from "react-native-enriched-markdown";
import { Text, View } from "react-native";
import { parseCallout } from "./richBlockSyntax";

type MarkdownBlockRendererProps = Omit<
  EnrichedMarkdownTextProps,
  "flavor" | "markdown" | "nativeMarkdownBlockId" | "nativeMarkdownRevision"
> & {
  blockId: string;
  renderRevision?: number;
  sourceMarkdown?: string;
};

export function MarkdownBlockRenderer({
  blockId,
  renderRevision = 0,
  sourceMarkdown,
  ...rest
}: MarkdownBlockRendererProps) {
  const callout = sourceMarkdown ? parseCallout(sourceMarkdown) : null;
  if (callout) {
    return (
      <View style={{ borderLeftWidth: 4, borderLeftColor: callout.color, paddingLeft: 16, paddingVertical: 8, gap: 8 }}>
        <Text style={{ color: callout.color, fontWeight: "600", fontSize: rest.markdownStyle?.paragraph?.fontSize ?? 16 }}>{callout.title}</Text>
        {callout.body ? <EnrichedMarkdownText {...rest} markdown={callout.body} flavor="github" /> : null}
      </View>
    );
  }
  return (
    <EnrichedMarkdownText
      {...rest}
      flavor="github"
      nativeMarkdownBlockId={blockId}
      nativeMarkdownRevision={renderRevision}
    />
  );
}
