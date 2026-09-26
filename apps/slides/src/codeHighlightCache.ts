/** Bound both entry count and retained source/key size; share pending parses too. */
export function createCodeHighlightCache<T>(
  load: (source: string, language: string, theme: string) => Promise<T>,
  maxEntries = 32,
  maxKeyCharacters = 1_000_000,
) {
  const entries = new Map<string, Promise<T>>();
  let characters = 0;
  const remove = (key: string) => {
    if (entries.delete(key)) characters -= key.length;
  };
  return (source: string, language: string, theme: string) => {
    const key = JSON.stringify([source, language, theme]);
    const cached = entries.get(key);
    if (cached) {
      entries.delete(key); entries.set(key, cached);
      return cached;
    }
    if (maxEntries <= 0 || key.length > maxKeyCharacters) return load(source, language, theme);
    while (entries.size && (entries.size >= maxEntries || characters + key.length > maxKeyCharacters)) {
      remove(entries.keys().next().value!);
    }
    const pending = Promise.resolve().then(() => load(source, language, theme)).catch(error => {
      // An evicted request may fail after a newer request for the same key started.
      if (entries.get(key) === pending) remove(key);
      throw error;
    });
    entries.set(key, pending); characters += key.length;
    return pending;
  };
}
