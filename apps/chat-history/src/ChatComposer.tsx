import { GlassSurface } from "@legend-apps/glass-effect-view";
import { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useResolveClassNames, useUniwind } from "uniwind";

const PLACEHOLDER = "Send a test message that doesn't actually do anything";
const composerInputPlatformProps = Platform.OS === "macos"
  ? { enableFocusRing: false }
  : {};

export function ChatComposer({
  disabled,
  onHeightChange,
  onSend,
}: {
  disabled: boolean;
  onHeightChange: (height: number) => void;
  onSend: (text: string) => void;
}) {
  const [text, setText] = useState("");
  const canSend = !disabled && text.trim().length > 0;
  const { theme } = useUniwind();
  const mutedTextStyle = useResolveClassNames("text-muted");
  const glassTintColor = theme === "dark" ? "#20212466" : "#ffffff70";

  const send = () => {
    const message = text.trim();
    if (canSend) {
      setText("");
      onSend(message);
    }
  };

  return (
    <View
      className="px-6 pb-5 pt-2"
      onLayout={(event) => onHeightChange(event.nativeEvent.layout.height)}
      pointerEvents="box-none"
    >
      <View className="mx-auto w-full max-w-[860px]" style={styles.shadow}>
        <GlassSurface
          className="rounded-[26px] border border-border"
          glassStyle="regular"
          tintColor={glassTintColor}
        >
          <View className="flex-row items-end px-4 py-3">
            <TextInput
              {...composerInputPlatformProps}
              accessibilityLabel={PLACEHOLDER}
              className="text-foreground"
              editable={!disabled}
              multiline={false}
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
              className="ml-3 h-9 w-9 items-center justify-center rounded-full bg-primary"
              disabled={!canSend}
              focusable={false}
              onPressIn={send}
              style={({ pressed }) => [
                styles.sendButton,
                !canSend ? styles.disabledButton : null,
                pressed && canSend ? styles.pressedButton : null,
              ]}
            >
              <Text className="text-lg font-semibold text-primary-foreground" style={styles.sendIcon}>↑</Text>
            </Pressable>
          </View>
        </GlassSurface>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  disabledButton: {
    opacity: 0.3,
    shadowOpacity: 0,
  },
  input: {
    flex: 1,
    fontSize: 15,
    lineHeight: 21,
    maxHeight: 120,
    minHeight: 36,
    paddingHorizontal: 0,
    paddingVertical: 7,
    textAlignVertical: "center",
  },
  pressedButton: {
    opacity: 0.82,
    transform: [{ scale: 0.94 }],
  },
  sendButton: {
    shadowColor: "#0068e6",
    shadowOffset: { height: 3, width: 0 },
    shadowOpacity: 0.3,
    shadowRadius: 7,
  },
  sendIcon: {
    lineHeight: 22,
    marginTop: -1,
  },
  shadow: {
    borderRadius: 26,
    shadowColor: "#000000",
    shadowOffset: { height: 10, width: 0 },
    shadowOpacity: 0.22,
    shadowRadius: 24,
  },
});
