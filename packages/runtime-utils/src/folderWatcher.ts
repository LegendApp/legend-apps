import { watch } from "@legendapp/spark/files";
import { ownRegistration } from "./ownRegistration";
/** One owner for a changing collection of recursive directory watches. */
export function createFolderWatcher(onChange: (path: string) => void, onError: (error: unknown) => void = console.error) {
  let closed = false;
  const entries = new Map<string, { active: boolean; registration: ReturnType<typeof ownRegistration> }>();
  const retired = new Set<ReturnType<typeof ownRegistration>>();
  const release = async (registration: ReturnType<typeof ownRegistration>) => { await registration.remove(); retired.delete(registration); };
  return {
    async setPaths(paths: readonly string[]) {
      if (closed) throw new Error("Folder watcher has been removed");
      const wanted = new Set(paths), pending: Promise<unknown>[] = [];
      for (const [path, entry] of entries) if (!wanted.has(path)) {
        entry.active = false; entries.delete(path); retired.add(entry.registration);
      }
      for (const registration of retired) pending.push(release(registration));
      for (const path of wanted) if (!entries.has(path)) {
        const entry = { active: true, registration: ownRegistration(watch(path, changed => {
          if (!closed && entry.active) onChange(changed);
        }, { recursive: true }), onError) };
        entries.set(path, entry);
        pending.push(entry.registration.ready.catch(error => { if (entries.get(path) === entry) entries.delete(path); throw error; }));
      }
      await Promise.all(pending);
    },
    async remove() {
      closed = true;
      for (const entry of entries.values()) { entry.active = false; retired.add(entry.registration); }
      entries.clear();
      await Promise.all([...retired].map(release));
    },
  };
}
