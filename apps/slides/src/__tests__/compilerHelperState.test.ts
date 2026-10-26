// @ts-nocheck Native I/O is replaced to test shared acquisition and explicit retry.
import { expect, mock, test } from "bun:test";
let installs = 0, complete;
mock.module("../compilerRuntime", () => ({ runtimeHost: async () => ({}) }));
class CompilerDownloadError extends Error {}
mock.module("../compilerHelperCore", () => ({ CompilerDownloadError, installCompilerHelper: async (_host, _pin, report) => {
  installs++; report("Downloading deck compiler…");
  return new Promise((resolve, reject) => { complete = { resolve, reject }; });
} }));
process.env.EXPO_PUBLIC_LEGEND_SLIDES_COMPILER_ARTIFACT = JSON.stringify({ sha256: "pin" });
const { compilerHelper$, resolveCompilerHelper } = await import("../compilerHelper");
const turn = () => new Promise(done => setTimeout(done, 0));

test("concurrent commands share acquisition, failure clears it, success is reused", async () => {
  const first = resolveCompilerHelper(), second = resolveCompilerHelper();
  expect(first).toBe(second);
  await turn();
  expect(installs).toBe(1);
  expect(compilerHelper$.busy.peek()).toBe(true);
  expect(compilerHelper$.message.peek()).toBe("Downloading deck compiler…");
  complete.reject(new CompilerDownloadError("offline: retry"));
  await expect(first).rejects.toThrow("offline: retry");
  await expect(second).rejects.toThrow("offline: retry");
  expect(compilerHelper$.busy.peek()).toBe(false);
  expect(compilerHelper$.error.peek()).toBe("offline: retry");
  const retry = resolveCompilerHelper();
  await turn();
  expect(installs).toBe(2);
  expect(compilerHelper$.error.peek()).toBe("");
  complete.resolve("/verified/run");
  expect(await retry).toBe("/verified/run");
  expect(await resolveCompilerHelper()).toBe("/verified/run");
  expect(installs).toBe(2);
});
