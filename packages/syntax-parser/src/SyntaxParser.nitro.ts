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
  mapFileMs: number;
  indexLinesMs: number;
  contextMs: number;
  initialLinesMs: number;
  tokenizeMs: number;
  totalMs: number;
}

export interface SyntaxHighlightResult {
  lines: SyntaxRenderLine[];
  styles: SyntaxStyle[];
  timing: SyntaxHighlightTiming;
}

export interface SyntaxFileLoadResult {
  document: SyntaxDocument;
  initialLines: SyntaxRenderLine[];
  styles: SyntaxStyle[];
  timing: SyntaxHighlightTiming;
}

export interface SyntaxDocument
  extends HybridObject<{
    ios: "c++";
  }> {
  readonly lineCount: number;
  readonly sourceSize: number;
  getPlainLines(start: number, count: number): SyntaxRenderLine[];
  getRenderLines(start: number, count: number): SyntaxRenderLine[];
  getTokenizedLineCount(): number;
  getStyles(): SyntaxStyle[];
  getTiming(): SyntaxHighlightTiming;
  startBackgroundTokenization(chunkLineCount: number): number;
  stopBackgroundTokenization(): number;
}

export interface SyntaxParser
  extends HybridObject<{
    ios: "c++";
  }> {
  highlightString(source: string, language: string, theme: string): Promise<SyntaxHighlightResult>;
  loadCodeFile(
    filePath: string,
    language: string,
    theme: string,
    initialLineCount: number,
  ): Promise<SyntaxFileLoadResult>;
}
