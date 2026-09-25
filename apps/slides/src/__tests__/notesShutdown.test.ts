// @ts-nocheck Native windows are supplied by this test.
import { expect, mock, test } from "bun:test";
const calls = [];
let finishOpen;
let failClose = false;
mock.module("@legend-apps/window-manager", () => ({
  closeWindow: async () => { calls.push("close"); return { success: !failClose }; },
  getDisplays: async () => [], WindowStyleMask: { Titled: 1, Closable: 2, Resizable: 4 },
}));
mock.module("../slidesWindows", () => ({ slidesWindows: { open: async () => {
  calls.push("opening"); await new Promise(resolve => { finishOpen = resolve; }); calls.push("opened");
} } }));
mock.module("../slidesSettings", () => ({ displayRolesSetting: { get: () => ({}) } }));
const { previewNotesOutput, closeNotesOutput, notesOutput$ } = await import("../notesOutput");

test("shutdown waits for preview creation and retains state when native close fails", async () => {
  const opening = previewNotesOutput();
  while (!finishOpen) await Promise.resolve();
  const shutdown = closeNotesOutput();
  expect(calls.at(-1)).toBe("opening");
  failClose = true;
  finishOpen(); await opening;
  await expect(shutdown).rejects.toThrow("Could not close");
  expect(notesOutput$.preview.peek()).toBe(true);
  failClose = false;
  await closeNotesOutput();
  expect(calls.slice(-3)).toEqual(["opened", "close", "close"]);
  expect(notesOutput$.preview.peek()).toBe(false);
});
