import type { ChatDocument } from "@legend-apps/chat-history";
import type {
  DataSourceMutationBatch,
  DataSourceOperation,
  LegendListDataSource,
} from "@legendapp/list/react-native";

type MutationListener = (batch: DataSourceMutationBatch) => void;

export type DemoTranscriptMessage = {
  id: string;
  role: "assistant" | "user";
  text: string;
};

export type TranscriptListItem = DemoTranscriptMessage | number;

export function isDemoTranscriptMessage(
  item: TranscriptListItem,
): item is DemoTranscriptMessage {
  return typeof item !== "number";
}

export class TranscriptDataSource implements LegendListDataSource<TranscriptListItem> {
  private readonly demoMessages: DemoTranscriptMessage[] = [];
  private readonly listeners = new Set<MutationListener>();
  private revision = 0;

  constructor(private readonly document: ChatDocument) {}

  getLength() {
    return this.document.rowCount + this.demoMessages.length;
  }

  getItem(index: number) {
    let item: TranscriptListItem | undefined;
    if (index >= 0 && index < this.document.rowCount) {
      item = index;
    } else {
      item = this.demoMessages[index - this.document.rowCount];
    }
    return item;
  }

  getKey(index: number) {
    const demoMessage = this.demoMessages[index - this.document.rowCount];
    return demoMessage?.id ?? `${this.document.documentId}:${index}`;
  }

  getRevision() {
    return this.revision;
  }

  subscribe(listener: MutationListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  appendDemoMessage(message: DemoTranscriptMessage) {
    const index = this.getLength();
    const previousLength = index;
    this.demoMessages.push(message);
    this.publish(previousLength, [{
      type: "splice",
      index,
      deleteCount: 0,
      insertCount: 1,
    }]);
    return index;
  }

  updateDemoMessage(id: string, text: string) {
    const demoIndex = this.demoMessages.findIndex((message) => message.id === id);
    if (demoIndex >= 0) {
      const message = this.demoMessages[demoIndex];
      if (message.text !== text) {
        this.demoMessages[demoIndex] = { ...message, text };
        this.publish(this.getLength(), [{
          type: "update",
          index: this.document.rowCount + demoIndex,
          count: 1,
          layout: "preserve",
        }]);
      }
    }
  }

  private publish(previousLength: number, operations: DataSourceOperation[]) {
    const previousRevision = this.revision;
    this.revision += 1;
    const batch: DataSourceMutationBatch = {
      length: this.getLength(),
      operations,
      previousLength,
      previousRevision,
      revision: this.revision,
    };
    this.listeners.forEach((listener) => listener(batch));
  }
}
