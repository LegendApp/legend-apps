// @ts-nocheck Native windows are supplied by this test.
import { expect, mock, test } from "bun:test";
mock.module("react-native", () => ({ Platform: { OS: "macos" }, AppRegistry: {}, TurboModuleRegistry: { get: () => null }, NativeEventEmitter: class {} }));
const calls = [];
let finishOpen;
let failClose = false;
mock.module("@legendapp/spark/windows", () => ({
  closeWindow: async () => { calls.push("close"); return { closed: !failClose }; },
  getDisplays: async () => [], WindowProvider: () => null, openWindow: async () => {},
  setWindowBounds: async () => {},
}));
mock.module("../slidesWindows", () => ({ slidesWindows: { open: async () => {
  calls.push("opening"); await new Promise(resolve => { finishOpen = resolve; }); calls.push("opened");
} } }));
mock.module("../slidesSettings", () => ({ displayRolesSetting: { get: () => ({}) } }));
mock.module("@legendapp/spark/windows/macos", () => ({}));
const { previewNotesOutput, closeNotesOutput, resumeNotesOutput, syncNotesOutput, notesOutput$ } = await import("../notesOutput");

test("shutdown waits for preview creation and retains state when native close fails", async () => {
  const opening = previewNotesOutput();
  while (!finishOpen) await Promise.resolve();
  const shutdown = closeNotesOutput();
  expect(calls.at(-1)).toBe("opening");
  failClose = true;
  finishOpen(); await opening;
  await expect(shutdown).rejects.toThrow("Closing the notes window was vetoed");
  expect(notesOutput$.preview.peek()).toBe(true);
  failClose = false;
  await closeNotesOutput();
  expect(calls.slice(-3)).toEqual(["opened", "close", "close"]);
  expect(notesOutput$.preview.peek()).toBe(false);
});

test("shutdown rejects later opens until a presenter resumes the session", async () => {
  const count = calls.length;
  await previewNotesOutput();
  await syncNotesOutput([], true);
  expect(calls.length).toBe(count);
  resumeNotesOutput();
  finishOpen = undefined;
  const opening = previewNotesOutput();
  while (!finishOpen) await Promise.resolve();
  const closing = closeNotesOutput();
  const later = previewNotesOutput();
  finishOpen();
  await Promise.all([opening, closing, later]);
  expect(calls.slice(count)).toEqual(["opening", "opened", "close"]);
});
