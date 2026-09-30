// @ts-nocheck Run the loader with explicit compiler and filesystem boundaries.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { failedDeckUpdate, shouldDeferDeckUpdate, successfulDeckUpdate } from "../deckBuildPolicy";
const require = createRequire(new URL("../../../../packages/presentation/package.json", import.meta.url));
const { transformSync } = require("esbuild");

test("failed replacement opens retain the visible deck watcher until a successful publication", async () => {
  let state = { component: null, revision: 0, currentSlide: 0 };
  const watchers = [], commands = [];
  let fail = false;
  const mocks = {
    "@legend-apps/runtime-utils": { ownRegistration: (promise) => ({ remove: async () => { (await promise).remove(); } }), decodeProcessText: bytes => new TextDecoder().decode(bytes) },
    "./deckReloadQueue": { createDeckReloadQueue: reload => ({ changed: reload, dispose() {} }) },
    "./compilerCommand": { compilerCommand: async () => ({ target: { type: "executable", path: "/bun" }, prefix: [] }) },
    "./transitionLibrary": { transitionDirectoryPath: () => "/transitions" },
    "./slidesPreferences": { rememberDeckPath() {} },
    "./slidesStore": { getSlidesState: () => state, setSlidesState: update => Object.assign(state, update) },
    "./deckBuildPolicy": { failedDeckUpdate, shouldDeferDeckUpdate, successfulDeckUpdate },
    "@legendapp/spark/processes": { runCommand: async ({ args }) => {
      commands.push(args[0]);
      return { exit: { type: "exited", code: 0 }, stdout: new TextEncoder().encode(JSON.stringify(fail ? { success: false, errors: ["broken"], warnings: [] } : {
        success: true, code: "module.exports.default = function Deck() {};", uniwindCode: "{}", warnings: [],
      })), stderr: new Uint8Array() };
    } },
    "@legendapp/spark/files": { watch: async (path, changed) => {
      const watcher = { paths: [path], changed, removed: false, remove() { this.removed = true; } };
      watchers.push(watcher); return watcher;
    } },
    "@legendapp/spark/app/documents": { noteRecentDocument() {} },
    uniwind: { Uniwind: { __reinit() {} } },
  };
  const module = { exports: {} };
  const code = transformSync(readFileSync(new URL("../deckLoader.ts", import.meta.url), "utf8"), { loader: "ts", format: "cjs" }).code;
  Function("require", "module", "exports", code)(name => mocks[name] ?? {}, module, module.exports);
  const { loadDeck } = module.exports;
  await loadDeck("/a/deck.mdx");
  const original = watchers[0];
  fail = true;
  await loadDeck("/b/deck.mdx");
  expect(state.deckPath).toBe("/a/deck.mdx");
  expect(original.removed).toBe(false);
  await original.changed();
  expect(commands.at(-1)).toBe("/a/deck.mdx");
  fail = false;
  await loadDeck("/b/deck.mdx");
  await Promise.resolve();
  expect(original.removed).toBe(true);
  expect(watchers.at(-2).paths[0]).toBe("/b");
  expect(state.deckPath).toBe("/b/deck.mdx");
});
