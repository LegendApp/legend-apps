import type {
  DataSourceMutationBatch,
  LegendListDataSource,
} from "@legendapp/list/react-native";

type MutationListener = (batch: DataSourceMutationBatch) => void;
type UnifiedItemIndex = number | undefined;

function commonPrefixCount(
  left: readonly UnifiedItemIndex[],
  right: readonly UnifiedItemIndex[],
) {
  const count = Math.min(left.length, right.length);
  let index = 0;
  while (index < count && left[index] === right[index]) {
    index += 1;
  }
  return index;
}

function commonSuffixCount(
  left: readonly UnifiedItemIndex[],
  right: readonly UnifiedItemIndex[],
  prefixCount: number,
) {
  const maximum = Math.min(left.length, right.length) - prefixCount;
  let count = 0;
  while (count < maximum && left[left.length - count - 1] === right[right.length - count - 1]) {
    count += 1;
  }
  return count;
}

export class DiffUnifiedInlineMergeDataSource implements LegendListDataSource<UnifiedItemIndex> {
  private readonly listeners = new Set<MutationListener>();
  private itemIndexes: readonly UnifiedItemIndex[];
  private revision = 0;

  constructor(itemIndexes: readonly UnifiedItemIndex[]) {
    this.itemIndexes = itemIndexes;
  }

  getLength() {
    return this.itemIndexes.length;
  }

  getItem(index: number) {
    return this.itemIndexes[index];
  }

  getKey(index: number) {
    const itemIndex = this.itemIndexes[index];
    return itemIndex === undefined
      ? `unified:missing:${index}`
      : `unified:${itemIndex}`;
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

  update(itemIndexes: readonly UnifiedItemIndex[]) {
    const previousItemIndexes = this.itemIndexes;
    const prefixCount = commonPrefixCount(previousItemIndexes, itemIndexes);
    const suffixCount = commonSuffixCount(previousItemIndexes, itemIndexes, prefixCount);
    const deleteCount = previousItemIndexes.length - prefixCount - suffixCount;
    const insertCount = itemIndexes.length - prefixCount - suffixCount;

    this.itemIndexes = itemIndexes;
    if (deleteCount > 0 || insertCount > 0) {
      const previousRevision = this.revision;
      this.revision += 1;
      const batch: DataSourceMutationBatch = {
        previousRevision,
        revision: this.revision,
        previousLength: previousItemIndexes.length,
        length: itemIndexes.length,
        operations: [{
          type: "splice",
          index: prefixCount,
          deleteCount,
          insertCount,
        }],
      };
      this.listeners.forEach((listener) => listener(batch));
    }
  }
}
