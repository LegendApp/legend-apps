import type {
  DiffDocument,
  DiffSideBySideProjection,
  DiffSideBySideProjectionCommit,
  DiffSideBySideProjectionItem,
  DiffSideBySideProjectionLocation,
  DiffSideBySideRenderRow,
} from "@legend-apps/diff-parser";
import type { DataSourceMutationBatch, LegendListDataSource } from "@legendapp/list/react-native";

type MutationListener = (batch: DataSourceMutationBatch) => void;

function toMutationBatch(commit: DiffSideBySideProjectionCommit): DataSourceMutationBatch {
  return {
    previousRevision: commit.previousRevision,
    revision: commit.revision,
    previousLength: commit.previousLength,
    length: commit.length,
    operations: commit.splices.map((splice) => ({
      type: "splice" as const,
      index: splice.index,
      deleteCount: splice.deleteCount,
      insertCount: splice.insertCount,
    })),
  };
}

export class DiffSideBySideDataSource implements LegendListDataSource<number | undefined> {
  private readonly listeners = new Set<MutationListener>();
  private readonly projection: DiffSideBySideProjection;

  constructor(document: DiffDocument, collapsedFileIndexes: readonly number[]) {
    this.projection = document.createSideBySideProjection([...collapsedFileIndexes]);
  }

  getLength() {
    return this.projection.rowCount;
  }

  getItem(index: number) {
    const itemId = this.projection.getItemId(index);
    return itemId >= 0 ? itemId : undefined;
  }

  getKey(index: number) {
    return `side-by-side:${this.projection.getItemId(index)}`;
  }

  getRevision() {
    return this.projection.revision;
  }

  subscribe(listener: MutationListener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  setFileCollapsed(fileIndex: number, collapsed: boolean) {
    return this.publish(this.projection.setFileCollapsed(fileIndex, collapsed));
  }

  refresh() {
    return this.publish(this.projection.refresh());
  }

  isFileCollapsed(fileIndex: number) {
    return this.projection.isFileCollapsed(fileIndex);
  }

  getProjectionId() {
    return this.projection.projectionId;
  }

  getDocumentGeneration() {
    return this.projection.documentGeneration;
  }

  getItemMetadata(itemId: number): DiffSideBySideProjectionItem {
    return this.projection.getItem(itemId);
  }

  getFileLocation(fileIndex: number): DiffSideBySideProjectionLocation {
    return this.projection.getFileLocation(fileIndex);
  }

  getItemLocation(itemId: number): DiffSideBySideProjectionLocation {
    return this.projection.getItemLocation(itemId);
  }

  getSourceLocation(sourceRowIndex: number): DiffSideBySideProjectionLocation {
    return this.projection.getSourceLocation(sourceRowIndex);
  }

  getHunkLocations() {
    return this.projection.getHunkLocations();
  }

  getPlainRow(itemId: number, listIndex: number): DiffSideBySideRenderRow {
    return this.projection.getPlainRowForItem(itemId, listIndex);
  }

  getRow(itemId: number, listIndex: number): DiffSideBySideRenderRow {
    return this.projection.getRowForItem(itemId, listIndex);
  }

  requestTokenizedRows(start: number, count: number, reason: string) {
    return this.projection.requestTokenizedRows(start, count, reason);
  }

  dispose() {
    this.listeners.clear();
    this.projection.releaseNativeResources();
  }

  private publish(commit: DiffSideBySideProjectionCommit) {
    if (commit.changed) {
      const batch = toMutationBatch(commit);
      this.listeners.forEach((listener) => listener(batch));
    }
    return commit;
  }
}
