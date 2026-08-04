import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useResolveClassNames } from "uniwind";

const PLACEHOLDER = "Send a test message that doesn't actually do anything";
const composerInputPlatformProps = Platform.OS === "macos"
  ? { enableFocusRing: false }
  : {};

export function ChatComposer({
  disabled,
  onSend,
}: {
  disabled: boolean;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const canSend = !disabled && text.trim().length > 0;
  const mutedTextStyle = useResolveClassNames("text-muted");

  const send = () => {
    const message = text.trim();
    if (canSend) {
      setText("");
      onSend(message);
    }
  };

  return (
    <View className="bg-background px-5 pb-4 pt-2">
      <View className="mx-auto w-full max-w-[900px] flex-row items-end rounded-3xl border border-border bg-surface px-4 py-3">
        <TextInput
          {...composerInputPlatformProps}
          accessibilityLabel={PLACEHOLDER}
          className="text-foreground"
          editable={!disabled}
          multiline
          onChangeText={setText}
          onSubmitEditing={send}
          placeholder={PLACEHOLDER}
          placeholderTextColor={mutedTextStyle.color}
          returnKeyType="send"
          style={styles.input}
          submitBehavior="submit"
          value={text}
        />
        <Pressable
          accessibilityLabel="Send test message"
          accessibilityRole="button"
          className="ml-3 h-8 w-8 items-center justify-center rounded-full bg-primary"
          disabled={!canSend}
          onPress={send}
          style={!canSend ? styles.disabledButton : undefined}
        >
          <Text className="text-base font-semibold text-primary-foreground">↑</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  disabledButton: {
    opacity: 0.35,
  },
  input: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
    maxHeight: 120,
    minHeight: 32,
    paddingHorizontal: 0,
    paddingVertical: 5,
    textAlignVertical: "center",
  },
});
