// @ts-nocheck Bun test types are not part of the app TypeScript project.
import { expect, test } from "bun:test";
import { createCodeHighlightCache } from "../codeHighlightCache";
test("audience and presenter copies share pending and completed highlighting", async () => {
  let calls = 0;
  const result = {lines: ["highlighted"]};
  const load = createCodeHighlightCache(async () => { calls++; return result; });
  const first = load("const a = 1", "typescript", "dark");
  const second = load("const a = 1", "typescript", "dark");
  expect(second).toBe(first);
  expect(await first).toBe(result);
  expect(await load("const a = 1", "typescript", "dark")).toBe(result);
  expect(calls).toBe(1);
  await load("const a = 1", "javascript", "dark");
  await load("const a = 1", "typescript", "light");
  expect(calls).toBe(3);
});
test("LRU eviction bounds retained entries and large source keys bypass the cache", async () => {
  let calls = 0;
  const load = createCodeHighlightCache(async () => ++calls, 2, 60);
  await load("a", "ts", "dark"); await load("b", "ts", "dark");
  expect(await load("a", "ts", "dark")).toBe(1);
  await load("c", "ts", "dark");
  expect(await load("b", "ts", "dark")).toBe(4);
  await load("x".repeat(100), "ts", "dark");
  await load("x".repeat(100), "ts", "dark");
  expect(calls).toBe(6);
  // The character budget also evicts before the entry-count limit is reached.
  const bounded = createCodeHighlightCache(async () => ++calls, 32, 22);
  await bounded("a", "ts", "dark"); await bounded("b", "ts", "dark");
  await bounded("a", "ts", "dark");
  expect(calls).toBe(9);
});
test("failed parses can retry and stale failures cannot evict a newer request", async () => {
  let reject!: (error: Error) => void;
  let calls = 0;
  const load = createCodeHighlightCache(() => ++calls === 1 ? new Promise<number>((_, fail) => { reject = fail; }) : Promise.resolve(calls), 1);
  const old = load("a", "ts", "dark");
  const failure = old.catch(() => null);
  await Promise.resolve();
  await load("b", "ts", "dark");
  const replacement = load("a", "ts", "dark");
  reject(new Error("failed")); await failure;
  expect(load("a", "ts", "dark")).toBe(replacement);
  let tries = 0;
  const retry = createCodeHighlightCache(async () => { if (++tries === 1) throw new Error("retry"); return 42; });
  await expect(retry("a", "ts", "dark")).rejects.toThrow("retry");
  expect(await retry("a", "ts", "dark")).toBe(42);
});
