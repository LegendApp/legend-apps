import { isPlainObject } from "./validate";

const layoutNodeTypes = new Set(["split", "panel", "switch"]);
/** Layout nodes replace whole; layouts never merge node by node (spec §3.2). */
const isLayoutNode = (value: Record<string, unknown>) => typeof value.type === "string" && layoutNodeTypes.has(value.type);

/** Merges `over` onto `base`: objects key by key, arrays, layout nodes and scalars replace whole, undefined inherits. */
export function mergeSettings<T>(base: T, over: unknown): T {
  if (over === undefined) return base;
  if (!isPlainObject(base) || !isPlainObject(over) || isLayoutNode(over)) return over as T;
  const out: Record<string, unknown> = { ...base };
  for (const [key, value] of Object.entries(over)) out[key] = mergeSettings(out[key], value);
  return out as T;
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (Array.isArray(a)) return Array.isArray(b) && a.length === b.length && a.every((item, index) => deepEqual(item, b[index]));
  if (!isPlainObject(a) || !isPlainObject(b)) return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && deepEqual(a[key], b[key]));
}

/**
 * `next`, reusing `previous`'s objects wherever their contents are equal, so a subscriber that compares by reference
 * (or a Legend State child observable) sees no change in a subtree that did not change.
 */
export function shareStructure<T>(previous: unknown, next: T): T {
  if (previous === next) return next;
  if (Array.isArray(previous) && Array.isArray(next)) {
    const items = next.map((item, index) => shareStructure(previous[index], item));
    return (items.length === previous.length && items.every((item, index) => item === previous[index]) ? previous : items) as T;
  }
  if (!isPlainObject(previous) || !isPlainObject(next)) return next;
  const keys = Object.keys(next);
  const out: Record<string, unknown> = {};
  let same = keys.length === Object.keys(previous).length;
  for (const key of keys) {
    out[key] = shareStructure(previous[key], next[key]);
    if (out[key] !== previous[key] || !Object.hasOwn(previous, key)) same = false;
  }
  return (same ? previous : out) as T;
}
