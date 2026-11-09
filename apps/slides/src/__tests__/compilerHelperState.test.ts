// @ts-nocheck Native helper launch is replaced; run the actual preparation and shared retry state.
import { expect, mock, test } from "bun:test";
import { CompilerPreparationError } from "../compilerHelperCore";
const calls = [];
let complete;
mock.module("../compilerRuntime", () => ({ runtimeHost: async () => ({ dataDirectory: "/data", exists: async () => true }) }));
mock.module("@legendapp/spark/processes", () => ({ runCommand: options => {
  calls.push(options);
  return new Promise((resolve, reject) => { complete = { resolve, reject }; });
} }));
mock.module("@legend-apps/runtime-utils", () => ({ decodeProcessText: value => value }));
const { compilerHelper$, resolveCompilerHelper } = await import("../compilerHelper");
const turn = () => new Promise(done => setTimeout(done, 0));

test("concurrent commands share bundled preparation, failure clears it, and success is reused", async () => {
  const first = resolveCompilerHelper(), second = resolveCompilerHelper();
  expect(first).toBe(second);
  await turn();
  expect(calls).toHaveLength(1);
  expect(calls[0]).toMatchObject({ target: { type: "helper", name: "slides-compiler" }, env: { LEGEND_SLIDES_COMPILER_CACHE: "/data/compiler" } });
  expect(compilerHelper$.busy.peek()).toBe(true);
  expect(compilerHelper$.message.peek()).toBe("Preparing built-in deck compiler…");
  complete.reject(new CompilerPreparationError("corrupt built-in compiler: retry"));
  await expect(first).rejects.toThrow("corrupt built-in compiler: retry");
  await expect(second).rejects.toThrow("corrupt built-in compiler: retry");
  expect(compilerHelper$.busy.peek()).toBe(false);
  expect(compilerHelper$.error.peek()).toBe("corrupt built-in compiler: retry");
  const retry = resolveCompilerHelper();
  await turn();
  expect(calls).toHaveLength(2);
  expect(compilerHelper$.error.peek()).toBe("");
  const entry = `/data/compiler/${"a".repeat(64)}/run`;
  complete.resolve({ exit: { type: "exited", code: 0 }, stdout: entry, stderr: "" });
  expect(await retry).toBe(entry);
  expect(await resolveCompilerHelper()).toBe(entry);
  expect(calls).toHaveLength(2);
});
