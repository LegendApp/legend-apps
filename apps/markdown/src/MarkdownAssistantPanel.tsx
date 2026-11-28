import { SegmentedOptions } from "@legend-apps/design-system";
import { Button } from "@legendapp/spark/ui";
import { useValue } from "@legendapp/state/react";
import { useRef, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { settingLabel, valueLabel, type AssistantMessage, type MarkdownAssistant, type Proposal } from "./markdownAssistant";

const previewOptions = [
  { label: "Before", value: "before" },
  { label: "After", value: "after" },
] as const;

/** The right-hand Assistant: a plain conversation, an inline settings changes card and a composer. */
export function MarkdownAssistantPanel({ assistant, onClose }: { assistant: MarkdownAssistant; onClose: () => void }) {
  const messages = useValue(assistant.state$.messages);
  const pending = useValue(assistant.state$.pending);
  const showAfter = useValue(assistant.state$.showAfter);
  const [text, setText] = useState("");
  const scroll = useRef<ScrollView>(null);
  const canSend = !pending && !!text.trim();
  const send = () => {
    if (!canSend) return;
    setText("");
    void assistant.send(text);
  };

  return (
    <View accessibilityLabel="Assistant" className="border-l border-border bg-background" style={styles.panel} testID="markdown-assistant-panel">
      <View className="flex-row items-center justify-between px-4 py-3">
        <Text accessibilityRole="header" className="text-sm font-semibold text-foreground"><Text className="text-primary">✦</Text> Assistant</Text>
        <Pressable accessibilityLabel="Close Assistant" accessibilityRole="button" hitSlop={8} onPress={onClose}>
          <Text className="text-text-secondary">✕</Text>
        </Pressable>
      </View>
      <ScrollView className="flex-1" contentContainerClassName="gap-4 px-4 pb-4" onContentSizeChange={() => scroll.current?.scrollToEnd()} ref={scroll}>
        {messages.length ? null : (
          <Text className="text-xs text-text-secondary" selectable>Your chat and relevant settings go to Claude. Organization-managed hooks can receive the prompt.</Text>
        )}
        {messages.map(message => (
          <Message
            key={message.id}
            message={message}
            onApply={() => assistant.apply(message.id)}
            onDiscard={() => assistant.discard(message.id)}
            onPreview={value => assistant.setShowAfter(value === "after")}
            showAfter={showAfter}
          />
        ))}
        {pending ? <Text accessibilityLiveRegion="polite" className="text-sm text-text-secondary">Thinking…</Text> : null}
      </ScrollView>
      <View className="m-3 rounded-lg border border-border bg-background-primary px-3 py-2">
        <TextInput
          accessibilityLabel="Ask Assistant"
          className="text-sm text-foreground"
          editable={!pending}
          onBlur={() => assistant.state$.composerFocused.set(false)}
          onChangeText={setText}
          onFocus={() => assistant.state$.composerFocused.set(true)}
          onSubmitEditing={send}
          placeholder="Ask Assistant…"
          returnKeyType="send"
          submitBehavior="submit"
          value={text}
        />
        <View className="mt-2 flex-row items-center justify-between">
          <Text className="text-xs text-text-tertiary">↩ send</Text>
          <Pressable
            accessibilityLabel="Send"
            accessibilityRole="button"
            accessibilityState={{ disabled: !canSend }}
            className="h-6 w-6 items-center justify-center rounded-full bg-primary"
            disabled={!canSend}
            onPress={send}
            style={canSend ? undefined : styles.disabled}
          >
            <Text className="text-sm font-semibold text-primary-foreground">↑</Text>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

function Message({ message, onApply, onDiscard, onPreview, showAfter }: {
  message: AssistantMessage;
  onApply: () => void;
  onDiscard: () => void;
  onPreview: (value: "before" | "after") => void;
  showAfter: boolean;
}) {
  if (message.role === "user") {
    return (
      <View className="ml-8 self-end rounded-lg bg-primary/10 px-3 py-2">
        <Text className="text-sm text-foreground" selectable>{message.text}</Text>
      </View>
    );
  }
  if (message.role === "error") {
    return <Text accessibilityRole="alert" className="text-sm text-red-600" selectable>{message.text}</Text>;
  }
  return (
    <View className="gap-1">
      <Text className="text-xs font-semibold text-primary">✦ Assistant</Text>
      <Text className="text-sm text-foreground" selectable>{message.text}</Text>
      {message.proposal ? <ChangesCard onApply={onApply} onDiscard={onDiscard} onPreview={onPreview} proposal={message.proposal} showAfter={showAfter} /> : null}
    </View>
  );
}

function ChangesCard({ onApply, onDiscard, onPreview, proposal, showAfter }: {
  onApply: () => void;
  onDiscard: () => void;
  onPreview: (value: "before" | "after") => void;
  proposal: Proposal;
  showAfter: boolean;
}) {
  const open = proposal.status === "open";
  const count = proposal.changes.length;
  return (
    <View className="mt-2 overflow-hidden rounded-lg border border-border" testID="markdown-assistant-changes">
      <View className="flex-row items-center justify-between gap-2 bg-background-secondary px-3 py-2">
        <Text className="text-sm font-semibold text-foreground">Settings changes</Text>
        {open
          ? <SegmentedOptions onChange={onPreview} options={previewOptions} value={showAfter ? "after" : "before"} />
          : <Text className="text-xs text-text-secondary">{proposal.status === "applied" ? "Applied" : "Discarded"}</Text>}
      </View>
      {proposal.changes.map(change => (
        <View
          accessible
          accessibilityLabel={`${settingLabel(change.key)}: ${valueLabel(change.key, change.from)} to ${valueLabel(change.key, change.to)}`}
          accessibilityRole="text"
          className="flex-row items-center justify-between gap-2 border-t border-border px-3 py-2"
          key={change.key}
        >
          <Text className="text-sm font-medium text-foreground" numberOfLines={1}>{settingLabel(change.key)}</Text>
          <Text className="text-sm text-foreground" numberOfLines={1}>
            <Text className="text-text-tertiary" style={styles.strike}>{valueLabel(change.key, change.from)}</Text>
            {" → "}
            <Text className="font-semibold">{valueLabel(change.key, change.to)}</Text>
          </Text>
        </View>
      ))}
      {open ? (
        <View className="flex-row flex-wrap justify-end gap-2 border-t border-border px-3 py-2">
          <Button onPress={onDiscard}>Discard</Button>
          <Button onPress={onApply}>{count === 1 ? "Apply 1 change" : `Apply ${count} changes`}</Button>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  disabled: { opacity: 0.4 },
  // Narrow windows give the panel at most half their width; the editor keeps the rest.
  panel: { maxWidth: "50%", width: 320 },
  strike: { textDecorationLine: "line-through" },
});
