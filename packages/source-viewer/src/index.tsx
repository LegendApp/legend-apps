import { StyleSheet, Text, View, type LayoutChangeEvent, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import type { SyntaxRenderLine, SyntaxStyle } from "@legend-desktop/syntax-parser";

export const sourceViewerRowHeight = 22;
export const sourceViewerLineNumberWidth = 72;
export const sourceViewerCodeFontFamily = "Menlo";

export type SyntaxStyleMap = Map<number, SyntaxStyle>;

export function createSyntaxStyleMap(styles: readonly SyntaxStyle[]) {
  return new Map(styles.map((style) => [style.id, style]));
}

export type TokenizedTextProps = {
  foregroundColor: string;
  line?: SyntaxRenderLine;
  numberOfLines?: number;
  selectable?: boolean;
  style?: StyleProp<TextStyle>;
  tokenStyleById: SyntaxStyleMap;
};

export function TokenizedText({
  foregroundColor,
  line,
  numberOfLines = 1,
  selectable = true,
  style,
  tokenStyleById,
}: TokenizedTextProps) {
  return (
    <Text numberOfLines={numberOfLines} selectable={selectable} style={[styles.sourceText, { color: foregroundColor }, style]}>
      {line && line.tokens.length === 0 ? line.text : line?.tokens.map((token, tokenIndex) => {
        const tokenStyle = tokenStyleById.get(token.styleId);
        const text = line.text.slice(token.startColumn, token.startColumn + token.length);
        return (
          <Text
            key={`${line.index}:${token.startColumn}:${tokenIndex}`}
            style={{
              color: tokenStyle?.foreground || foregroundColor,
              fontStyle: tokenStyle?.fontStyle === 1 || tokenStyle?.fontStyle === 3 ? "italic" : "normal",
              fontWeight: tokenStyle?.fontStyle === 2 || tokenStyle?.fontStyle === 3 ? "700" : "400",
            }}
          >
            {text}
          </Text>
        );
      })}
    </Text>
  );
}

export type SourceLineRowProps = {
  foregroundColor: string;
  index: number;
  line?: SyntaxRenderLine;
  lineNumber?: number | string;
  lineNumberStyle?: StyleProp<TextStyle>;
  mutedColor: string;
  onLayout?: (event: LayoutChangeEvent) => void;
  rowStyle?: StyleProp<ViewStyle>;
  textStyle?: StyleProp<TextStyle>;
  tokenStyleById: SyntaxStyleMap;
};

export function SourceLineRow({
  foregroundColor,
  index,
  line,
  lineNumber = index + 1,
  lineNumberStyle,
  mutedColor,
  onLayout,
  rowStyle,
  textStyle,
  tokenStyleById,
}: SourceLineRowProps) {
  return (
    <View onLayout={onLayout} style={[styles.sourceLineRow, rowStyle]}>
      <Text selectable={false} style={[styles.lineNumber, { color: mutedColor }, lineNumberStyle]}>
        {lineNumber}
      </Text>
      <TokenizedText
        foregroundColor={foregroundColor}
        line={line}
        style={textStyle}
        tokenStyleById={tokenStyleById}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  lineNumber: {
    fontFamily: sourceViewerCodeFontFamily,
    fontSize: 12,
    lineHeight: sourceViewerRowHeight,
    paddingRight: 16,
    textAlign: "right",
    width: sourceViewerLineNumberWidth,
  },
  sourceLineRow: {
    flexDirection: "row",
    height: sourceViewerRowHeight,
    paddingHorizontal: 12,
  },
  sourceText: {
    flex: 1,
    fontFamily: sourceViewerCodeFontFamily,
    fontSize: 13,
    lineHeight: sourceViewerRowHeight,
    overflow: "hidden",
  },
});
