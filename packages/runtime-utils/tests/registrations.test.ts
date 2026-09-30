// @ts-nocheck Bun test types are not part of the application TypeScript project.
import { expect, mock, test } from "bun:test";
import { ownRegistration } from "../src/ownRegistration";
import { decodeProcessText } from "../src/decodeProcessText";
const watches: { path: string; changed: (path: string) => void; remove: ReturnType<typeof mock> }[] = [];
mock.module("@legendapp/spark/files", () => ({ watch: async (path: string, changed: (path: string) => void) => {
  const handle = { path, changed, remove: mock(async () => {}) }; watches.push(handle); return handle;
} }));
const { createFolderWatcher } = await import("../src/folderWatcher");

test("removal before setup completes releases the eventual native handle once", async () => {
  let finish!: (handle: { remove(): Promise<void> }) => void;
  const handle = { remove: mock(async () => {}) };
  const owned = ownRegistration(new Promise<typeof handle>(resolve => { finish = resolve; }));
  const first = owned.remove(), second = owned.remove();
  expect(first).toBe(second);
  expect(handle.remove).not.toHaveBeenCalled();
  finish(handle); await first;
  await owned.remove();
  expect(handle.remove).toHaveBeenCalledTimes(1);
});
test("failed cleanup retains ownership so the caller can retry", async () => {
  const remove = mock().mockRejectedValueOnce(Error("busy")).mockResolvedValue(undefined);
  const owned = ownRegistration({ remove });
  await expect(owned.remove()).rejects.toThrow("busy");
  await owned.remove();
  expect(remove).toHaveBeenCalledTimes(2);
});
test("changing watch paths retires removed paths and keeps retained watches", async () => {
  watches.length = 0;
  const changed = mock();
  const owner = createFolderWatcher(changed);
  await owner.setPaths(["/a", "/b", "/a"]);
  const a = watches[0]!, b = watches[1]!;
  await owner.setPaths(["/b", "/c"]);
  a.changed("/a/file"); b.changed("/b/file");
  expect(changed.mock.calls).toEqual([["/b/file"]]);
  expect(a.remove).toHaveBeenCalledTimes(1);
  expect(b.remove).not.toHaveBeenCalled();
  expect(watches.map(watch => watch.path)).toEqual(["/a", "/b", "/c"]);
  await owner.remove();
  b.changed("/b/later");
  expect(changed).toHaveBeenCalledTimes(1);
  expect(b.remove).toHaveBeenCalledTimes(1);
  await expect(owner.setPaths([])).rejects.toThrow("removed");
});
test("process text decoding preserves Unicode without a runtime TextDecoder", () => {
  expect(decodeProcessText(new Uint8Array([65, 0xe2, 0x82, 0xac, 0xf0, 0x9f, 0x8e, 0xb5]))).toBe("A€🎵");
});
