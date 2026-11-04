// @ts-nocheck Native window results are supplied by this test.
import { expect, mock, test } from "bun:test";
import { SparkError } from "@legendapp/spark/contracts";
import type { CloseResult } from "@legendapp/spark/windows";

let result: CloseResult = { closed: true };
let failure: unknown;
const close = mock(async (_id: string) => {
  if (failure) throw failure;
  return result;
});
mock.module("@legendapp/spark/windows", () => ({ closeWindow: close }));
const { closeSlidesWindow } = await import("../closeWindow");

test("closes the requested window and preserves native vetoes", async () => {
  expect(await closeSlidesWindow("slides-audience")).toEqual({ closed: true });
  expect(close).toHaveBeenLastCalledWith("slides-audience");
  result = { closed: false, reason: "vetoed" };
  expect(await closeSlidesWindow("slides-notes")).toEqual(result);
});

test("an absent window is successful cleanup for every Slides window", async () => {
  failure = new SparkError("E_NOT_FOUND", "Window does not exist");
  for (const id of ["slides-audience", "slides-notes", "slides-presenter", "slides-identify-1"]) {
    expect(await closeSlidesWindow(id)).toEqual({ closed: true });
  }
});

test("other native failures and errors with similar messages still reject", async () => {
  for (const error of [new SparkError("E_NATIVE", "Close failed"), new Error("Window does not exist")]) {
    failure = error;
    await expect(closeSlidesWindow("slides-notes")).rejects.toBe(error);
  }
});
