// @ts-nocheck Replace native I/O while running the real loader, discovery and retry operations.
import { observable } from "@legendapp/state";
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
mock.module("../slidesSettings", () => ({ getCompilerRuntimePathSetting: () => "", setCompilerRuntimePathSetting() {}, useBackgroundIntensitySetting: () => 1 }));
mock.module("@legendapp/spark/files", () => ({ getDirectory: async () => "/Users/me/Library/Application Support/Slides", exists() {}, mkdir() {}, move() {}, remove() {} }));
mock.module("@legendapp/spark/processes", () => ({ runCommand: options => run(options), spawn() {}, resolveCommand() {} }));
mock.module("@legend-apps/runtime-utils", () => ({ decodeProcessText: value => value }));
class CompilerPreparationError extends Error {}
const compilerHelper$ = observable({ retryDeck: null });
let helperFailure = false;
mock.module("../compilerHelper", () => ({
  resolveCompilerHelper: async () => { if (helperFailure) throw new CompilerPreparationError("Rebuild the app or choose Retry Compiler Preparation."); return "/compiler/run"; },
  compilerHelper$, CompilerPreparationError,
}));
globalThis.__DEV__ = false;
const compilerRuntime = await import("../compilerRuntime");
const { compilerRuntime$, resolveCompilerRuntime, changeCompilerRuntime } = compilerRuntime;
const compilerCommand = await import("../compilerCommand");
let sourceFiles = {}, inputVersions = {}, directoryEntries = {}, watchedChange;
const sourceIO = {
  readText: async path => sourceFiles[path] ?? "# Slide",
  stat: async path => ({ type: /\.[^/]+$/.test(path) ? "file" : "directory", size: 10, modifiedAt: inputVersions[path] ?? 0 }),
  list: async path => (directoryEntries[path] ?? []).map(name => ({ name })),
};
const { createDeckReloadQueue } = await import("../deckReloadQueue");
const sourceHelpers = await import("../../../../packages/presentation/src/speakerNotesSource");
const mocks = {
  "./deckReloadQueue": { createDeckReloadQueue },
  "./compilerHelper": await import("../compilerHelper"),
  "./compilerCommand": compilerCommand, "./compilerRuntime": compilerRuntime,
  "./slidesStore": { getSlidesState, setSlidesState },
  "./deckBuildPolicy": { failedDeckUpdate, shouldDeferDeckUpdate, successfulDeckUpdate },
  "./effectRequests": { effectRequests$, reportMissingEffects },
  "./deckWatchDirectories": { deckWatchDirectories },
  "./transitionLibrary": { transitionDirectoryPath: () => "/transitions" },
  "./slidesPreferences": { rememberDeckPath() {} },
  "@legend-apps/runtime-utils": { decodeProcessText: value => value, ownRegistration: () => ({ remove: async () => {} }) },
  "@legendapp/spark/files": { ...sourceIO, watch: async (_path, changed) => { watchedChange = changed; return { remove() {} }; } },
  "@legendapp/spark/app/documents": { noteRecentDocument() {} },
  uniwind: { Uniwind: { __reinit() {} } },
};
const require = createRequire(new URL("../../../../packages/presentation/package.json", import.meta.url));
const { transformSync } = require("esbuild");
const notesModule = { exports: {} };
const notesCode = transformSync(readFileSync(new URL("../deckNotesReload.ts", import.meta.url), "utf8"), { loader: "ts", format: "cjs" }).code;
Function("require", "module", "exports", notesCode)(() => sourceHelpers, notesModule, notesModule.exports);
mocks["./deckNotesReload"] = notesModule.exports;
const module = { exports: {} };
const code = transformSync(readFileSync(new URL("../deckLoader.ts", import.meta.url), "utf8"), { loader: "ts", format: "cjs" }).code;
Function("require", "module", "exports", code)(name => mocks[name] ?? {}, module, module.exports);
const { loadDeck, previewDeckSource, invalidateDeckBuild, retryCompilerPreparation } = module.exports;
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
    "./compilerRuntime": compilerRuntime,
  };
  const appModule = { exports: {} };
  const appCode = transformSync(readFileSync(new URL("../App.tsx", import.meta.url), "utf8"), { loader: "tsx", format: "cjs" }).code;
  Function("require", "module", "exports", appCode)(name => appMocks[name] ?? {}, appModule, appModule.exports);
  const App = appModule.exports.App;
  let renderer;
  try {
    await act(() => { renderer = create(React.createElement(App)); });
    await turn();
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
  expect(getSlidesState()).toMatchObject({ status: "building", buildErrors: [] });
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

for (const draft of [false, true]) {
  test(`${draft ? "draft preview" : "deck"} opened during a Settings download compiles once and completes the original load`, async () => {
    discover = async () => null;
    await resolveCompilerRuntime({ refresh: true });
    const download = deferred(), compilation = deferred();
    let installs = 0;
    install = () => { installs++; return download.promise; };
    const commands = [];
    run = options => { commands.push(options); return compilation.promise; };
    const installing = changeCompilerRuntime(compilerRuntime.downloadCompilerRuntime);
    await turn();
    const opening = draft ? previewDeckSource("/settings.mdx", "draft source") : loadDeck("/settings.mdx");
    expect(compilerRuntime$.retryDeck.peek()).toBe("/settings.mdx");
    await turn();
    expect(commands).toHaveLength(0);
    discover = async () => runtime;
    download.resolve(runtime);
    await turn();
    compilation.resolve({ ...success, stdout: JSON.stringify({ ...JSON.parse(success.stdout), sourceSlideEnds: [12] }) });
    const [opened] = await Promise.all([opening, installing]);
    expect(opened).toEqual(draft ? { success: true, slideEnds: [12] } : true);
    expect(commands).toHaveLength(1);
    expect(commands[0]).toMatchObject({
      input: draft ? "draft source" : undefined,
      args: ["/settings.mdx", "--transitions", "/transitions", ...(draft ? ["--draft"] : [])],
    });
    expect(installs).toBe(1);
    expect(getSlidesState()).toMatchObject({ deckPath: "/settings.mdx", status: "ready", buildErrors: [] });
    expect(compilerRuntime$.retryDeck.peek()).toBeNull();
  });
}

test("failed on-demand installation leaves the deck prompt and subsequent loads require an explicit retry", async () => {
  discover = async () => null;
  await resolveCompilerRuntime({ refresh: true });
  let installs = 0;
  install = async () => { installs++; throw new Error("offline"); };
  expect(await loadDeck("/failed.mdx")).toBe(false);
  expect(compilerRuntime$.retryDeck.peek()).toBe("/failed.mdx");
  expect(compilerRuntime$.status.peek()).toBe("error");
  expect(compilerRuntime$.error.peek()).toBe("offline");
  expect(installs).toBe(1);
  expect(await loadDeck("/failed.mdx", false)).toBe(false);
  expect(installs).toBe(1);
  expect(compilerRuntime$.status.peek()).toBe("error");
  expect(compilerRuntime$.error.peek()).toBe("offline");
  install = async () => { installs++; discover = async () => runtime; };
  run = async () => success;
  await changeCompilerRuntime(compilerRuntime.downloadCompilerRuntime);
  expect(installs).toBe(2);
  expect(compilerRuntime$.error.peek()).toBe("");
  expect(getSlidesState()).toMatchObject({ deckPath: "/failed.mdx", status: "ready" });
});

test("helper preparation failure registers only the current deck and a retry opens it", async () => {
  discover = async () => runtime;
  await resolveCompilerRuntime({ refresh: true });
  helperFailure = true;
  try {
    expect(await loadDeck("/helper-first.mdx")).toBe(false);
    expect(compilerHelper$.retryDeck.peek()).toBe("/helper-first.mdx");
    expect(getSlidesState().buildErrors.join(" ")).toContain("Retry Compiler Preparation");
    expect(await loadDeck("/helper-latest.mdx", false, "# Unsaved draft")).toBe(false);
    expect(compilerHelper$.retryDeck.peek()).toBe("/helper-latest.mdx");
    helperFailure = false;
    let input;
    run = async options => { input = options.input; return success; };
    expect(await retryCompilerPreparation()).toBe(true);
    expect(input).toBe("# Unsaved draft");
    invalidateDeckBuild();
    expect(retryCompilerPreparation()).toBeUndefined();
    expect(compilerHelper$.retryDeck.peek()).toBeNull();
  } finally { helperFailure = false; }
});

test("a notes-only watched save updates notes without compiling, replacing the deck or resetting playback", async () => {
  discover = async () => runtime;
  await resolveCompilerRuntime({ refresh: true });
  const path = "/notes/deck.mdx", helper = "/notes/helper.tsx";
  sourceFiles = { [path]: "---\ntitle: Deck\n---\n# Slide\n\n<!-- old -->\n" };
  directoryEntries = { "/notes": ["deck.mdx", "helper.tsx"] };
  inputVersions = {};
  let compilations = 0;
  const previewIdentity = { deck: "a".repeat(64), content: "b".repeat(64) };
  run = async () => { compilations++; return { ...success, stdout: JSON.stringify({ ...JSON.parse(success.stdout), dependencies: [path, helper], previewIdentity }) }; };
  expect(await loadDeck(path)).toBe(true);
  setSlidesState({ slides: [{ metadata: { steps: 2 }, notes: "old" }], currentStep: 1 });
  const before = getSlidesState();
  expect(before.previewIdentity).toEqual(previewIdentity);
  sourceFiles[path] = sourceHelpers.updateSlideSpeakerNotes(sourceFiles[path], 0, "new notes");
  watchedChange();
  await new Promise(resolve => setTimeout(resolve, 160));
  const after = getSlidesState();
  expect(compilations).toBe(1);
  expect(after.slides[0].notes).toBe("new notes");
  for (const key of ["component", "revision", "currentSlide", "currentStep", "slideStartedAt", "stepStartedAt", "templates", "transitions", "previewIdentity"]) expect(after[key]).toBe(before[key]);
  // Atomic saves can cause more than one invalidation, even after metadata was refreshed.
  watchedChange();
  await new Promise(resolve => setTimeout(resolve, 160));
  expect(compilations).toBe(1);
  // A coalesced helper edit cannot be mistaken for another notes-only save.
  sourceFiles[path] = sourceHelpers.updateSlideSpeakerNotes(sourceFiles[path], 0, "newer notes");
  inputVersions[helper] = 1;
  watchedChange();
  await new Promise(resolve => setTimeout(resolve, 160));
  expect(compilations).toBe(2);
  // Frontmatter and ordinary slide edits must also use the compiler.
  sourceFiles[path] = sourceFiles[path].replace("title: Deck", "title: Changed");
  watchedChange();
  await new Promise(resolve => setTimeout(resolve, 160));
  expect(compilations).toBe(3);
  sourceFiles[path] += "\nChanged slide content\n";
  watchedChange();
  await new Promise(resolve => setTimeout(resolve, 160));
  expect(compilations).toBe(4);
  // Even with a notes edit, a new platform-specific import invalidates input resolution.
  sourceFiles[path] = sourceHelpers.updateSlideSpeakerNotes(sourceFiles[path], 0, "last notes");
  directoryEntries["/notes"].push("helper.macos.tsx");
  watchedChange();
  await new Promise(resolve => setTimeout(resolve, 160));
  expect(compilations).toBe(5);
});

test("notes classification keeps literal comments and frontmatter in the visual input key", () => {
  const original = "---\ntitle: '<!-- config -->'\n---\nexport const example = '<!-- JS -->';\n\n# Slide\n\n```text\n<!-- literal -->\n```\n\n<!-- notes -->\n";
  const before = notesModule.exports.deckNotesSource(original);
  expect(before.notes).toEqual(["notes"]);
  for (const notes of ["new notes", "", "More\n\n---\n\nnotes"]) {
    const source = sourceHelpers.updateSlideSpeakerNotes(original, 0, notes);
    const after = notesModule.exports.deckNotesSource(source);
    expect(after.key).toBe(before.key);
    expect(after.notes).toEqual([notes]);
  }
  for (const marker of ["config", "JS", "literal", "# Slide"]) expect(notesModule.exports.deckNotesSource(original.replace(marker, marker + " changed")).key).not.toBe(before.key);
});

test("a directory changed during compilation cannot seed a notes-only cache", async () => {
  expect.assertions(1);
  try {
    await notesModule.exports.deckNotesInputs("/notes/deck.mdx", ["/notes/deck.mdx", "/notes/helper.tsx"], ["/notes"], {
      stat: async path => ({ type: path === "/notes" ? "directory" : "file", size: 10, modifiedAt: path === "/notes" ? 11 : 0 }),
      list: async () => [],
    }, 10);
  } catch (error) { expect(String(error)).toContain("directory changed during compilation"); }
});

test("recompiled note saves keep the mounted audience visible at its current slide and step", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const { useValue } = await import("@legendapp/state/react");
  const { reactUI, transactions } = await import("./uiClockMock");
  const skia = { ...await import("@shopify/react-native-skia") };
  mock.module("../../../../packages/presentation/node_modules/@shopify/react-native-skia", () => skia);
  const { BackgroundHost, usePreparationTask } = await import("@legend-apps/presentation");
  const pending = observable(false);
  mock.module("../DeckRenderer", () => ({
    DeckRenderer: props => {
      usePreparationTask(useValue(pending));
      return React.createElement("deck", props);
    },
    SlideCanvas: "canvas", SlideBackgroundHost: BackgroundHost,
  }));
  const { AudienceWindow } = await import("../AudienceWindow");
  const { setCurrentSlide } = await import("../slidesStore");
  const initial = getSlidesState();
  const path = "/notes-revision/deck.mdx";
  let tree;
  try {
    discover = async () => runtime;
    await resolveCompilerRuntime({ refresh: true });
    sourceFiles = { [path]: "# One\n\n---\n\n# Two\n\n<!-- old -->\n\n---\n\n# Three" };
    directoryEntries = { "/notes-revision": ["deck.mdx"] };
    // A directory changed during compilation cannot seed the notes-only cache.
    inputVersions = { "/notes-revision": Date.now() + 60_000 };
    run = async () => ({ ...success, stdout: JSON.stringify({ ...JSON.parse(success.stdout), dependencies: [path] }) });
    await loadDeck(path, false);
    setSlidesState({ currentSlide: 1, currentStep: 2, deckLocked: false,
      slides: Array.from({ length: 3 }, () => ({ metadata: { steps: 3 }, notes: "" })), config: { transition: "fade" } });
    await act(async () => { tree = create(React.createElement(AudienceWindow)); });
    const layer = index => tree.root.findAllByType("animated-view")
      .filter(node => node.props.accessibilityElementsHidden !== undefined)
      .find(node => node.findByType("deck").props.targetIndex === index);
    const save = async notes => {
      const revision = getSlidesState().revision;
      await act(async () => {
        await sourceHelpers.persistSlideSpeakerNotesWithFileAccess(path, 1, notes, {
          read: sourceIO.readText,
          writeIfUnchanged: async (_path, expected, next) => {
            expect(sourceFiles[path]).toBe(expected);
            sourceFiles[path] = next;
            return true;
          },
        });
        watchedChange();
        await new Promise(resolve => setTimeout(resolve, 160));
      });
      expect(getSlidesState()).toMatchObject({ revision: revision + 1, currentSlide: 1, currentStep: 2 });
    };
    for (const notes of ["first save", "second save"]) {
      await save(notes);
      expect(layer(1).props.style[2].zIndex).toBe(1);
      expect(layer(1).findByType("deck").props.isPreparing).toBe(false);
    }
    await act(async () => { pending.set(true); });
    await save("waiting for preparation");
    expect(layer(1).props.style[2].zIndex).toBe(-1);
    expect(layer(1).findByType("deck").props.isPreparing).toBe(true);
    await act(async () => { pending.set(false); });
    expect(layer(1).props.style[2].zIndex).toBe(1);
    await act(async () => { setCurrentSlide(2); });
    const progress = tree.root.findAll(node => node.type?.name === "AudienceSlide")
      .find(node => node.props.index === 2).props.progress;
    expect(layer(2).props.style[2].zIndex).toBe(-1);
    await act(async () => { progress.value = 0.2; reactUI(); });
    expect(layer(2).props.style[2].zIndex).toBe(2);
    expect(layer(1).findByType("deck").props.isOutgoing).toBe(true);
  } finally {
    if (tree) await act(async () => { tree.unmount(); });
    transactions.length = 0;
    setSlidesState(initial);
  }
});
