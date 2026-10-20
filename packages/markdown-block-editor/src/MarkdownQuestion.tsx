import { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import type { QuestionAnswer, QuestionData } from "./richQuestions";

export function MarkdownQuestion({ question, onAnswer }: {
  question: QuestionData;
  onAnswer: (id: string, answer: QuestionAnswer) => Promise<void>;
}) {
  const [editing, setEditing] = useState(false);
  const [answer, setAnswer] = useState<QuestionAnswer>(question.answer ?? (question.type === "multi" ? [] : ""));
  const [other, setOther] = useState(() => {
    const values = Array.isArray(question.answer) ? question.answer : [question.answer ?? ""];
    return values.find((value) => value && !question.options?.includes(value)) ?? "";
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const answered = question.answer !== undefined && !editing;
  const selected = Array.isArray(answer) ? answer : [answer];
  const otherSelected = selected.some((value) => !question.options?.includes(value));
  const canSave = Array.isArray(answer) ? answer.length > 0 && answer.every((value) => value.trim()) : Boolean(answer.trim());

  async function save() {
    setBusy(true);
    setError("");
    try {
      await onAnswer(question.id, answer);
      setEditing(false);
    } catch (error) {
      setError(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }

  function toggle(value: string) {
    setAnswer(question.type === "multi"
      ? selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value]
      : value);
  }

  return (
    <View className="gap-3 rounded-lg border border-sky-500/40 bg-sky-500/5 p-4">
      <Text className="text-base font-semibold text-foreground">{question.prompt}</Text>
      {question.type === "text" ? answered ? (
        <Text selectable className="text-base text-foreground">{question.answer}</Text>
      ) : (
        <TextInput
          accessibilityLabel={question.prompt}
          className="min-h-20 rounded-md border border-border p-3 text-base text-foreground"
          editable={!busy}
          multiline
          onChangeText={setAnswer}
          value={typeof answer === "string" ? answer : ""}
        />
      ) : (
        <View className="gap-2">
          {question.options!.map((option) => {
            const chosen = (answered ? Array.isArray(question.answer) ? question.answer : [question.answer] : selected).includes(option);
            return (
              <Pressable
                accessibilityRole={question.type === "multi" ? "checkbox" : "radio"}
                accessibilityState={{ checked: chosen, disabled: answered || busy }}
                className={chosen ? "rounded-md border border-sky-500 bg-sky-500/15 px-3 py-2" : "rounded-md border border-border px-3 py-2"}
                disabled={answered || busy}
                key={option}
                onPress={() => toggle(option)}
              >
                <Text className="text-base text-foreground">{chosen ? "● " : "○ "}{option}</Text>
              </Pressable>
            );
          })}
          {question.allowOther && (answered ? (
            other ? <Text className="text-base text-foreground">Other: {other}</Text> : null
          ) : (
            <View className="gap-2">
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: otherSelected }} disabled={busy} onPress={() => toggle(other)}>
                <Text className="text-base text-foreground">{otherSelected ? "● " : "○ "}Other</Text>
              </Pressable>
              <TextInput
                accessibilityLabel="Other answer"
                className="rounded-md border border-border px-3 py-2 text-base text-foreground"
                editable={!busy}
                onChangeText={(text) => {
                  setOther(text);
                  setAnswer(question.type === "multi" ? [...selected.filter((value) => question.options!.includes(value)), text] : text);
                }}
                value={other}
              />
            </View>
          ))}
        </View>
      )}
      <Pressable
        accessibilityRole="button"
        disabled={busy || (!answered && !canSave)}
        className="self-start rounded-md bg-sky-600 px-3 py-2"
        onPress={answered ? () => { setAnswer(question.answer!); setEditing(true); } : save}
      >
        <Text className="text-sm font-medium text-white">{answered ? "Change answer" : busy ? "Saving…" : "Save answer"}</Text>
      </Pressable>
      {error ? <Text className="text-sm text-red-600">{error}</Text> : null}
    </View>
  );
}
