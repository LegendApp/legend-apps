import { createStorage, type Storage } from "@legend-apps/storage";
import { observable } from "@legendapp/state";

export function createStoryReviewStore(storage: Pick<Storage, "read" | "write">) {
  const reviewed$ = observable<Record<string, string[]>>({});
  function load(hash: string) {
    if (reviewed$[hash].peek()) return;
    const raw = storage.read(`${hash.replace(/^sha256:/, "")}.json`, { format: "text" });
    let ids: unknown;
    try { ids = raw ? JSON.parse(raw) : []; } catch { ids = []; }
    reviewed$[hash].set(Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string") : []);
  }
  return { reviewed$, load,
    setReviewed(hash: string, id: string, reviewed: boolean) {
      load(hash);
      const ids = new Set(reviewed$[hash].peek());
      if (reviewed) ids.add(id); else ids.delete(id);
      const value = [...ids];
      storage.write(`${hash.replace(/^sha256:/, "")}.json`, JSON.stringify(value), { format: "text" });
      reviewed$[hash].set(value);
    },
  };
}
let store: ReturnType<typeof createStoryReviewStore>;
export function getStoryReviewStore() { return store ??= createStoryReviewStore(createStorage({ subfolder: "story-reviews" })); }
