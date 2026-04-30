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

export interface MarkdownFileWindowResult {
  document: MarkdownDocument;
  blocks: MarkdownBlockSnapshot[];
}

export interface MarkdownRenderBlock {
  index: number;
  type: string;
  depth: number;
  markdown: string;
}

export interface MarkdownFileRenderWindowResult {
  document: MarkdownDocument;
  blocks: MarkdownRenderBlock[];
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
  scanMarkdown(markdown: string): MarkdownDocument;
  scanMarkdownFile(filePath: string): Promise<MarkdownDocument>;
  scanMarkdownFileWindow(filePath: string, count: number): Promise<MarkdownFileWindowResult>;
  scanMarkdownFileRenderWindow(filePath: string, count: number): Promise<MarkdownFileRenderWindowResult>;
  parseMarkdown(markdown: string, flags: number): MarkdownDocument;
  parseMarkdownFile(filePath: string, flags: number): Promise<MarkdownDocument>;
}
