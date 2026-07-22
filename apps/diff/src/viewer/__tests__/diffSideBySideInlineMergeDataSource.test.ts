import type { DataSourceMutationBatch } from "@legendapp/list/react-native";
import type { DiffFileSummary } from "@legend-apps/diff-parser";
import {
  DiffSideBySideInlineMergeDataSource,
  type DiffSideBySideProjectionDataSource,
} from "../diffSideBySideInlineMergeDataSource";

class TestProjectionSource implements DiffSideBySideProjectionDataSource {
  private collapsed = false;
  private documentGeneration = 0;
  private listeners = new Set<(batch: DataSourceMutationBatch) => void>();
  private revision = 0;

  getLength() {
    return this.collapsed ? 4 : 8;
  }

  getItem(index: number) {
    return this.collapsed && index > 0 ? index + 4 : index;
  }

  getKey(index: number) {
    return String(this.getItem(index));
  }

  getRevision() {
    return this.revision;
  }

  getDocumentGeneration() {
    return this.documentGeneration;
  }

  getFileLocation(fileIndex: number) {
    return fileIndex === 0
      ? { collapsed: this.collapsed, listIndex: 0 }
      : { collapsed: false, listIndex: this.collapsed ? 1 : 5 };
  }

  subscribe(listener: (batch: DataSourceMutationBatch) => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setCollapsed(collapsed: boolean) {
    const previousLength = this.getLength();
    const previousRevision = this.revision;
    this.collapsed = collapsed;
    this.revision += 1;
    const batch: DataSourceMutationBatch = {
      previousRevision,
      revision: this.revision,
      previousLength,
      length: this.getLength(),
      operations: [{
        type: "splice",
        index: 1,
        deleteCount: collapsed ? 4 : 0,
        insertCount: collapsed ? 0 : 4,
      }],
    };
    this.listeners.forEach((listener) => listener(batch));
  }

  refreshSecondFile() {
    const previousRevision = this.revision;
    this.documentGeneration += 1;
    this.revision += 1;
    const batch: DataSourceMutationBatch = {
      previousRevision,
      revision: this.revision,
      previousLength: this.getLength(),
      length: this.getLength(),
      operations: [{ type: "splice", index: 5, deleteCount: 3, insertCount: 3 }],
    };
    this.listeners.forEach((listener) => listener(batch));
  }
}

const files = [
  { index: 0 },
  { index: 1 },
] as DiffFileSummary[];

describe("DiffSideBySideInlineMergeDataSource", () => {
  it("replaces a conflicted body without materializing the base rows", () => {
    const base = new TestProjectionSource();
    const source = new DiffSideBySideInlineMergeDataSource(base, files, new Map([[0, [-1, -2]]]));

    expect(source.getLength()).toBe(6);
    expect(Array.from({ length: source.getLength() }, (_, index) => source.getItem(index))).toEqual([
      0,
      -1,
      -2,
      5,
      6,
      7,
    ]);
  });

  it("publishes only the conflicted file body when collapse changes", () => {
    const base = new TestProjectionSource();
    const source = new DiffSideBySideInlineMergeDataSource(base, files, new Map([[0, [-1, -2]]]));
    const batches: DataSourceMutationBatch[] = [];
    source.subscribe((batch) => batches.push(batch));

    base.setCollapsed(true);

    expect(batches).toEqual([{
      previousRevision: 0,
      revision: 1,
      previousLength: 6,
      length: 4,
      operations: [{ type: "splice", index: 1, deleteCount: 2, insertCount: 0 }],
    }]);
    expect(Array.from({ length: source.getLength() }, (_, index) => source.getItem(index))).toEqual([0, 5, 6, 7]);
  });

  it("publishes a precise merge-row insertion", () => {
    const base = new TestProjectionSource();
    const source = new DiffSideBySideInlineMergeDataSource(base, files, new Map([[0, [-1, -2]]]));
    const batches: DataSourceMutationBatch[] = [];
    source.subscribe((batch) => batches.push(batch));

    source.setMergeItemIndexes(new Map([[0, [-1, -2, -3]]]));

    expect(batches[0]).toEqual({
      previousRevision: 0,
      revision: 1,
      previousLength: 6,
      length: 7,
      operations: [{ type: "splice", index: 3, deleteCount: 0, insertCount: 1 }],
    });
  });

  it("preserves a native document suffix refresh through the merge projection", () => {
    const base = new TestProjectionSource();
    const source = new DiffSideBySideInlineMergeDataSource(base, files, new Map([[0, [-1, -2]]]));
    const batches: DataSourceMutationBatch[] = [];
    source.subscribe((batch) => batches.push(batch));

    base.refreshSecondFile();

    expect(batches).toEqual([{
      previousRevision: 0,
      revision: 1,
      previousLength: 6,
      length: 6,
      operations: [{ type: "splice", index: 3, deleteCount: 3, insertCount: 3 }],
    }]);
  });
});
