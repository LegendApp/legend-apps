import type { ChatDocument } from "@legend-apps/chat-history";
import type { DataSourceMutationBatch } from "@legendapp/list/react-native";
import { TranscriptDataSource } from "../TranscriptDataSource";

function createDocument(rowCount = 2) {
  return {
    documentId: "document-1",
    rowCount,
  } as ChatDocument;
}

describe("TranscriptDataSource", () => {
  it("appends demo messages after native transcript rows", () => {
    const dataSource = new TranscriptDataSource(createDocument());
    const batches: DataSourceMutationBatch[] = [];
    dataSource.subscribe((batch) => batches.push(batch));

    const index = dataSource.appendDemoMessage({
      id: "demo-user-1",
      role: "user",
      text: "Hello",
    });

    expect(index).toBe(2);
    expect(dataSource.getLength()).toBe(3);
    expect(dataSource.getItem(2)).toEqual({
      id: "demo-user-1",
      role: "user",
      text: "Hello",
    });
    expect(dataSource.getKey(2)).toBe("demo-user-1");
    expect(batches).toEqual([{
      length: 3,
      operations: [{
        type: "splice",
        index: 2,
        deleteCount: 0,
        insertCount: 1,
      }],
      previousLength: 2,
      previousRevision: 0,
      revision: 1,
    }]);
  });

  it("preserves the measured layout while a streamed message updates", () => {
    const dataSource = new TranscriptDataSource(createDocument(1));
    const batches: DataSourceMutationBatch[] = [];
    dataSource.appendDemoMessage({
      id: "demo-assistant-1",
      role: "assistant",
      text: "This",
    });
    dataSource.subscribe((batch) => batches.push(batch));

    dataSource.updateDemoMessage("demo-assistant-1", "This is streaming");

    expect(dataSource.getItem(1)).toEqual({
      id: "demo-assistant-1",
      role: "assistant",
      text: "This is streaming",
    });
    expect(batches).toEqual([{
      length: 2,
      operations: [{
        type: "update",
        index: 1,
        count: 1,
        layout: "preserve",
      }],
      previousLength: 2,
      previousRevision: 1,
      revision: 2,
    }]);
  });
});
