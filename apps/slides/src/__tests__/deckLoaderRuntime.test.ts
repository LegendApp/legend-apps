// @ts-nocheck Replace native I/O while running the real loader, discovery and retry operations.
import { expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { getSlidesState, setSlidesState } from "../slidesStore";
import { failedDeckUpdate, shouldDeferDeckUpdate, successfulDeckUpdate } from "../deckBuildPolicy";
import { effectRequests$, reportMissingEffects } from "../effectRequests";
import { deckWatchDirectories } from "../deckWatchDirectories";

const runtime = { path: "/runtime/bun", kind: "bun", version: "1.3.14", source: "system" };
let discover = async () => null, run = async () => success;
const success = { exit: { type: "exited", code: 0 }, stdout: JSON.stringify({
  success: true, code: "module.exports.default = function Deck() {};", uniwindCode: "{}", warnings: [], dependencies: [],
}), stderr: "" };
mock.module("../compilerRuntimeCore", () => ({ findRuntime: () => discover(), runtimeArch: async () => "x64", probeRuntime() {}, installPinnedBun() {} }));
mock.module("../slidesSettings", () => ({ getCompilerRuntimePathSetting: () => "", setCompilerRuntimePathSetting() {} }));
mock.module("@legendapp/spark/files", () => ({ getDirectory: async () => "/Users/me/Library/Application Support/Slides", exists() {}, mkdir() {}, move() {}, remove() {} }));
mock.module("@legendapp/spark/processes", () => ({ runCommand: options => run(options), spawn() {}, resolveCommand() {} }));
mock.module("@legend-apps/runtime-utils", () => ({ decodeProcessText: value => value }));
globalThis.__DEV__ = false;
const compilerRuntime = await import("../compilerRuntime");
const { compilerRuntime$, resolveCompilerRuntime, changeCompilerRuntime } = compilerRuntime;
const compilerCommand = await import("../compilerCommand");
const mocks = {
  "./deckReloadQueue": { createDeckReloadQueue: () => ({ dispose() {} }) },
  "./compilerCommand": compilerCommand, "./compilerRuntime": compilerRuntime,
  "./slidesStore": { getSlidesState, setSlidesState },
  "./deckBuildPolicy": { failedDeckUpdate, shouldDeferDeckUpdate, successfulDeckUpdate },
  "./effectRequests": { effectRequests$, reportMissingEffects },
  "./deckWatchDirectories": { deckWatchDirectories },
  "./transitionLibrary": { transitionDirectoryPath: () => "/transitions" },
  "./slidesPreferences": { rememberDeckPath() {} },
  "@legend-apps/runtime-utils": { decodeProcessText: value => value, ownRegistration: () => ({ remove: async () => {} }) },
  "@legendapp/spark/files": { watch: async () => ({ remove() {} }) },
  "@legendapp/spark/app/documents": { noteRecentDocument() {} },
  uniwind: { Uniwind: { __reinit() {} } },
};
const require = createRequire(new URL("../../../../packages/presentation/package.json", import.meta.url));
const { transformSync } = require("esbuild");
const module = { exports: {} };
const code = transformSync(readFileSync(new URL("../deckLoader.ts", import.meta.url), "utf8"), { loader: "ts", format: "cjs" }).code;
Function("require", "module", "exports", code)(name => mocks[name] ?? {}, module, module.exports);
const { loadDeck, invalidateDeckBuild } = module.exports;
mock.module("../deckLoader", () => ({ loadDeck }));
const turn = () => new Promise(done => setTimeout(done, 0));
function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

test("opening B clears A's missing-runtime retry before compilation and later detection preserves B", async () => {
  await resolveCompilerRuntime({ refresh: true });
  expect(await loadDeck("/a.mdx")).toBe(false);
  expect(compilerRuntime$.retryDeck.peek()).toBe("/a.mdx");
  discover = async () => runtime; // The user installed Bun in Terminal.
  const compilation = deferred();
  run = () => compilation.promise;
  const openingB = loadDeck("/b.mdx");
  expect(compilerRuntime$.retryDeck.peek()).toBeNull();
  await turn();
  compilation.resolve(success);
  expect(await openingB).toBe(true);
  await changeCompilerRuntime(() => resolveCompilerRuntime({ refresh: true }));
  expect(getSlidesState()).toMatchObject({ deckPath: "/b.mdx", status: "ready" });
  expect(compilerRuntime$.retryDeck.peek()).toBeNull();
});

test("an older missing-runtime failure cannot register a retry after a newer deck succeeds", async () => {
  const old = deferred();
  discover = () => old.promise;
  const checking = resolveCompilerRuntime({ refresh: true });
  const openingA = loadDeck("/a.mdx");
  await turn();
  discover = async () => runtime;
  await resolveCompilerRuntime({ refresh: true });
  run = async () => success;
  expect(await loadDeck("/b.mdx")).toBe(true);
  old.resolve(null);
  await checking;
  expect(await openingA).toBe(false);
  expect(compilerRuntime$.retryDeck.peek()).toBeNull();
  expect(getSlidesState().deckPath).toBe("/b.mdx");
});

test("cancelling a failed load clears its pending runtime retry", async () => {
  discover = async () => null;
  await resolveCompilerRuntime({ refresh: true });
  await loadDeck("/a.mdx");
  expect(compilerRuntime$.retryDeck.peek()).toBe("/a.mdx");
  invalidateDeckBuild();
  expect(compilerRuntime$.retryDeck.peek()).toBeNull();
});

test("a late launcher failure after runtime recovery opens the deck without stranding a retry", async () => {
  discover = async () => runtime;
  await resolveCompilerRuntime({ refresh: true });
  const completion = deferred();
  const commands = [];
  run = options => {
    commands.push(options);
    if (commands.length === 1) return { ...success, exit: { type: "exited", code: 127 } };
    if (commands.length === 2) return completion.promise;
    return success;
  };
  const opening = loadDeck("/recovered.mdx");
  await turn();
  expect(commands).toHaveLength(2);
  await changeCompilerRuntime(() => resolveCompilerRuntime({ refresh: true }));
  completion.resolve({ ...success, exit: { type: "exited", code: 127 } });
  expect(await opening).toBe(true);
  expect(commands).toHaveLength(3);
  expect(commands[2].env.LEGEND_SLIDES_RUNTIME).toBe(runtime.path);
  expect(compilerRuntime$.status.peek()).toBe("ready");
  expect(compilerRuntime$.retryDeck.peek()).toBeNull();
  expect(getSlidesState()).toMatchObject({ deckPath: "/recovered.mdx", status: "ready", buildErrors: [] });
});
