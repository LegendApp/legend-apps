import type { HybridObject } from "react-native-nitro-modules";

export interface SyntaxTokenRun {
  startColumn: number;
  length: number;
  styleId: number;
}

export interface SyntaxStyle {
  id: number;
  foreground: string;
  fontStyle: number;
}

export interface SyntaxRenderLine {
  index: number;
  text: string;
  tokens: SyntaxTokenRun[];
}

export interface SyntaxHighlightTiming {
  lineCount: number;
  tokenCount: number;
  colorCount: number;
  tokenizeMs: number;
}

export interface SyntaxHighlightResult {
  lines: SyntaxRenderLine[];
  styles: SyntaxStyle[];
  timing: SyntaxHighlightTiming;
}

export interface SyntaxParser
  extends HybridObject<{
    ios: "c++";
  }> {
  highlightString(source: string, language: string, theme: string): Promise<SyntaxHighlightResult>;
}
