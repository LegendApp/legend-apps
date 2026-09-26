import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../../../packages/presentation/package.json", import.meta.url));
const { transformSync } = require("esbuild");
const React = require("react");
function load(name) {
  const code = transformSync(readFileSync(new URL(`../../../../packages/presentation/src/${name}`, import.meta.url), "utf8"), { loader: name.endsWith("tsx") ? "tsx" : "ts", format: "cjs", jsx: "automatic" }).code;
  const module = { exports: {} };
  Function("require", "module", "exports", code)(id => id === "./focusGeometry" ? load("focusGeometry.ts") : id === "./focusMotionStyles" ? load("focusMotionStyles.ts") : id === "./transitionValues" ? {} : id === "react-native-reanimated" ? { default: {} } : id === "react-native" ? { Animated: {} } : id === "react" ? React : id === "./nativeChildren" ? {} : require(id), module, module.exports);
  return module.exports;
}
const { createFocusSurface, invalidateFocusSurface, measureFocusSurface, prepareFocusSurface, measureFocusPair } = load("focus.tsx");
function surface() { const value = createFocusSurface(); value.setRoot({}); return value; }
function entry(id, kind = "element") {
  const callbacks = []; let calls = 0;
  return { id, kind, callbacks, get calls() { return calls; }, view: { measureLayout(root, done) { calls++; callbacks.push(done); } } };
}
test("navigation reuses preparation reads without waiting for unrelated callbacks", async () => {
  const a = surface(), b = surface();
  const titleA = entry("title"), titleB = entry("title"), unrelated = entry("offstage", "region");
  a.entries.add(titleA); a.entries.add(unrelated); b.entries.add(titleB);
  const preparing = prepareFocusSurface(a);
  await Promise.resolve();
  titleA.callbacks[0](10, 20, 300, 50);
  await Promise.resolve(); await Promise.resolve();
  const pair = measureFocusPair(a, b);
  titleB.callbacks[0](30, 40, 300, 50);
  const result = await pair;
  assert.equal(titleA.calls, 1, "even a completed read is reused while other preparation is pending");
  assert.equal(result[0].elements.get("title").x, 10);
  assert.equal(unrelated.callbacks.length, 1);
  unrelated.callbacks[0](0, 0, 10, 10); await preparing;
});
test("concurrent requests coalesce and layout invalidation requires fresh geometry", async () => {
  const s = surface(), title = entry("title"); s.entries.add(title);
  const first = measureFocusSurface(s); const second = measureFocusSurface(s);
  assert.equal(title.calls, 1);
  title.callbacks[0](10, 20, 300, 50);
  assert.deepEqual(await first, await second);
  invalidateFocusSurface(s);
  const changed = measureFocusSurface(s); assert.equal(title.calls, 2);
  title.callbacks[1](90, 20, 300, 50);
  assert.equal((await changed).elements.get("title").x, 90);
});
test("late callbacks cannot publish stale or detached geometry; duplicate IDs remain excluded", async () => {
  const s = surface(), title = entry("title"); s.entries.add(title);
  const stale = measureFocusSurface(s); invalidateFocusSurface(s);
  title.callbacks[0](10, 20, 30, 40); assert.equal((await stale).elements.size, 0);
  const removed = measureFocusSurface(s); s.entries.delete(title);
  title.callbacks[1](10, 20, 30, 40); assert.equal((await removed).elements.size, 0);
  const a = entry("same"), b = entry("same"); s.entries.add(a); s.entries.add(b);
  const duplicates = measureFocusSurface(s);
  a.callbacks[0](1, 2, 3, 4); b.callbacks[0](2, 3, 4, 5);
  assert.equal((await duplicates).elements.size, 0);
});
test("missing callbacks time out and late completion is ignored", async () => {
  const original = globalThis.setTimeout, originalClear = globalThis.clearTimeout;
  const timers = new Map(); let id = 0;
  globalThis.setTimeout = callback => { timers.set(++id, callback); return id; };
  globalThis.clearTimeout = key => timers.delete(key);
  try {
    const s = surface(), title = entry("title"); s.entries.add(title);
    const result = measureFocusSurface(s);
    for (const fn of [...timers.values()]) fn();
    assert.equal((await result).elements.size, 0);
    title.callbacks[0](1, 2, 30, 40);
    assert.equal((await result).elements.size, 0);
  } finally { globalThis.setTimeout = original; globalThis.clearTimeout = originalClear; }
});
