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
  headingLevel: number;
  markdown: string;
  sourceStartByte: number;
  sourceEndByte: number;
  contentStartByte: number;
  contentEndByte: number;
  textRevision: number;
}

export interface MarkdownTransaction {
  type: string;
  blockId: string;
  markdown?: string;
  beforeMarkdown?: string;
  afterMarkdown?: string;
}

export interface MarkdownChangedRange {
  startBlockIndex: number;
  deleteCount: number;
  blockIds: string[];
}

export interface MarkdownTransactionResult {
  revision: number;
  sourceLength: number;
  changedRange: MarkdownChangedRange;
  changedBlocks: MarkdownRenderBlock[];
  retiredBlockIds: string[];
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
  getBlockIds(start: number, count: number): string[];
  getBlockKey(index: number): string;
  getIndexForBlockId(blockId: string): number;
  getRenderBlockById(blockId: string): MarkdownRenderBlock;
  getRenderBlocks(start: number, count: number): MarkdownRenderBlock[];
  getTiming(): MarkdownDocumentTiming;
  applyTransaction(transaction: MarkdownTransaction): MarkdownTransactionResult;
  save(): void;
  saveAs(filePath: string): void;
}

export interface MarkdownParser
  extends HybridObject<{
    ios: "c++";
  }> {
  createMarkdownDocument(markdown: string, initialBlockCount: number): Promise<MarkdownFileLoadResult>;
  loadMarkdownFile(filePath: string, initialBlockCount: number): Promise<MarkdownFileLoadResult>;
}
