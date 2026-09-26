import { getPhotosStorageSubfolder, getPhotosStorageRoot } from "../systems/launch";
import { createObservableFile, getPersistPlugin } from "@legendapp/spark/settings/observable";
import type { Observable } from "@legendapp/state";
import type { SyncTransform } from "@legendapp/state/sync";
const flushers: (() => Promise<void> | undefined)[] = [];
export function createJSONManager<T extends object>(params: {
  filename: `${string}.json`; initialValue: T; saveDefaultToFile: boolean; transform?: SyncTransform<any, any>;
}): Observable<T> {
  const result = createObservableFile({ ...params, filename: params.filename.slice(0, -5), root: getPhotosStorageRoot(), subfolder: getPhotosStorageSubfolder(), saveTimeout: 300 });
  result.get();
  flushers.push(() => getPersistPlugin(result)?.flush());
  return result;
}
export async function flushPhotoSettings() {
  await Promise.all(flushers.map(flush => flush()));
}
