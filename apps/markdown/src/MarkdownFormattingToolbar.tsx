import { useMemo, useState } from "react";
import type { RefObject } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { SFSymbol } from "@legendapp/spark/ui/symbol";
import { getLegendDisplayTheme } from "@legend-apps/theme";
import { useResolveClassNames } from "uniwind";
import type { MarkdownDocumentCommands } from "@legend-apps/markdown-document";
import {
  getMarkdownPluginCommand,
  type MarkdownToolbarLayoutId,
  useMarkdownDisplayThemeSetting,
  useMarkdownPluginToolbarCommands,
  useMarkdownToolbarLayoutSetting,
} from "./markdownSettings";
import { findMarkdownSuggestion, type MarkdownSuggestion } from "./markdownPlugins";
import { markdownToolbarItemMap } from "./markdownToolbarItems";

type PluginFix = { generation: number; suggestion: MarkdownSuggestion };

/** Whether the suggestion's command is still enabled and its rule still makes the same replacement. */
function isSuggestionCurrent(suggestion: MarkdownSuggestion) {
  return getMarkdownPluginCommand(suggestion.commandId)?.rules.some((rule) => (
    rule.id === suggestion.ruleId && rule.find === suggestion.find && rule.replace === suggestion.replace
  )) ?? false;
}

declare module "react-native" {
  interface PressableProps {
    tooltip?: string;
  }
}

type MarkdownFormattingToolbarPlacement = "top" | "bottom";

