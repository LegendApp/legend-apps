import type { HybridObject } from "react-native-nitro-modules";

export interface MarkdownDocumentTiming {
  sourceBytes: number;
  readMs: number;
  mdParseMs: number;
  blockRangeMs: number;
  parseMs: number;
  documentMs: number;
}

export interface MarkdownRenderBlock {
  id: string;
  index: number;
  type: string;
  depth: number;
  markdown: string;
  sourceStartByte: number;
  sourceEndByte: number;
  contentStartByte: number;
  contentEndByte: number;
  textRevision: number;
}

export interface MarkdownFileLoadResult {
  document: MarkdownDocument;
  initialBlocks: MarkdownRenderBlock[];
}

export interface MarkdownDocument
  extends HybridObject<{
    ios: "c++";
  }> {
  readonly blockCount: number;
  readonly sourceSize: number;
  getRenderBlocks(start: number, count: number): MarkdownRenderBlock[];
  getTiming(): MarkdownDocumentTiming;
}

export interface MarkdownParser
  extends HybridObject<{
    ios: "c++";
  }> {
  loadMarkdownFile(filePath: string, initialBlockCount: number): Promise<MarkdownFileLoadResult>;
}
