import type { HybridObject } from "react-native-nitro-modules";

export interface MarkdownBlockSnapshot {
  id: string;
  index: number;
  type: string;
  depth: number;
  text: string;
  markdown: string;
}

export interface MarkdownDocumentTiming {
  sourceBytes: number;
  readMs: number;
  mdParseMs: number;
  blockRangeMs: number;
  parseMs: number;
  documentMs: number;
}

export interface MarkdownDocument
  extends HybridObject<{
    ios: "c++";
  }> {
  readonly blockCount: number;
  readonly sourceSize: number;
  getBlock(index: number, includeText: boolean): MarkdownBlockSnapshot;
  getBlocks(start: number, count: number, includeText: boolean): MarkdownBlockSnapshot[];
  getBlockMarkdown(index: number): string;
  getTiming(): MarkdownDocumentTiming;
}

export interface MarkdownParser
  extends HybridObject<{
    ios: "c++";
  }> {
  parseMarkdown(markdown: string, flags: number): MarkdownDocument;
  parseMarkdownFile(filePath: string, flags: number): Promise<MarkdownDocument>;
}
