import type { DataSourceMutationBatch, DataSourceOperation, LegendListDataSource } from "@legendapp/list/react-native";

export type SourceLine = { id: string };
export type SourceEdit = {
  startLine: number; removedLineCount: number; lines: SourceLine[];
  revision: number; lineCount: number; offset: number; removedLength: number; insertedText: string;
};
export type SourceAppend = {
  startLine: number; retainedId: string; firstId: number; count: number;
  revision: number; lineCount: number;
};
type Node = { firstId: number; length: number; rank: number; count: number; left?: Node; right?: Node };
const size = (node?: Node): number => node?.count ?? 0;
function update(node: Node) { node.count = node.length + size(node.left) + size(node.right); return node; }
function merge(left?: Node, right?: Node): Node | undefined {
  if (!left) return right;
  if (!right) return left;
  if (left.rank > right.rank) { left.right = merge(left.right, right); return update(left); }
  right.left = merge(left, right.left); return update(right);
}

// Compact ID runs, not text and not one JS object per file line. Opening a file
// is O(1) in JS. Only requested rows acquire objects; edits split affected runs.
export class SourceLineDataSource implements LegendListDataSource<SourceLine> {
  private root?: Node;
  private revision = 0;
  // Layout-only list transactions must not consume native edit revisions.
  private documentRevision = 0;
  private random = 0x12345678;
  private cache = new Map<string, SourceLine>();
  private listeners = new Set<(batch: DataSourceMutationBatch) => void>();

  constructor(count: number, firstId = 1) {
    if (!Number.isSafeInteger(count) || count < 0 || !Number.isSafeInteger(firstId) || firstId < 1
      || !Number.isSafeInteger(firstId + count)) throw new Error("Invalid initial source rows");
    if (count) this.root = this.node(firstId, count);
  }
  private node(firstId: number, length: number): Node {
    this.random ^= this.random << 13; this.random ^= this.random >>> 17; this.random ^= this.random << 5;
    return { firstId, length, count: length, rank: this.random >>> 0 };
  }
  private split(node: Node | undefined, at: number): [Node | undefined, Node | undefined] {
    if (!node) return [undefined, undefined];
    const leftSize = size(node.left);
    if (at < leftSize) {
      const [left, rest] = this.split(node.left, at);
      node.left = rest; return [left, update(node)];
    }
    if (at > leftSize + node.length) {
      const [rest, right] = this.split(node.right, at - leftSize - node.length);
      node.right = rest; return [update(node), right];
    }
    const cut = at - leftSize;
    const left = cut ? merge(node.left, this.node(node.firstId, cut)) : node.left;
    const right = cut < node.length ? merge(this.node(node.firstId + cut, node.length - cut), node.right) : node.right;
    return [left, right];
  }
  getLength() { return size(this.root); }
  getRevision() { return this.revision; }
  getDocumentRevision() { return this.documentRevision; }
  invalidateHeights(indices: number[]) {
    const sorted = [...new Set(indices)].sort((a, b) => a - b);
    const operations: DataSourceOperation[] = [];
    for (let i = 0; i < sorted.length;) {
      const start = sorted[i];
      let end = i + 1;
      while (end < sorted.length && sorted[end] === sorted[end - 1] + 1) end++;
      operations.push({ type: "update", index: start, count: end - i, layout: "invalidate" });
      i = end;
    }
    if (operations.length) this.publish(this.getLength(), this.revision + 1, operations);
  }
  getKey(index: number): string {
    if (!Number.isInteger(index) || index < 0 || index >= this.getLength()) throw new RangeError(`Missing source row ${index}`);
    let node = this.root;
    while (node) {
      const left = size(node.left);
      if (index < left) node = node.left;
      else if (index < left + node.length) return String(node.firstId + index - left);
      else { index -= left + node.length; node = node.right; }
    }
    throw new Error("Invalid source row index");
  }
  getItem(index: number) {
    if (index < 0 || index >= this.getLength()) return undefined;
    const id = this.getKey(index);
    let value = this.cache.get(id);
    if (!value) {
      if (this.cache.size >= 2048) this.cache.delete(this.cache.keys().next().value!);
      value = { id }; this.cache.set(id, value);
    }
    return value;
  }
  subscribe(listener: (batch: DataSourceMutationBatch) => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  private publish(previousLength: number, revision: number, operations: DataSourceOperation[]) {
    const previousRevision = this.revision;
    this.revision = revision;
    const batch = { previousLength, length: this.getLength(), previousRevision, revision, operations };
    this.listeners.forEach((listener) => listener(batch));
  }
  append(change: SourceAppend) {
    const previousLength = this.getLength();
    if (change.revision !== this.documentRevision + 1 || change.startLine !== previousLength - 1
      || change.retainedId !== this.getKey(change.startLine) || !Number.isSafeInteger(change.count) || change.count < 0
      || !Number.isSafeInteger(change.firstId) || change.firstId < 1
      || !Number.isSafeInteger(change.firstId + change.count)
      || previousLength + change.count !== change.lineCount) throw new Error("Out-of-sequence native source append");
    if (change.count) this.root = merge(this.root, this.node(change.firstId, change.count));
    this.documentRevision = change.revision;
    this.publish(previousLength, this.revision + 1, [
      { type: "update", index: change.startLine, count: 1, layout: "preserve" },
      ...(change.count ? [{ type: "splice" as const, index: previousLength, deleteCount: 0, insertCount: change.count }] : []),
    ]);
  }
  apply(change: SourceEdit) {
    const previousLength = this.getLength();
    if (change.revision !== this.documentRevision + 1 || !Number.isSafeInteger(change.startLine) || !Number.isSafeInteger(change.removedLineCount)
      || change.startLine < 0 || change.removedLineCount < 0
      || change.startLine + change.removedLineCount > previousLength
      || previousLength - change.removedLineCount + change.lines.length !== change.lineCount
      || change.lines.some(({ id }) => !Number.isSafeInteger(Number(id)) || Number(id) < 1)) {
      throw new Error("Out-of-sequence native source edit; refusing to corrupt the row index.");
    }
    let inserted: Node | undefined;
    for (let i = 0; i < change.lines.length;) {
      const first = Number(change.lines[i].id);
      let end = i + 1;
      while (end < change.lines.length && Number(change.lines[end].id) === first + end - i) end++;
      inserted = merge(inserted, this.node(first, end - i));
      i = end;
    }
    let prefix = 0;
    while (prefix < change.removedLineCount && prefix < change.lines.length
      && this.getKey(change.startLine + prefix) === change.lines[prefix].id) prefix++;
    let suffix = 0;
    while (suffix + prefix < change.removedLineCount && suffix + prefix < change.lines.length
      && this.getKey(change.startLine + change.removedLineCount - suffix - 1) === change.lines[change.lines.length - suffix - 1].id) suffix++;
    const operations: DataSourceOperation[] = [];
    if (prefix) operations.push({ type: "update", index: change.startLine, count: prefix, layout: "preserve" });
    const deleteCount = change.removedLineCount - prefix - suffix;
    const insertCount = change.lines.length - prefix - suffix;
    if (deleteCount || insertCount) operations.push({ type: "splice", index: change.startLine + prefix, deleteCount, insertCount });
    if (suffix) operations.push({ type: "update", index: change.startLine + change.lines.length - suffix, count: suffix, layout: "preserve" });
    const [before, rest] = this.split(this.root, change.startLine);
    const [, after] = this.split(rest, change.removedLineCount);
    this.root = merge(merge(before, inserted), after);
    this.documentRevision = change.revision;
    this.publish(previousLength, this.revision + 1, operations);
  }
}
