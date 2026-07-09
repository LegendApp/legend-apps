import { SFSymbol } from "@legend-apps/sf-symbol";
import { getLegendDisplayTheme } from "@legend-apps/theme";
import { useEffect, useState } from "react";
import {
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useResolveClassNames } from "uniwind";
import { useMarkdownDisplayThemeSetting } from "./markdownSettings";

const defaultLinkURL = "https://";

export function MarkdownLinkPopover({
  onCancel,
  onSubmit,
}: {
  onCancel: () => void;
  onSubmit: (url: string) => void;
}) {
  const [url, setUrl] = useState(defaultLinkURL);
  const cardStyle = useResolveClassNames("border-border bg-surface");
  const inputStyle = useResolveClassNames("border-border bg-background text-foreground");
  const secondaryButtonStyle = useResolveClassNames("border-border bg-surface-muted");
  const primaryButtonStyle = useResolveClassNames("bg-primary");
  const displayTheme = getLegendDisplayTheme(useMarkdownDisplayThemeSetting());
  const mutedColor = displayTheme.colors.muted;
  const foregroundColor = displayTheme.colors.foreground;
  const trimmedURL = url.trim();
  const canSubmit = trimmedURL.length > 0;

  useEffect(() => {
    setUrl(defaultLinkURL);
  }, []);

  return (
    <View pointerEvents="box-none" style={styles.container}>
      <View className="border" style={[styles.popover, cardStyle]}>
        <View style={styles.header}>
          <SFSymbol color={foregroundColor} name="link" size={14} />
          <Text className="text-foreground" style={styles.title}>Link</Text>
        </View>
        <TextInput
          accessibilityLabel="Link URL"
          autoCapitalize="none"
          autoCorrect={false}
          autoFocus
          className="border"
          onChangeText={setUrl}
          onSubmitEditing={() => {
            if (canSubmit) {
              onSubmit(trimmedURL);
            }
          }}
          placeholder={defaultLinkURL}
          placeholderTextColor={mutedColor}
          style={[styles.input, inputStyle]}
          value={url}
        />
        <View style={styles.actions}>
          <Pressable
            accessibilityLabel="Cancel"
            accessibilityRole="button"
            className="border"
            onPress={onCancel}
            style={[styles.button, secondaryButtonStyle]}
          >
            <Text className="text-foreground" style={styles.secondaryButtonText}>Cancel</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Apply"
            accessibilityRole="button"
            disabled={!canSubmit}
            onPress={() => onSubmit(trimmedURL)}
            style={[styles.button, styles.primaryButton, primaryButtonStyle, !canSubmit ? styles.disabledButton : null]}
          >
            <Text className="text-primary-foreground" style={styles.primaryButtonText}>Apply</Text>
          </Pressable>
        </View>
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
  button: {
    alignItems: "center",
    borderRadius: 6,
    minWidth: 72,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  container: {
    alignItems: "center",
    left: 0,
    position: "absolute",
    right: 0,
    top: 18,
    zIndex: 30,
  },
  disabledButton: {
    opacity: 0.45,
  },
  header: {
    alignItems: "center",
    flexDirection: "row",
    gap: 8,
  },
  input: {
    borderRadius: 6,
    borderWidth: 1,
    fontSize: 13,
    height: 34,
    lineHeight: 18,
    marginTop: 10,
    minWidth: 280,
    paddingHorizontal: 10,
  },
  popover: {
    borderRadius: 8,
    padding: 12,
    shadowColor: "#000000",
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
    width: 320,
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
  title: {
    fontSize: 13,
    fontWeight: "600",
    lineHeight: 18,
  },
});
