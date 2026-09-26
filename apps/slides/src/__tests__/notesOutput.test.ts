// @ts-nocheck Native window lifecycle is supplied by the test.
import { expect, mock, test } from "bun:test";
const calls = [];
let failClose = false;
let notesDisplay = null;
mock.module("@legendapp/spark/windows/managed", () => ({
  closeWindow: async () => { calls.push("close"); return { success: !failClose }; },
  getDisplays: async () => [], WindowStyleMask: { Titled: 1, Closable: 2, Resizable: 4 },
}));
mock.module("../slidesWindows", () => ({ slidesWindows: { open: async () => { calls.push("open"); } } }));
mock.module("../slidesSettings", () => ({ displayRolesSetting: { get: () => ({ notes: notesDisplay }) } }));
const { previewNotesOutput, notesOutput$, syncNotesOutput, notesOutputClosed } = await import("../notesOutput");

test("preview is closed when presenting without a notes display", async () => {
  await previewNotesOutput();
  expect(notesOutput$.preview.peek()).toBe(true);
  calls.length = 0;
  notesOutput$.preview.set(false);
  await syncNotesOutput([], true);
  await syncNotesOutput([], false);
  expect(calls).toEqual(["close"]);
});

test("failed preview close remains tracked for a successful retry", async () => {
  await previewNotesOutput();
  notesOutput$.preview.set(false);
  failClose = true;
  await expect(syncNotesOutput([], true)).rejects.toThrow("Could not close");
  failClose = false;
  calls.length = 0;
  await syncNotesOutput([], false);
  expect(calls).toEqual(["close"]);
});

test("preview can become an assigned output and closes on stop", async () => {
  await previewNotesOutput();
  notesOutput$.preview.set(false);
  notesDisplay = "notes";
  calls.length = 0;
  await syncNotesOutput([{ id: "notes", frame: { x: 0, y: 0, width: 800, height: 600 } }], true);
  await syncNotesOutput([], false);
  expect(calls).toEqual(["open", "close"]);
  notesOutputClosed();
});
