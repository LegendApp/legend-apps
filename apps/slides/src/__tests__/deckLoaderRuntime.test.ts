// @ts-nocheck Replace native I/O while running the real loader, discovery and retry operations.
import { expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import React from "react";
import { act, create } from "react-test-renderer";
import { getSlidesState, setSlidesState } from "../slidesStore";
import { failedDeckUpdate, shouldDeferDeckUpdate, successfulDeckUpdate } from "../deckBuildPolicy";
import { effectRequests$, reportMissingEffects } from "../effectRequests";
import { deckWatchDirectories } from "../deckWatchDirectories";

const runtime = { path: "/runtime/bun", kind: "bun", version: "1.3.14", source: "system" };
let discover = async () => null, run = async () => success, install = async () => { throw new Error("offline"); };
const success = { exit: { type: "exited", code: 0 }, stdout: JSON.stringify({
  success: true, code: "module.exports.default = function Deck() {};", uniwindCode: "{}", warnings: [], dependencies: [],
}), stderr: "" };
mock.module("../compilerRuntimeCore", () => ({ findRuntime: () => discover(), runtimeArch: async () => "x64", probeRuntime() {}, installPinnedBun: (...args) => install(...args) }));
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

test("launching without a deck does not discover or download a compiler", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let discoveries = 0, downloads = 0, decks = 0;
  discover = async () => { discoveries++; return null; };
  install = async () => { downloads++; throw new Error("offline"); };
  const appMocks = {
    react: React,
    "@legendapp/spark/app": { addAppListener: () => ({ remove: async () => {} }) },
    "@legend-apps/runtime-utils": { ownRegistration: value => value },
    "@legendapp/spark/app/documents": { subscribeToOpenRequests: () => ({ remove: async () => {} }) },
    "./slidesExit": { registerSlidesExitPreparation: () => () => {}, installSlidesExitHandler: () => ({ remove: async () => {} }) },
    "./slidesWindows": { openSlidesPresenterWindow: async () => {} },
    "./slidesStore": { getSlidesState: () => ({ status: "idle" }) },
    "./deckLoader": { getLastDeckPath: () => undefined, loadDeck: async () => { decks++; } },
    "./CompilerRuntimePrompt": { startCompilerRuntimePrefetch: () => { downloads++; } },
  };
  const appModule = { exports: {} };
  const appCode = transformSync(readFileSync(new URL("../App.tsx", import.meta.url), "utf8"), { loader: "tsx", format: "cjs" }).code;
  Function("require", "module", "exports", appCode)(name => appMocks[name] ?? {}, appModule, appModule.exports);
  const App = appModule.exports.App;
  let renderer;
  try {
    await act(() => { renderer = create(React.createElement(App)); });
    expect(discoveries).toBe(0);
    expect(downloads).toBe(0);
    expect(decks).toBe(0);
  } finally { if (renderer) await act(() => renderer.unmount()); }
});

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

test("runtime discovery alone does not download; the first deck installs with a pending prompt and resumes its draft", async () => {
  discover = async () => null;
  let installs = 0, report;
  const download = deferred();
  install = (_host, options) => { installs++; report = options.onProgress; return download.promise; };
  await resolveCompilerRuntime({ refresh: true });
  expect(installs).toBe(0);
  const commands = [];
  run = async options => { commands.push(options); return success; };
  const opening = loadDeck("/first.mdx", false, "draft source");
  await turn();
  expect(installs).toBe(1);
  expect(compilerRuntime$.retryDeck.peek()).toBe("/first.mdx");
  expect(compilerRuntime$.status.peek()).toBe("downloading");
  report({ phase: "verifying", fraction: 1, totalBytes: 100 });
  expect(compilerRuntime$.progress.peek().phase).toBe("verifying");
  discover = async () => runtime;
  download.resolve(runtime);
  expect(await opening).toBe(true);
  expect(commands).toHaveLength(1);
  expect(commands[0]).toMatchObject({ input: "draft source", args: ["/first.mdx", "--transitions", "/transitions", "--draft"] });
  expect(compilerRuntime$.retryDeck.peek()).toBeNull();
  await loadDeck("/second.mdx");
  expect(installs).toBe(1);
});

test("a deck opened during installation supersedes the pending deck without starting another download", async () => {
  discover = async () => null;
  await resolveCompilerRuntime({ refresh: true });
  const download = deferred();
  let installs = 0;
  install = () => { installs++; return download.promise; };
  const openingA = loadDeck("/a.mdx");
  await turn();
  const openingB = loadDeck("/b.mdx");
  expect(compilerRuntime$.retryDeck.peek()).toBe("/b.mdx");
  discover = async () => runtime;
  run = async () => success;
  download.resolve(runtime);
  expect(await openingA).toBe(false);
  expect(await openingB).toBe(true);
  expect(installs).toBe(1);
  expect(getSlidesState().deckPath).toBe("/b.mdx");
  expect(compilerRuntime$.retryDeck.peek()).toBeNull();
});

test("failed on-demand installation leaves the deck prompt and does not automatically retry", async () => {
  discover = async () => null;
  await resolveCompilerRuntime({ refresh: true });
  let installs = 0;
  install = async () => { installs++; throw new Error("offline"); };
  expect(await loadDeck("/failed.mdx")).toBe(false);
  expect(compilerRuntime$.retryDeck.peek()).toBe("/failed.mdx");
  expect(compilerRuntime$.status.peek()).toBe("error");
  expect(compilerRuntime$.error.peek()).toBe("offline");
  expect(installs).toBe(1);
});
