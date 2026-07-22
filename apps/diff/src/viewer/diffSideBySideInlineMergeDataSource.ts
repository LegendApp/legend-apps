import type { DataSourceMutationBatch, DataSourceOperation, LegendListDataSource } from "@legendapp/list/react-native";
import type { DiffFileSummary } from "@legend-apps/diff-parser";

type MutationListener = (batch: DataSourceMutationBatch) => void;

export type DiffSideBySideProjectionDataSource = LegendListDataSource<number | undefined> & {
  getDocumentGeneration(): number;
  getFileLocation(fileIndex: number): {
    collapsed: boolean;
    listIndex: number;
  };
};

type FileLayout = {
  baseCount: number;
  baseStart: number;
  fileIndex: number;
  mergeItemIndexes: readonly number[] | null;
  outputCount: number;
  outputStart: number;
};

function commonPrefixCount(left: readonly number[], right: readonly number[]) {
  const count = Math.min(left.length, right.length);
  let index = 0;
  while (index < count && left[index] === right[index]) {
    index += 1;
  }
  return index;
}

function commonSuffixCount(left: readonly number[], right: readonly number[], prefixCount: number) {
  const maximum = Math.min(left.length, right.length) - prefixCount;
  let count = 0;
  while (count < maximum && left[left.length - count - 1] === right[right.length - count - 1]) {
    count += 1;
  }
  return count;
}

export class DiffSideBySideInlineMergeDataSource implements LegendListDataSource<number | undefined> {
  private readonly listeners = new Set<MutationListener>();
  private readonly unsubscribeBase: () => void;
  private layouts: FileLayout[] = [];
  private documentGeneration: number;
  private mergeItemIndexesByFileIndex = new Map<number, readonly number[]>();
  private revision = 0;

  constructor(
    private readonly base: DiffSideBySideProjectionDataSource,
    private files: readonly DiffFileSummary[],
    mergeItemIndexesByFileIndex: ReadonlyMap<number, readonly number[]> = new Map(),
  ) {
    this.mergeItemIndexesByFileIndex = new Map(mergeItemIndexesByFileIndex);
    this.layouts = this.createLayouts();
    this.documentGeneration = base.getDocumentGeneration();
    this.unsubscribeBase = base.subscribe((batch) => {
      const previousLayouts = this.layouts;
      this.layouts = this.createLayouts();
      const nextDocumentGeneration = base.getDocumentGeneration();
      if (nextDocumentGeneration !== this.documentGeneration) {
        this.publishDocumentRefresh(previousLayouts, this.layouts, batch);
      } else {
        this.publishLayoutChanges(previousLayouts, this.layouts);
      }
      this.documentGeneration = nextDocumentGeneration;
    });
  }

  getLength() {
    const finalLayout = this.layouts[this.layouts.length - 1];
    return finalLayout ? finalLayout.outputStart + finalLayout.outputCount : 0;
  }

  getItem(index: number) {
    const layout = this.findLayout(index);
    if (!layout) {
      return undefined;
    }
    const localIndex = index - layout.outputStart;
    return layout.mergeItemIndexes && localIndex > 0
      ? layout.mergeItemIndexes[localIndex - 1]
      : this.base.getItem(layout.baseStart + localIndex);
  }

