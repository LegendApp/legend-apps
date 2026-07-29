import type { DataSourceMutationBatch } from "@legendapp/list/react-native";
import { DiffUnifiedInlineMergeDataSource } from "../diffUnifiedInlineMergeDataSource";

describe("DiffUnifiedInlineMergeDataSource", () => {
  it("exposes stable item keys", () => {
    const source = new DiffUnifiedInlineMergeDataSource([10, -1, undefined]);

    expect(source.getLength()).toBe(3);
    expect(source.getItem(1)).toBe(-1);
    expect(source.getKey(0)).toBe("unified:10");
    expect(source.getKey(1)).toBe("unified:-1");
    expect(source.getKey(2)).toBe("unified:missing:2");
  });

  it("publishes the changed middle as one splice", () => {
    const source = new DiffUnifiedInlineMergeDataSource([0, 1, 2, 3, 4]);
    const batches: DataSourceMutationBatch[] = [];
    source.subscribe((batch) => batches.push(batch));

    source.update([0, 1, -1, -2, 4]);

    expect(batches).toEqual([{
      previousRevision: 0,
      revision: 1,
      previousLength: 5,
      length: 5,
      operations: [{
        type: "splice",
        index: 2,
        deleteCount: 2,
        insertCount: 2,
      }],
    }]);
    expect(Array.from({ length: source.getLength() }, (_, index) => source.getItem(index))).toEqual([
      0,
      1,
      -1,
      -2,
      4,
    ]);
  });

  it("does not publish when the projection is unchanged", () => {
    const source = new DiffUnifiedInlineMergeDataSource([0, 1, 2]);
    const batches: DataSourceMutationBatch[] = [];
    source.subscribe((batch) => batches.push(batch));

    source.update([0, 1, 2]);

    expect(source.getRevision()).toBe(0);
    expect(batches).toEqual([]);
  });
});
