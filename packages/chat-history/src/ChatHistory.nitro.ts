import type { HybridObject } from "react-native-nitro-modules";

export interface ChatSummary {
  id: string;
  provider: string;
  title: string;
  updatedAt: number;
  path: string;
}

export interface ChatRowMetadata {
  index: number;
  kind: string;
  markdownBlockId?: string;
  toolName?: string;
  toolStatus?: string;
  hasToolPreview: boolean;
  hasImagePlaceholder: boolean;
}

export interface ChatDocumentTiming {
  sourceBytes: number;
  recordCount: number;
  rowCount: number;
  mappedMs: number;
  scannedMs: number;
  normalizedMs: number;
  documentMs: number;
  totalMs: number;
}

export interface ChatDocument extends HybridObject<{ ios: "c++" }> {
  readonly documentId: string;
  readonly rowCount: number;
  readonly warningCount: number;
  getRowMetadata(index: number): ChatRowMetadata;
  getToolPreview(index: number, maximumBytes: number): string;
  getTiming(): ChatDocumentTiming;
  releaseNativeResources(): number;
}

export interface ChatHistory extends HybridObject<{ ios: "c++" }> {
  getRecentChats(limit: number): Promise<ChatSummary[]>;
  openChat(provider: string, path: string): Promise<ChatDocument>;
  cancelPendingOpen(): number;
}
