import type { HybridObject } from "react-native-nitro-modules";

export interface MarkdownBlockSnapshot {
  id: string;
  index: number;
  type: string;
  depth: number;
  text: string;
  markdown: string;
}

export interface MarkdownDocument
  extends HybridObject<{
    ios: "c++";
  }> {
  readonly blockCount: number;
  getBlocks(start: number, count: number): MarkdownBlockSnapshot[];
}

export interface MarkdownParser
  extends HybridObject<{
    ios: "c++";
  }> {
  parseMarkdown(markdown: string, flags: number): MarkdownDocument;
  parseMarkdownFile(filePath: string, flags: number): Promise<MarkdownDocument>;
}
