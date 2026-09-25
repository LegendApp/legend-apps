// @ts-nocheck Native close and draft decisions are supplied by the test.
import { expect, mock, test } from "bun:test";
let allowed = true, audienceOpen = true, notesFail = false, presenterFail = false, resumes = 0;
const calls = [];
mock.module("../slidesExit", () => ({ prepareSlidesExit: async () => allowed }));
mock.module("../slidesStore", () => ({ getSlidesState: () => ({ audienceOpen }) }));
mock.module("../notesOutput", () => ({ resumeNotesOutput: () => { resumes++; }, closeNotesOutput: async () => { calls.push("notes"); if (notesFail) throw Error("notes close failed"); } }));
mock.module("@legend-apps/window-manager", () => ({ closeWindow: async id => { calls.push(id); return { success: !presenterFail }; } }));
const { closePresenterSession } = await import("../presenterClose");

test("cancel and failed output closure retain the presenter", async () => {
  const stop = mock(async () => {});
  allowed = false;
  await closePresenterSession(stop);
  expect(stop).not.toHaveBeenCalled();
  allowed = true;
  await expect(closePresenterSession(stop)).rejects.toThrow("audience");
  expect(calls).toEqual([]);
  audienceOpen = false; notesFail = true;
  await expect(closePresenterSession(stop)).rejects.toThrow("notes close failed");
  expect(calls).toEqual(["notes"]);
});

test("waits for pending audience operations before closing outputs and the controller", async () => {
  calls.length = 0; notesFail = false; audienceOpen = true;
  let finish;
  const pending = new Promise(resolve => { finish = resolve; });
  const closing = closePresenterSession(async () => { await pending; audienceOpen = false; calls.push("audience"); });
  await Promise.resolve();
  expect(calls).toEqual([]);
  finish(); await closing;
  expect(calls).toEqual(["audience", "notes", "slides-presenter"]);
});

test("failed presenter closure resumes notes operations", async () => {
  const before = resumes;
  presenterFail = true;
  await expect(closePresenterSession(async () => {})).rejects.toThrow("Could not close the presenter");
  expect(resumes).toBe(before + 1);
  presenterFail = false;
});
