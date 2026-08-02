import type { ChatDocument } from "@legend-apps/chat-history";
import type { DataSourceMutationBatch, LegendListDataSource } from "@legendapp/list/react-native";

type MutationListener = (batch: DataSourceMutationBatch) => void;

export class TranscriptDataSource implements LegendListDataSource<number> {
  constructor(private readonly document: ChatDocument) {}

  getLength() {
    return this.document.rowCount;
  }

  getItem(index: number) {
    return index < this.document.rowCount ? index : undefined;
  }

  getKey(index: number) {
    return `${this.document.documentId}:${index}`;
  }

  getRevision() {
    return 0;
  }

  subscribe(_listener: MutationListener) {
    return () => {};
  }
}
