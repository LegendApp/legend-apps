// @ts-nocheck Bun test types are not part of the application TypeScript project.
import { beforeEach, expect, mock, test } from "bun:test";

const showWindow = mock(async () => {});
const existing = { id: "settings" };
const getWindow = mock(async () => existing);
mock.module("@legendapp/spark/windows", () => ({ showWindow, getWindow }));
const { openOrShowWindow } = await import("../src/openOrShowWindow");

beforeEach(() => {
  showWindow.mockClear();
  getWindow.mockClear();
});

test("a new singleton uses only its native open call", async () => {
  const created = { id: "settings" };
  const open = mock(async () => created);
  expect(await openOrShowWindow("settings", open)).toBe(created);
  expect(open).toHaveBeenCalledTimes(1);
  expect(showWindow).not.toHaveBeenCalled();
  expect(getWindow).not.toHaveBeenCalled();
});

test("an existing or restored singleton is shown and returned", async () => {
  const open = mock(async () => { throw { code: "E_ALREADY_EXISTS" }; });
  expect(await openOrShowWindow("settings", open)).toBe(existing);
  expect(showWindow).toHaveBeenCalledWith("settings");
  expect(getWindow).toHaveBeenCalledWith("settings");
});

test("other native failures are preserved without showing a window", async () => {
  const error = Object.assign(new Error("native failure"), { code: "E_UNAVAILABLE" });
  await expect(openOrShowWindow("settings", async () => { throw error; })).rejects.toBe(error);
  expect(showWindow).not.toHaveBeenCalled();
  expect(getWindow).not.toHaveBeenCalled();
});
