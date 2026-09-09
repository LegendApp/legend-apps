import type { DataSourceMutationBatch, DataSourceOperation, LegendListDataSource } from "@legendapp/list/react-native";

export type SourceLine = { id: string; text: string; ending: string };
export type SourceEdit = {
  startLine: number;
  removedLineCount: number;
  lines: SourceLine[];
  revision: number;
  lineCount: number;
  offset: number;
  removedLength: number;
  insertedText: string;
};
type Node = { value: SourceLine; rank: number; count: number; left?: Node; right?: Node };
const size = (node?: Node): number => node?.count ?? 0;
function update(node: Node) { node.count = 1 + size(node.left) + size(node.right); return node; }
function merge(left?: Node, right?: Node): Node | undefined {
  if (!left) return right;
  if (!right) return left;
  if (left.rank > right.rank) { left.right = merge(left.right, right); return update(left); }
  right.left = merge(left, right.left); return update(right);
}
function split(node: Node | undefined, at: number): [Node | undefined, Node | undefined] {
  if (!node) return [undefined, undefined];
  if (at <= size(node.left)) {
    const [left, rest] = split(node.left, at);
    node.left = rest; return [left, update(node)];
  }
  const [rest, right] = split(node.right, at - size(node.left) - 1);
  node.right = rest; return [update(node), right];
}

// A lightweight mirror of native row snapshots, not a second editing engine.
// Native transactions supply the text, stable IDs, and revision. Splicing this
// index does not allocate/renumber a 100k-element array on each newline.
export class SourceLineDataSource implements LegendListDataSource<SourceLine> {
  private root?: Node;
  private revision = 0;
  private random = 0x12345678;
  private listeners = new Set<(batch: DataSourceMutationBatch) => void>();

  constructor(source: string) {
    let offset = 0;
    let id = 1;
    for (const match of source.matchAll(/\r\n|\r|\n/g)) {
      this.root = merge(this.root, this.node({ id: String(id++), text: source.slice(offset, match.index), ending: match[0] }));
      offset = match.index + match[0].length;
    }
    this.root = merge(this.root, this.node({ id: String(id), text: source.slice(offset), ending: "" }));
  }
  private node(value: SourceLine): Node {
    this.random ^= this.random << 13; this.random ^= this.random >>> 17; this.random ^= this.random << 5;
    return { value, count: 1, rank: this.random >>> 0 };
  }
  getLength() { return size(this.root); }
  getRevision() { return this.revision; }
  getItem(index: number) {
    if (index < 0 || index >= this.getLength()) return undefined;
    let node = this.root;
    while (node) {
      const left = size(node.left);
      if (index === left) return node.value;
      if (index < left) node = node.left;
      else { index -= left + 1; node = node.right; }
    }
    return undefined;
  }
  getKey(index: number) {
    const value = this.getItem(index);
    if (!value) throw new RangeError(`Missing source row ${index}`);
    return value.id;
  }
  subscribe(listener: (batch: DataSourceMutationBatch) => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  apply(change: SourceEdit) {
    const previousLength = this.getLength();
    const previousRevision = this.revision;
    if (change.revision !== previousRevision + 1 || change.startLine < 0 || change.removedLineCount < 0
      || change.startLine + change.removedLineCount > previousLength
      || previousLength - change.removedLineCount + change.lines.length !== change.lineCount) {
      throw new Error("Out-of-sequence native source edit; refusing to corrupt the row mirror.");
    }
    // Preserve the old objects for unchanged rows in the reparse context.
    const oldRows = new Map<string, SourceLine>();
    for (let i = 0; i < change.removedLineCount; i++) {
      const line = this.getItem(change.startLine + i)!; oldRows.set(line.id, line);
    }
    let inserted: Node | undefined;
    for (const line of change.lines) {
      const old = oldRows.get(line.id);
      inserted = merge(inserted, this.node(old?.text === line.text && old.ending === line.ending ? old : line));
    }
    // Native reparses neighboring lines for CRLF correctness. Report retained
    // keys as updates, not delete+insert: splicing them unnecessarily evicts
    // their mounted containers and measured geometry on every keystroke.
    let prefix = 0;
    while (prefix < change.removedLineCount && prefix < change.lines.length
      && this.getKey(change.startLine + prefix) === change.lines[prefix].id) prefix++;
    let suffix = 0;
    while (suffix + prefix < change.removedLineCount && suffix + prefix < change.lines.length
      && this.getKey(change.startLine + change.removedLineCount - suffix - 1) === change.lines[change.lines.length - suffix - 1].id) suffix++;
    const operations: DataSourceOperation[] = [];
    // Retain the last measured height until the native row reports its new
    // geometry. Falling back to a one-line estimate can clamp the scroll offset
    // to zero while editing a tall wrapped row, even when its height is unchanged.
    if (prefix) operations.push({ type: "update", index: change.startLine, count: prefix, layout: "preserve" });
    const deleteCount = change.removedLineCount - prefix - suffix;
    const insertCount = change.lines.length - prefix - suffix;
    if (deleteCount || insertCount) operations.push({ type: "splice", index: change.startLine + prefix, deleteCount, insertCount });
    if (suffix) operations.push({ type: "update", index: change.startLine + change.lines.length - suffix, count: suffix, layout: "preserve" });
    const [before, rest] = split(this.root, change.startLine);
    const [, after] = split(rest, change.removedLineCount);
    this.root = merge(merge(before, inserted), after);
    this.revision = change.revision;
    const batch: DataSourceMutationBatch = {
      previousLength, length: change.lineCount, previousRevision, revision: change.revision,
      operations,
    };
    this.listeners.forEach((listener) => listener(batch));
  }
}