  getKey(index: number) {
    const item = this.getItem(index);
    return item !== undefined
      ? item < 0 ? `merge:${item}` : `side-by-side:${item}`
      : `side-by-side:missing:${index}`;
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

  setMergeItemIndexes(next: ReadonlyMap<number, readonly number[]>) {
    this.update(this.files, next);
  }

  update(
    files: readonly DiffFileSummary[],
    mergeItemIndexesByFileIndex: ReadonlyMap<number, readonly number[]>,
  ) {
    const previousLayouts = this.layouts;
    this.files = files;
    this.mergeItemIndexesByFileIndex = new Map(mergeItemIndexesByFileIndex);
    this.layouts = this.createLayouts();
    this.publishLayoutChanges(previousLayouts, this.layouts);
  }

  getBaseRange(start: number, count: number) {
    const safeStart = Math.max(0, Math.floor(start));
    const safeEnd = Math.min(this.getLength(), safeStart + Math.max(0, Math.ceil(count)));
    let baseStart = Number.POSITIVE_INFINITY;
    let baseEnd = Number.NEGATIVE_INFINITY;
    for (const layout of this.layouts) {
      const overlapStart = Math.max(safeStart, layout.outputStart);
      const overlapEnd = Math.min(safeEnd, layout.outputStart + layout.outputCount);
      if (overlapStart < overlapEnd) {
        if (layout.mergeItemIndexes) {
          baseStart = Math.min(baseStart, layout.baseStart);
          baseEnd = Math.max(baseEnd, layout.baseStart + 1);
        } else {
          baseStart = Math.min(baseStart, layout.baseStart + overlapStart - layout.outputStart);
          baseEnd = Math.max(baseEnd, layout.baseStart + overlapEnd - layout.outputStart);
        }
      }
    }
    return baseStart < baseEnd
      ? { start: baseStart, count: baseEnd - baseStart }
      : { start: 0, count: 0 };
  }

  dispose() {
    this.unsubscribeBase();
    this.listeners.clear();
  }

  private createLayouts() {
    const baseLocations = this.files.map((file) => this.base.getFileLocation(file.index));
    const layouts: FileLayout[] = [];
    let outputStart = 0;
    for (let fileOrdinal = 0; fileOrdinal < this.files.length; fileOrdinal += 1) {
      const file = this.files[fileOrdinal];
      const location = baseLocations[fileOrdinal];
      if (location.listIndex < 0) {
        continue;
      }
      let nextBaseStart = this.base.getLength();
      for (let nextOrdinal = fileOrdinal + 1; nextOrdinal < baseLocations.length; nextOrdinal += 1) {
        if (baseLocations[nextOrdinal].listIndex >= 0) {
          nextBaseStart = baseLocations[nextOrdinal].listIndex;
          break;
        }
      }
      const baseCount = Math.max(0, nextBaseStart - location.listIndex);
      const mergeItemIndexes = !location.collapsed && this.mergeItemIndexesByFileIndex.has(file.index)
        ? this.mergeItemIndexesByFileIndex.get(file.index) ?? []
        : null;
      const outputCount = mergeItemIndexes ? 1 + mergeItemIndexes.length : baseCount;
      layouts.push({
        baseCount,
        baseStart: location.listIndex,
        fileIndex: file.index,
        mergeItemIndexes,
        outputCount,
        outputStart,
      });
      outputStart += outputCount;
    }
    return layouts;
  }

  private findLayout(index: number) {
    let low = 0;
    let high = this.layouts.length;
    while (low < high) {
      const middle = low + Math.floor((high - low) / 2);
      const layout = this.layouts[middle];
      if (index < layout.outputStart) {
        high = middle;
      } else if (index >= layout.outputStart + layout.outputCount) {
        low = middle + 1;
      } else {
        return layout;
      }
    }
    return undefined;
  }

  private publishLayoutChanges(previous: readonly FileLayout[], next: readonly FileLayout[]) {
    const operations: DataSourceOperation[] = [];
    const sharedFileCount = Math.min(previous.length, next.length);
    let suffixOrdinal = previous.length !== next.length ? sharedFileCount : -1;
    for (let ordinal = 0; ordinal < sharedFileCount; ordinal += 1) {
      const previousLayout = previous[ordinal];
      const nextLayout = next[ordinal];
      if (previousLayout.fileIndex !== nextLayout.fileIndex) {
        suffixOrdinal = ordinal;
        break;
      }
      const previousMergeItems = previousLayout.mergeItemIndexes;
      const nextMergeItems = nextLayout.mergeItemIndexes;
      let prefixCount = 0;
      let suffixCount = 0;
      if (previousMergeItems && nextMergeItems) {
        const mergePrefix = commonPrefixCount(previousMergeItems, nextMergeItems);
        const mergeSuffix = commonSuffixCount(previousMergeItems, nextMergeItems, mergePrefix);
        prefixCount = 1 + mergePrefix;
        suffixCount = mergeSuffix;
      } else if (!previousMergeItems && !nextMergeItems) {
        prefixCount = Math.min(previousLayout.outputCount, nextLayout.outputCount);
      } else {
        prefixCount = Math.min(1, previousLayout.outputCount, nextLayout.outputCount);
      }
      const deleteCount = previousLayout.outputCount - prefixCount - suffixCount;
      const insertCount = nextLayout.outputCount - prefixCount - suffixCount;
      if (deleteCount > 0 || insertCount > 0) {
        operations.push({
          type: "splice",
          index: nextLayout.outputStart + prefixCount,
          deleteCount,
          insertCount,
        });
      }
    }

    if (suffixOrdinal >= 0) {
      const previousStart = previous[suffixOrdinal]?.outputStart ?? this.lengthOf(previous);
      const nextStart = next[suffixOrdinal]?.outputStart ?? this.lengthOf(next);
      operations.push({
        type: "splice",
        index: nextStart,
        deleteCount: this.lengthOf(previous) - previousStart,
        insertCount: this.lengthOf(next) - nextStart,
      });
    }

    this.publish(previous, next, operations);
  }

  private publishDocumentRefresh(
    previous: readonly FileLayout[],
    next: readonly FileLayout[],
    batch: DataSourceMutationBatch,
  ) {
    let baseStart = Math.min(batch.previousLength, batch.length);
    for (const operation of batch.operations) {
      if (operation.type === "reset") {
        baseStart = 0;
      } else if (operation.type === "move") {
        baseStart = Math.min(baseStart, operation.from, operation.to);
      } else {
        baseStart = Math.min(baseStart, operation.index);
      }
    }
    const outputStart = Math.min(
      this.outputBoundaryForBaseIndex(previous, baseStart),
      this.outputBoundaryForBaseIndex(next, baseStart),
    );
    this.publish(previous, next, [{
      type: "splice",
      index: outputStart,
      deleteCount: this.lengthOf(previous) - outputStart,
      insertCount: this.lengthOf(next) - outputStart,
    }]);
  }

  private outputBoundaryForBaseIndex(layouts: readonly FileLayout[], baseIndex: number) {
    for (const layout of layouts) {
      if (baseIndex <= layout.baseStart) {
        return layout.outputStart;
      }
      if (baseIndex < layout.baseStart + layout.baseCount) {
        return layout.mergeItemIndexes
          ? layout.outputStart + layout.outputCount
          : layout.outputStart + baseIndex - layout.baseStart;
      }
    }
    return this.lengthOf(layouts);
  }

  private publish(
    previous: readonly FileLayout[],
    next: readonly FileLayout[],
    operations: DataSourceOperation[],
  ) {
    if (operations.length === 0) {
      return;
    }
    const previousRevision = this.revision;
    this.revision += 1;
    const batch: DataSourceMutationBatch = {
      previousRevision,
      revision: this.revision,
      previousLength: this.lengthOf(previous),
      length: this.lengthOf(next),
      operations,
    };
    this.listeners.forEach((listener) => listener(batch));
  }

  private lengthOf(layouts: readonly FileLayout[]) {
    const finalLayout = layouts[layouts.length - 1];
    return finalLayout ? finalLayout.outputStart + finalLayout.outputCount : 0;
  }
}
