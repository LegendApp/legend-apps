import { EnrichedMarkdownText, type EnrichedMarkdownTextProps } from "react-native-enriched-markdown";
import { Pressable, Text, View } from "react-native";
import { SFSymbol } from "@legendapp/spark/ui/symbol";
import { parseRichBlock } from "./richBlockSyntax";
import { MarkdownQuestion } from "./MarkdownQuestion";
import { type QuestionAnswer } from "./richQuestions";
import { useState, type ReactNode } from "react";
import { MarkdownMermaid } from "./MarkdownMermaid";
import { MarkdownChart } from "./MarkdownChart";
import { type ChartData } from "./richCharts";

type MarkdownBlockRendererProps = Omit<
  EnrichedMarkdownTextProps,
  "flavor" | "markdown" | "nativeMarkdownBlockId" | "nativeMarkdownRevision"
> & {
  blockId: string;
  renderRevision?: number;
  sourceMarkdown?: string;
  selected?: boolean;
  onSelect?: () => void;
  onQuestionAnswer?: (id: string, answer: QuestionAnswer) => Promise<void>;
  onEditSource?: () => void;
  onRenderError?: () => void;
  getQuestionError?: (id: string) => string | undefined;
};

export function MarkdownBlockRenderer({
  blockId,
  renderRevision = 0,
  sourceMarkdown,
  selected,
  onSelect,
  onQuestionAnswer,
  onEditSource,
  onRenderError,
  getQuestionError,
  ...rest
}: MarkdownBlockRendererProps) {
  const rich = parseRichBlock(sourceMarkdown ?? "", getQuestionError);
  const code = (
    <EnrichedMarkdownText
      {...rest}
      flavor="github"
      nativeMarkdownBlockId={blockId}
      nativeMarkdownRevision={renderRevision}
    />
  );
  const frame = { blockId, selected, onSelect, onEditSource, color: rest.markdownStyle?.paragraph?.color };
  if (rich?.type === "callout") {
    const { callout } = rich;
    return (
      <RichBlockFrame {...frame}>
        <View style={{ borderLeftWidth: 4, borderLeftColor: callout.color, paddingLeft: 16, paddingVertical: 8, gap: 8 }}>
          <Text style={{ color: callout.color, fontWeight: "600", fontSize: rest.markdownStyle?.paragraph?.fontSize ?? 16 }}>{callout.title}</Text>
          {callout.body ? <EnrichedMarkdownText {...rest} markdown={callout.body} flavor="github" /> : null}
        </View>
      </RichBlockFrame>
    );
  }
  if (rich?.type === "mermaid" || rich?.type === "chart") {
    return <MarkdownGraphic key={sourceMarkdown} {...frame} rich={rich} code={code} onRenderError={onRenderError} />;
  }
  if (rich?.type === "question" && onQuestionAnswer) {
    return (
      <RichBlockFrame {...frame}>
        <MarkdownQuestion key={sourceMarkdown} question={rich.question} onAnswer={onQuestionAnswer} />
      </RichBlockFrame>
    );
  }
  return rich?.type === "error" ? <View>{code}<BlockError message={rich.message} /></View> : code;
}

function RichBlockFrame({ blockId, selected, onSelect, onEditSource, color, children }: {
  blockId: string;
  selected?: boolean;
  onSelect?: () => void;
  onEditSource?: () => void;
  color?: string;
  children: ReactNode;
}) {
  const [hovered, setHovered] = useState(false);
  const showPencil = hovered || selected === true;
  return (
    <Pressable
      testID={`markdown-rich-block-${blockId}`}
      accessible={false}
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={onSelect}
      className="relative pr-9"
    >
      {children}
      <Pressable
        accessibilityLabel="Edit block source"
        accessibilityRole="button"
        accessibilityElementsHidden={!showPencil}
        pointerEvents={showPencil ? "auto" : "none"}
        onPress={(event) => { event.stopPropagation(); onEditSource?.(); }}
        className="absolute right-0 top-0 h-8 w-8 items-center justify-center rounded-md border border-border bg-background"
        style={{ opacity: showPencil ? 1 : 0 }}
      >
        <SFSymbol name="pencil" size={14} color={color} />
      </Pressable>
    </Pressable>
  );
}

function BlockError({ message }: { message: string }) {
  return <Text accessibilityRole="alert" numberOfLines={1} style={{ color: "#dc2626", fontSize: 12 }}>{message}</Text>;
}

function MarkdownGraphic({ rich, code, onRenderError, ...frame }: Omit<Parameters<typeof RichBlockFrame>[0], "children"> & {
  rich: { type: "mermaid"; source: string } | { type: "chart"; chart: ChartData };
  code: ReactNode;
  onRenderError?: () => void;
}) {
  const [error, setError] = useState("");
  function handleError(message: string) {
    setError(message);
    onRenderError?.();
  }
  return error ? (
    <View>{code}<BlockError message={`Invalid ${rich.type}: ${error.split("\n")[0]}`} /></View>
  ) : (
    <RichBlockFrame {...frame}>
      {rich.type === "chart" ? <MarkdownChart chart={rich.chart} color={frame.color} onError={handleError} /> : <MarkdownMermaid source={rich.source} onError={handleError} />}
    </RichBlockFrame>
  );
}