export function MarkdownFormattingToolbar({
  commandsRef,
  floating,
  layoutId = floating ? "selection" : "top",
  onInsertLink,
  placement = "top",
  style,
}: {
  commandsRef: RefObject<MarkdownDocumentCommands | null>;
  floating?: boolean;
  layoutId?: MarkdownToolbarLayoutId;
  onInsertLink?: () => void;
  placement?: MarkdownFormattingToolbarPlacement;
  style?: StyleProp<ViewStyle>;
}) {
  const toolbarStyle = useResolveClassNames("border-border bg-surface");
  const buttonStyle = useResolveClassNames("border-border bg-surface-muted");
  const displayTheme = getLegendDisplayTheme(useMarkdownDisplayThemeSetting());
  const iconColor = displayTheme.colors.foreground;
  const toolbarLayout = useMarkdownToolbarLayoutSetting(layoutId);
  const toolbarItems = useMemo(
    () => toolbarLayout.shown.map((itemId) => markdownToolbarItemMap[itemId]).filter(Boolean),
    [toolbarLayout],
  );
  const pluginCommands = useMarkdownPluginToolbarCommands(layoutId);
  const [pluginResult, setPluginResult] = useState<{ message: string; fix?: PluginFix }>();
  const runPluginCommand = async (commandId: string) => {
    const command = getMarkdownPluginCommand(commandId);
    const commands = commandsRef.current;
    if (!command || !commands) return;
    const { generation, blocks } = await commands.readBlocks();
    const suggestion = findMarkdownSuggestion(blocks, command.rules, command.id);
    setPluginResult(suggestion
      ? { message: `Replace “${suggestion.find}” with “${suggestion.replace}”`, fix: { generation, suggestion } }
      : { message: `${command.title}: no issues` });
  };
  const applyFix = ({ generation, suggestion }: PluginFix) => {
    const commands = commandsRef.current;
    if (!commands) return;
    let message = "The plugin rule changed or was disabled; suggestion withdrawn.";
    if (isSuggestionCurrent(suggestion)) {
      message = commands.replaceBlockText(generation, suggestion.blockId, suggestion.before, suggestion.after)
        ? "Fix applied"
        : "Document changed; suggestion withdrawn. Check again.";
    }
    setPluginResult({ message });
  };
  const pluginButtons = pluginCommands.map((command) => (
    <Pressable
      accessibilityLabel={command.title}
      accessibilityRole="button"
      className="border"
      key={command.id}
      onPress={() => {
        runPluginCommand(command.id).catch((error: unknown) => setPluginResult({ message: String(error) }));
      }}
      style={[styles.button, buttonStyle]}
      tooltip={command.title}
    >
      {command.icon ? <SFSymbol color={iconColor} name={command.icon} size={14} style={styles.icon} /> : null}
      <Text className="text-foreground" style={styles.buttonText}>{command.title}</Text>
    </Pressable>
  ));
  const toolbarButtons = [...toolbarItems.map((item) => (
    <Pressable
      accessibilityLabel={item.accessibilityLabel}
      accessibilityRole="button"
      className="border"
      key={item.id}
      onPressIn={() => {
        if (item.id === "link" && onInsertLink) {
          onInsertLink();
          return;
        }

        const commands = commandsRef.current;
        if (commands) {
          item.run(commands);
        }
      }}
      style={[styles.button, buttonStyle]}
      tooltip={item.accessibilityLabel}
    >
      {item.icon ? (
        <SFSymbol color={iconColor} name={item.icon} size={14} style={styles.icon} />
      ) : (
        <Text
          className="text-foreground"
          style={[styles.textIcon, "textStyle" in item && item.textStyle ? styles[item.textStyle] : null]}
        >
          {item.fallbackLabel}
        </Text>
      )}
    </Pressable>
  )), ...pluginButtons];

  if (toolbarButtons.length === 0) {
    return null;
  }

  return (
    <View
      className="border"
      style={[
        styles.toolbar,
        floating ? styles.floatingToolbar : placement === "bottom" ? styles.bottomToolbar : styles.topToolbar,
        toolbarStyle,
        style,
      ]}
    >
      {floating ? (
        <View style={styles.toolbarContent}>{toolbarButtons}</View>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.toolbarContent, styles.dockedToolbarContent]}
          horizontal
          showsHorizontalScrollIndicator={false}
        >
          {toolbarButtons}
        </ScrollView>
      )}
      {pluginResult ? (
        <View style={[styles.toolbarContent, styles.dockedToolbarContent]}>
          <Text accessibilityLabel="Plugin result" className="text-foreground" style={styles.buttonText}>{pluginResult.message}</Text>
          {pluginResult.fix ? (
            <Pressable
              accessibilityLabel="Apply Fix"
              accessibilityRole="button"
              className="border"
              onPress={() => {
                try {
                  if (pluginResult.fix) applyFix(pluginResult.fix);
                } catch (error) {
                  setPluginResult({ message: String(error) });
                }
              }}
              style={[styles.button, buttonStyle]}
            >
              <Text className="text-foreground" style={styles.buttonText}>Apply</Text>
            </Pressable>
          ) : null}
          <Pressable
            accessibilityLabel="Dismiss"
            accessibilityRole="button"
            className="border"
            onPress={() => setPluginResult(undefined)}
            style={[styles.button, buttonStyle]}
          >
            <Text className="text-foreground" style={styles.buttonText}>Dismiss</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bold: {
    fontWeight: "700",
  },
  button: {
    alignItems: "center",
    borderRadius: 6,
    height: 30,
    justifyContent: "center",
    minWidth: 30,
    paddingHorizontal: 8,
  },
  buttonText: {
    fontSize: 12,
    fontWeight: "600",
    lineHeight: 16,
  },
  floatingToolbar: {
    shadowColor: "#000000",
    shadowOffset: { height: 4, width: 0 },
    shadowOpacity: 0.16,
    shadowRadius: 12,
  },
  icon: {
    flexShrink: 0,
  },
  italic: {
    fontStyle: "italic",
  },
  strikethrough: {
    textDecorationLine: "line-through",
  },
  toolbar: {
    borderRadius: 8,
    // React Native's types omit macOS cursor values; without this the text underneath shows its I-beam.
    cursor: "default" as ViewStyle["cursor"],
    maxWidth: "100%",
  },
  textIcon: {
    fontSize: 12,
    fontWeight: "700",
    lineHeight: 16,
    minWidth: 16,
    textAlign: "center",
  },
  toolbarContent: {
    alignItems: "center",
    flexDirection: "row",
    gap: 6,
    minHeight: 40,
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  dockedToolbarContent: {
    flexGrow: 1,
    justifyContent: "center",
  },
  bottomToolbar: {
    borderBottomWidth: 0,
    borderLeftWidth: 0,
    borderRadius: 0,
    borderRightWidth: 0,
  },
  topToolbar: {
    borderLeftWidth: 0,
    borderRadius: 0,
    borderRightWidth: 0,
    borderTopWidth: 0,
  },
  underline: {
    textDecorationLine: "underline",
  },
});
