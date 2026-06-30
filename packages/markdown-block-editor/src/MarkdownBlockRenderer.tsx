import { EnrichedMarkdownText, type EnrichedMarkdownTextProps } from "react-native-enriched-markdown";

type MarkdownBlockRendererProps = Omit<
  EnrichedMarkdownTextProps,
  "flavor" | "markdown" | "nativeMarkdownBlockId" | "nativeMarkdownRevision"
> & {
  blockId: string;
  renderRevision?: number;
};

export function MarkdownBlockRenderer({
  blockId,
  renderRevision = 0,
  ...rest
}: MarkdownBlockRendererProps) {
  return (
    <EnrichedMarkdownText
      {...rest}
      flavor="github"
      nativeMarkdownBlockId={blockId}
      nativeMarkdownRevision={renderRevision}
    />
  );
}
