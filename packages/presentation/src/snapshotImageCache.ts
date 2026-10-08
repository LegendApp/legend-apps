type Image = { width(): number; height(): number };
type Entry<T> = { image: T; bytes: number; users: number; retained: boolean };

export function createSnapshotImageCache<T extends Image>({ dispose, maxBytes = 32 * 1024 * 1024, maxEntries = 12 }: {
  dispose(image: T): void; maxBytes?: number; maxEntries?: number;
}) {
  const entries = new Map<string, Entry<T>>();
  let bytes = 0;
  function remove(key: string, entry: Entry<T>) {
    entries.delete(key);
    bytes -= entry.bytes;
    entry.retained = false;
    if (!entry.users) dispose(entry.image);
  }
  function trim() {
    for (const [key, entry] of entries) {
      if (bytes <= maxBytes && entries.size <= maxEntries) break;
      remove(key, entry);
    }
  }
  function lease(entry: Entry<T>) {
    entry.users++;
    let released = false;
    return { image: entry.image, release() {
      if (released) return;
      released = true;
      entry.users--;
      if (!entry.retained && !entry.users) dispose(entry.image);
    } };
  }
  return {
    acquire(key: string) {
      const entry = entries.get(key);
      if (!entry) return;
      entries.delete(key);
      entries.set(key, entry);
      return lease(entry);
    },
    insert(key: string, image: T) {
      const old = entries.get(key);
      if (old) remove(key, old);
      const entry = { image, bytes: image.width() * image.height() * 8, users: 0, retained: true };
      entries.set(key, entry);
      bytes += entry.bytes;
      const result = lease(entry);
      trim();
      return result;
    },
    invalidate(key: string) {
      const entry = entries.get(key);
      if (entry) remove(key, entry);
    },
    clear() { for (const [key, entry] of entries) remove(key, entry); },
    get size() { return entries.size; },
    get bytes() { return bytes; },
  };
}
