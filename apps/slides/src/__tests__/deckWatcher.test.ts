// @ts-nocheck Run the loader with explicit compiler and filesystem boundaries.
import { expect, test } from "bun:test";
import { observable } from "@legendapp/state";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { failedDeckUpdate, shouldDeferDeckUpdate, successfulDeckUpdate } from "../deckBuildPolicy";
import { getSlidesState, setSlidesState } from "../slidesStore";
import { effectRequests$, reportMissingEffects } from "../effectRequests";
import { deckWatchDirectories } from "../deckWatchDirectories";
const require = createRequire(new URL("../../../../packages/presentation/package.json", import.meta.url));
const { transformSync } = require("esbuild");

test("failed replacement opens retain the visible deck watcher until a successful publication", async () => {
  const watchers = [], commands = [];
  let fail = false;
  const mocks = {
    "@legend-apps/runtime-utils": { ownRegistration: (promise) => ({ remove: async () => { (await promise).remove(); } }), decodeProcessText: bytes => new TextDecoder().decode(bytes) },
    "./deckReloadQueue": { createDeckReloadQueue: reload => ({ changed: reload, dispose() {} }) },
    "./compilerRuntime": { compilerRuntime$: observable({ retryDeck: null, status: "ready" }), CompilerRuntimeMissingError: class extends Error {} },
    "./compilerHelper": { compilerHelper$: observable({ retryDeck: null }), CompilerDownloadError: class extends Error {} },
    "./compilerCommand": { runCompilerCommand: async args => mocks["@legendapp/spark/processes"].runCommand({ args }) },
    "./transitionLibrary": { transitionDirectoryPath: () => "/transitions" },
    "./deckWatchDirectories": { deckWatchDirectories },
    "./effectRequests": { effectRequests$, reportMissingEffects },
    "./slidesPreferences": { rememberDeckPath() {} },
    "./slidesStore": { getSlidesState, setSlidesState },
    "./deckBuildPolicy": { failedDeckUpdate, shouldDeferDeckUpdate, successfulDeckUpdate },
    "@legendapp/spark/processes": { runCommand: async ({ args }) => {
      commands.push(args[0]);
      return { exit: { type: "exited", code: 0 }, stdout: new TextEncoder().encode(JSON.stringify(fail ? { success: false, errors: ["broken"], warnings: [], missingEffectPacks: ["motion"] } : {
        success: true, code: "module.exports.default = function Deck() {};", uniwindCode: "{}", warnings: [],
        dependencies: ["/effects/media/pack.json", "/effects/media/AppCarousel.tsx"],
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
  setSlidesState({ slides: Array.from({ length: 5 }, () => ({ metadata: { steps: 3 }, notes: "" })), currentSlide: 4, currentStep: 2 });
  const original = watchers.findLast(watcher => !watcher.removed && watcher.paths[0] === "/a");
  const originalPack = watchers.findLast(watcher => !watcher.removed && watcher.paths[0] === "/effects/media");
  fail = true;
  await loadDeck("/b/deck.mdx");
  expect(getSlidesState()).toMatchObject({ deckPath: "/a/deck.mdx", currentSlide: 4, currentStep: 2 });
  expect(effectRequests$.pending.peek()).toEqual({path: "/b/deck.mdx", packs: ["motion"]});
  expect(original.removed).toBe(false);
  expect(originalPack.removed).toBe(false);
  await original.changed();
  expect(commands.at(-1)).toBe("/a/deck.mdx");
  fail = false;
  await original.changed();
  expect(effectRequests$.pending.peek()?.path).toBe("/b/deck.mdx");
  expect(getSlidesState()).toMatchObject({ deckPath: "/a/deck.mdx", currentSlide: 4, currentStep: 2 });
  await loadDeck("/b/deck.mdx");
  await Promise.resolve();
  expect(original.removed).toBe(true);
  expect(originalPack.removed).toBe(true);
  expect(watchers.filter(watcher => !watcher.removed).map(watcher => watcher.paths[0])).toEqual(["/b", "/effects/media", "/transitions"]);
  expect(getSlidesState()).toMatchObject({ deckPath: "/b/deck.mdx", currentSlide: 0, currentStep: 0 });
  expect(effectRequests$.pending.peek()).toBeNull();
  expect(Object.keys(getSlidesState().stepEpochs)).toEqual(["0"]);
});
