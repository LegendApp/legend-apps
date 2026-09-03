import {
  getSyntaxTheme,
  highlightString,
  type SyntaxHighlightResult,
  type SyntaxStyle,
  type SyntaxTokenRun,
} from "@legend-apps/syntax-parser";
import { useEffect, useState } from "react";
import { StyleSheet, Text, View } from "react-native";

type CodeBlockProps = {
  language?: string;
  source: string;
};

function tokenStyle(token: SyntaxTokenRun, styles: ReadonlyMap<number, SyntaxStyle>) {
  const style = styles.get(token.styleId);
  return {
    color: style?.foreground,
    fontStyle: style?.fontStyle === 1 || style?.fontStyle === 3 ? "italic" as const : "normal" as const,
    fontWeight: style?.fontStyle === 2 || style?.fontStyle === 3 ? "700" as const : "400" as const,
  };
}

export function CodeBlock({ language, source }: CodeBlockProps) {
  const [highlighted, setHighlighted] = useState<SyntaxHighlightResult | null>(null);
  const theme = getSyntaxTheme("dark-plus");

  useEffect(() => {
    let active = true;
    setHighlighted(null);
    if (language) {
      void highlightString(source, language).then((result) => {
        if (active) {
          setHighlighted(result);
        }
      }).catch(() => {});
    }
    return () => {
      active = false;
    };
  }, [language, source]);

  const syntaxStyles = new Map(highlighted?.styles.map((style) => [style.id, style]));
  const lines = highlighted?.lines ?? source.split("\n").map((text, index) => ({ index, text, tokens: [] }));
  return (
    <View style={[styles.container, { backgroundColor: theme.background }]}>
      {language ? <Text style={styles.language}>{language}</Text> : null}
      {lines.map((line) => (
        <Text key={line.index} style={[styles.line, { color: theme.foreground }]}>
          {line.tokens.length > 0 ? line.tokens.map((token, index) => (
            <Text key={`${token.startColumn}:${index}`} style={tokenStyle(token, syntaxStyles)}>
              {line.text.slice(token.startColumn, token.startColumn + token.length)}
            </Text>
          )) : line.text || "\u200b"}
        </Text>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: 20, padding: 28 },
  language: { color: "#94a3b8", fontFamily: "Menlo", fontSize: 22, marginBottom: 14, textTransform: "uppercase" },
  line: { fontFamily: "Menlo", fontSize: 30, lineHeight: 42 },
});
