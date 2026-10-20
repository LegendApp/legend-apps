import { EnrichedMarkdownText, type EnrichedMarkdownTextProps } from "react-native-enriched-markdown";
import { Pressable, Text, View } from "react-native";
import { parseCallout, parseRichFence } from "./richBlockSyntax";
import { MarkdownQuestion } from "./MarkdownQuestion";
import { parseQuestion, type QuestionAnswer } from "./richQuestions";
import { useState, type ReactNode } from "react";
import { MarkdownMermaid } from "./MarkdownMermaid";
import { MarkdownChart } from "./MarkdownChart";
import { parseChart, type ChartData } from "./richCharts";

type MarkdownBlockRendererProps = Omit<
  EnrichedMarkdownTextProps,
  "flavor" | "markdown" | "nativeMarkdownBlockId" | "nativeMarkdownRevision"
> & {
  blockId: string;
  renderRevision?: number;
  sourceMarkdown?: string;
  onQuestionAnswer?: (id: string, answer: QuestionAnswer) => Promise<void>;
  onEditSource?: () => void;
  getQuestionError?: (id: string) => string | undefined;
};

export function MarkdownBlockRenderer({
  blockId,
  renderRevision = 0,
  sourceMarkdown,
  onQuestionAnswer,
  onEditSource,
  getQuestionError,
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
  const fence = sourceMarkdown ? parseRichFence(sourceMarkdown) : null;
  const code = (
    <EnrichedMarkdownText
      {...rest}
      flavor="github"
      nativeMarkdownBlockId={blockId}
      nativeMarkdownRevision={renderRevision}
    />
  );
  if (fence?.language === "mermaid") {
    return <MarkdownGraphic key={sourceMarkdown} source={fence.body} code={code} />;
  }
  let error: string | undefined;
  if (fence?.language === "chart") {
    try {
      const chart = parseChart(fence.body);
      return <MarkdownGraphic key={sourceMarkdown} chart={chart} source={fence.body} code={code} color={rest.markdownStyle?.paragraph?.color} />;
    } catch (cause) {
      error = `Invalid chart: ${cause instanceof Error ? cause.message.split("\n")[0] : String(cause)}`;
    }
  }
  if (fence?.language === "question") {
    try {
      const question = parseQuestion(fence.body);
      const questionError = getQuestionError?.(question.id);
      if (questionError) throw new Error(questionError);
      if (onQuestionAnswer) {
        return (
          <View className="gap-2">
            <MarkdownQuestion key={sourceMarkdown} question={question} onAnswer={onQuestionAnswer} />
            <Pressable accessibilityRole="button" onPress={onEditSource} className="self-start py-1">
              <Text style={{ color: rest.markdownStyle?.paragraph?.color }}>Edit source</Text>
            </Pressable>
          </View>
        );
      }
    } catch (cause) {
      error = `Invalid question: ${cause instanceof Error ? cause.message.split("\n")[0] : String(cause)}`;
    }
  }
  return error ? <View>{code}<BlockError message={error} /></View> : code;
}

function BlockError({ message }: { message: string }) {
  return <Text accessibilityRole="alert" style={{ color: "#dc2626", fontSize: 12 }}>{message}</Text>;
}

function MarkdownGraphic({ source, chart, code, color }: { source: string; chart?: ChartData; code: ReactNode; color?: string }) {
  const [error, setError] = useState("");
  return error ? (
    <View>{code}<BlockError message={`Invalid ${chart ? "chart" : "mermaid"}: ${error.split("\n")[0]}`} /></View>
  ) : (
    <View pointerEvents="none">{chart ? <MarkdownChart chart={chart} color={color} onError={setError} /> : <MarkdownMermaid source={source} onError={setError} />}</View>
  );
}
