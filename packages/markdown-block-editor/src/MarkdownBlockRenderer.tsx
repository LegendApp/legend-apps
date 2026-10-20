import { EnrichedMarkdownText, type EnrichedMarkdownTextProps } from "react-native-enriched-markdown";
import { Pressable, Text, View } from "react-native";
import { parseCallout, parseRichFence } from "./richBlockSyntax";
import { MarkdownQuestion } from "./MarkdownQuestion";
import { parseQuestion, type QuestionAnswer } from "./richQuestions";

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
  let error: string | undefined;
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
  return (
    <View>
    <EnrichedMarkdownText
      {...rest}
      flavor="github"
      nativeMarkdownBlockId={blockId}
      nativeMarkdownRevision={renderRevision}
    />
    {error ? <Text accessibilityRole="alert" style={{ color: "#dc2626", fontSize: 12 }}>{error}</Text> : null}
    </View>
  );
}
