import type { CodeHighlight } from "@legend-apps/presentation";
import { StyleSheet, Text, View } from "react-native";

type CodeBlockProps = { language?: string; source: string; highlighted?: CodeHighlight };

export function CodeBlock({ language, source, highlighted }: CodeBlockProps) {
  const last = highlighted?.tokens.at(-1);
  return (
    <View style={[styles.container, { backgroundColor: highlighted?.background ?? "#0d1117" }]}>
      {language ? <Text style={styles.language}>{language}</Text> : null}
      <Text style={[styles.code, { color: highlighted?.foreground ?? "#e6edf3" }]}>
        {!source ? "\u200b" : highlighted ? highlighted.tokens.map((token, index) => (
          <Text key={token.id} style={{ color: token.color }}>
            {source.slice(index === 0 ? 0 : highlighted.tokens[index - 1].offset + highlighted.tokens[index - 1].content.length, token.offset)}
            {token.content}
          </Text>
        )) : source}
        {highlighted ? source.slice(last ? last.offset + last.content.length : 0) : null}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: 20, padding: 28 },
  language: { color: "#94a3b8", fontFamily: "Menlo", fontSize: 22, marginBottom: 14, textTransform: "uppercase" },
  code: { fontFamily: "Menlo", fontSize: 30, lineHeight: 42 },
});
