import type { DataSourceMutationBatch } from "@legendapp/list/react-native";
import { MarkdownBlockDataSource } from "../MarkdownBlockDataSource";
import type {
  MarkdownBlockSnapshot,
  MarkdownDocumentAdapter,
  MarkdownDocumentSnapshot,
  MarkdownTransactionResult,
} from "../types";

function block(id: string, index: number, markdown = id): MarkdownBlockSnapshot {
  return {
    id,
    index,
    type: "paragraph",
    depth: 0,
    headingLevel: 0,
    markdown,
    sourceStartByte: index * 10,
    sourceEndByte: index * 10 + markdown.length,
    contentStartByte: index * 10,
    contentEndByte: index * 10 + markdown.length,
    textRevision: 0,
  };
}

function snapshot(blocks: MarkdownBlockSnapshot[]): MarkdownDocumentSnapshot {
  return {
    blockCount: blocks.length,
    documentId: "d1",
    filename: "test.md",
    initialBlocks: blocks,
    sourceSize: 100,
    timing: { documentMs: 0, parseMs: 0, readMs: 0 },
  };
}

function result(
  startBlockIndex: number,
  deleteCount: number,
  changedBlocks: MarkdownBlockSnapshot[],
  retiredBlockIds: string[] = [],
  retainsFirstChangedBlock?: boolean,
): MarkdownTransactionResult {
  return {
    changedBlocks,
    changedRange: {
      blockIds: changedBlocks.map((changedBlock) => changedBlock.id),
      deleteCount,
      retainsFirstChangedBlock,
      startBlockIndex,
    },
    retiredBlockIds,
    revision: 1,
    sourceLength: 100,
  };
}

describe("MarkdownBlockDataSource", () => {
  it("preserves the original row while native indexed storage inserts the split suffix", () => {
    const nativeBlockIds = ["a", "b", "c"];
    const adapter = {
      getBlockIdAtIndexSync: (_documentId: string, index: number) => nativeBlockIds[index],
      getBlockIndexForIdSync: (_documentId: string, blockId: string) => nativeBlockIds.indexOf(blockId),
    } as MarkdownDocumentAdapter;
    const dataSource = new MarkdownBlockDataSource(
      adapter,
      "d1",
      snapshot(nativeBlockIds.map((blockId, index) => block(blockId, index))),
    );
    const batches: DataSourceMutationBatch[] = [];
    dataSource.subscribe((batch) => batches.push(batch));

    nativeBlockIds.splice(1, 1, "b", "inserted");
    dataSource.applyTransactionResult(result(1, 1, [block("b", 1), block("inserted", 2)]));

    expect(dataSource.getLength()).toBe(4);
    expect(dataSource.getItem(3)).toBe("c");
    expect(dataSource.getIndexForBlockId("c")).toBe(3);
    expect(batches).toEqual([{
      length: 4,
      operations: [
        { type: "update", index: 1, count: 1, layout: "invalidate" },
        { type: "splice", index: 2, deleteCount: 0, insertCount: 1 },
      ],
      previousLength: 3,
      previousRevision: 0,
      revision: 1,
    }]);
  });

  it("publishes a layout-invalidating update for an unchanged block identity", () => {
    const blocks = [block("a", 0)];
    const adapter = {} as MarkdownDocumentAdapter;
    const dataSource = new MarkdownBlockDataSource(adapter, "d1", snapshot(blocks));
    const batches: DataSourceMutationBatch[] = [];
    dataSource.subscribe((batch) => batches.push(batch));

    dataSource.applyTransactionResult(result(0, 1, [block("a", 0, "updated")]));

    expect(dataSource.getItem(0)).toBe("a");
    expect(batches[0]?.operations).toEqual([{
      type: "update",
      index: 0,
      count: 1,
      layout: "invalidate",
    }]);
  });

  it("retains the previous row while deleting the merged following row", () => {
    const blocks = [block("a", 0), block("b", 1), block("c", 2)];
    const adapter = {} as MarkdownDocumentAdapter;
    const dataSource = new MarkdownBlockDataSource(adapter, "d1", snapshot(blocks));
    const batches: DataSourceMutationBatch[] = [];
    dataSource.subscribe((batch) => batches.push(batch));

    dataSource.applyTransactionResult(result(0, 2, [block("a", 0, "ab")], ["b"]));

    expect(dataSource.getLength()).toBe(2);
    expect(dataSource.getItem(0)).toBe("a");
    expect(dataSource.getItem(1)).toBe("c");
    expect(batches[0]?.operations).toEqual([
      { type: "update", index: 0, count: 1, layout: "invalidate" },
      { type: "splice", index: 1, deleteCount: 1, insertCount: 0 },
    ]);
  });

  it("uses explicit native retention metadata for reordered rows", () => {
    const blocks = [block("a", 0), block("b", 1), block("c", 2)];
    const adapter = {} as MarkdownDocumentAdapter;
    const dataSource = new MarkdownBlockDataSource(adapter, "d1", snapshot(blocks));
    const batches: DataSourceMutationBatch[] = [];
    dataSource.subscribe((batch) => batches.push(batch));

    dataSource.applyTransactionResult(result(
      0,
      2,
      [block("b", 0), block("a", 1)],
      [],
      false,
    ));

    expect(batches[0]?.operations).toEqual([{
      type: "splice",
      index: 0,
      deleteCount: 2,
      insertCount: 2,
    }]);
  });
});
