export type PreviewCacheSnapshot = { stills: Record<string, string>; noSurface: number[]; targets: string[] };
type Files = {
  getDirectory(kind: "cache"): Promise<string>;
  readText(path: string): Promise<string>;
  writeText(path: string, text: string): Promise<void>;
  mkdir(path: string, options: { recursive: boolean }): Promise<void>;
  move(from: string, to: string, options: { overwrite: boolean }): Promise<void>;
  remove(path: string): Promise<void>;
};

export function createPreviewCache(files: Files) {
  const saved = new Map<string, string>();
  let writes = Promise.resolve();
  const directory = async () => `${(await files.getDirectory("cache")).replace(/\/$/, "")}/slides/previews`;
  const validDeck = (deck: string) => /^[a-f0-9]{64}$/.test(deck);
  const signature = (key: string, snapshot: PreviewCacheSnapshot) => JSON.stringify([
    key, [...snapshot.targets].sort(), Object.keys(snapshot.stills).sort(), [...snapshot.noSurface].sort((left, right) => left - right),
  ]);
  return {
    async read(deck: string, key: string): Promise<PreviewCacheSnapshot | undefined> {
      if (!validDeck(deck)) return undefined;
      try {
        await writes;
        saved.delete(deck);
        const data = JSON.parse(await files.readText(`${await directory()}/${deck}.json`));
        if (!data || data.version !== 1 || data.key !== key || !data.stills || typeof data.stills !== "object" || Array.isArray(data.stills)
          || !Array.isArray(data.targets) || !data.targets.length || !data.targets.every((target: unknown) => typeof target === "string" && /^\d+:\d+$/.test(target))
          || !Array.isArray(data.noSurface) || !data.noSurface.every((index: unknown) => Number.isSafeInteger(index) && Number(index) >= 0)) return undefined;
        const noSurface = new Set<number>(data.noSurface);
        for (const target of data.targets) {
          const uri = data.stills[target];
          if (uri !== undefined && (typeof uri !== "string" || !uri.startsWith("data:image/jpeg;base64,"))) return undefined;
          if (!uri && !noSurface.has(Number(target.split(":")[0]))) return undefined;
        }
        const snapshot = { stills: Object.fromEntries(data.targets.filter((target: string) => data.stills[target]).map((target: string) => [target, data.stills[target]])), noSurface: [...noSurface], targets: data.targets };
        saved.set(deck, signature(key, snapshot));
        return snapshot;
      } catch { return undefined; }
    },
    save(deck: string, key: string, snapshot: PreviewCacheSnapshot): Promise<void> {
      if (!validDeck(deck)) return Promise.resolve();
      writes = writes.then(async () => {
        const stamp = signature(key, snapshot);
        if (saved.get(deck) === stamp) return;
        let temporary: string | undefined;
        try {
          const folder = await directory();
          await files.mkdir(folder, { recursive: true });
          const path = `${folder}/${deck}.json`;
          temporary = `${path}.${Date.now()}-${Math.random().toString(36).slice(2)}.tmp`;
          await files.writeText(temporary, JSON.stringify({ version: 1, key, ...snapshot }));
          await files.move(temporary, path, { overwrite: true });
          saved.set(deck, stamp);
        } catch { /* Preview storage is optional; preparation remains usable in memory. */ }
        finally { if (temporary) await files.remove(temporary).catch(() => {}); }
      });
      return writes;
    },
  };
}
