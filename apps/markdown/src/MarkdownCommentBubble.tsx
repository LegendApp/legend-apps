import type { MarkdownSelectionAnchor } from "@legend-desktop/markdown-document";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useResolveClassNames } from "uniwind";

const bubbleWidth = 280;
const bubbleGap = 12;

export function MarkdownCommentBubble({
  anchor,
  onCancel,
  onChangeText,
  onSave,
  value,
}: {
  anchor: MarkdownSelectionAnchor;
  onCancel: () => void;
  onChangeText: (value: string) => void;
  onSave: () => void;
  value: string;
}) {
  const cardStyle = useResolveClassNames("border-border bg-surface");
  const inputStyle = useResolveClassNames("border-border bg-background text-foreground");
  const secondaryButtonStyle = useResolveClassNames("border-border bg-surface-muted");
  const primaryButtonStyle = useResolveClassNames("bg-primary");
  const canSave = value.trim().length > 0;
  const itemRight = anchor.itemWidth ?? anchor.width;
  const itemTop = anchor.itemY ?? anchor.y;
  const position = {
    left: itemRight + bubbleGap,
    top: Math.max(0, anchor.y - itemTop - 6),
  };

  return (
    <View
      className="border"
      pointerEvents="auto"
      style={[styles.bubble, cardStyle, position]}
    >
      <Text className="text-foreground" style={styles.label}>Comment:</Text>
      <TextInput
        accessibilityLabel="Comment"
        className="border"
        multiline
        onChangeText={onChangeText}
        placeholder="Add a comment"
        placeholderTextColor="#8a8a8a"
        style={[styles.input, inputStyle]}
        value={value}
      />
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          className="border"
          onPress={onCancel}
          style={[styles.button, secondaryButtonStyle]}
        >
          <Text className="text-foreground" style={styles.secondaryButtonText}>Cancel</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          disabled={!canSave}
          onPress={onSave}
          style={[styles.button, styles.primaryButton, primaryButtonStyle, !canSave ? styles.disabledButton : null]}
        >
          <Text className="text-primary-foreground" style={styles.primaryButtonText}>Save</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: "row",
    gap: 8,
    justifyContent: "flex-end",
    marginTop: 12,
  },
  bubble: {
    borderRadius: 8,
    padding: 12,
    position: "absolute",
    shadowColor: "#000000",
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    width: bubbleWidth,
    zIndex: 20,
  },
  button: {
    alignItems: "center",
    borderRadius: 6,
    minWidth: 72,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  disabledButton: {
    opacity: 0.45,
  },
  input: {
    borderRadius: 6,
    borderWidth: 1,
    fontSize: 13,
    lineHeight: 18,
    marginTop: 8,
    minHeight: 76,
    paddingHorizontal: 10,
    paddingVertical: 8,
    textAlignVertical: "top",
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  primaryButton: {
    borderWidth: 0,
  },
  primaryButtonText: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
  secondaryButtonText: {
    fontSize: 13,
    fontWeight: "500",
    lineHeight: 18,
  },
});
