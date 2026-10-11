// @ts-nocheck Native I/O is replaced to exercise discovery and retry ordering.
import { beforeEach, expect, mock, test } from "bun:test";

const runtime = { path: "/runtime/bun", kind: "bun", version: "1.3.14", source: "system" };
let discover, install, probe, selected = "", loaded = [], commands = [], commandResults = [], arch;
mock.module("../compilerRuntimeCore", () => ({
  findRuntime: (...args) => discover(...args), installPinnedBun: (...args) => install(...args),
  probeRuntime: (...args) => probe(...args), runtimeArch: () => arch(),
}));
mock.module("../slidesSettings", () => ({ getCompilerRuntimePathSetting: () => selected, setCompilerRuntimePathSetting: value => { selected = value; } }));
mock.module("@legendapp/spark/files", () => ({ getDirectory: async () => "/Users/me/Library/Application Support/Slides", exists() {}, mkdir() {}, move() {}, remove() {} }));
mock.module("@legendapp/spark/processes", () => ({ spawn() {}, resolveCommand() {}, runCommand: async options => { commands.push(options); return commandResults.shift(); } }));
mock.module("@legend-apps/runtime-utils", () => ({ decodeProcessText: () => "" }));
mock.module("../deckLoader", () => ({ loadDeck: async path => { loaded.push(path); } }));
globalThis.__DEV__ = false;
const { compilerRuntime$, resolveCompilerRuntime, downloadCompilerRuntime, setCustomCompilerRuntime, prefetchCompilerRuntime, changeCompilerRuntime, CompilerRuntimeMissingError } = await import("../compilerRuntime");
const { runCompilerCommand } = await import("../compilerCommand");

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}
const turn = () => new Promise(done => setTimeout(done, 0));
beforeEach(async () => {
  arch = async () => "x64";
  discover = async () => runtime;
  install = async () => runtime;
  probe = async () => runtime;
  selected = ""; loaded = []; commands = []; commandResults = [];
  compilerRuntime$.assign({ status: "unknown", runtime: null, retryDeck: null, error: "" });
  await resolveCompilerRuntime({ refresh: true });
});

test("only the latest overlapping discovery can publish state", async () => {
  const old = deferred(), latest = deferred();
  discover = () => old.promise;
  const first = resolveCompilerRuntime({ refresh: true });
  await turn();
  discover = () => latest.promise;
  const second = resolveCompilerRuntime({ refresh: true });
  await turn();
  latest.resolve(runtime);
  await second;
  old.resolve(null);
  expect(await first).toEqual(runtime);
  expect(compilerRuntime$.status.peek()).toBe("ready");
  expect(compilerRuntime$.runtime.peek()).toEqual(runtime);
  expect(compilerRuntime$.arch.peek()).toBe("x64");
});

test("discovery finishing during a download cannot overwrite installation state", async () => {
  const old = deferred(), download = deferred();
  discover = () => old.promise;
  const first = resolveCompilerRuntime({ refresh: true });
  await turn();
  install = () => download.promise;
  const installing = downloadCompilerRuntime();
  old.resolve(null);
  await turn();
  expect(compilerRuntime$.status.peek()).toBe("downloading");
  discover = async () => runtime;
  download.resolve(runtime);
  await installing;
  expect(await first).toEqual(runtime);
  expect(compilerRuntime$.status.peek()).toBe("ready");
});

test("detect, automatic, custom, download and prefetch share one pending-deck retry", async () => {
  for (const operation of [
    () => resolveCompilerRuntime({ refresh: true }), () => setCustomCompilerRuntime(null),
    () => setCustomCompilerRuntime("/chosen/engine"), () => downloadCompilerRuntime(), prefetchCompilerRuntime,
  ]) {
    compilerRuntime$.retryDeck.set("/deck.mdx");
    const before = loaded.length;
    await Promise.all([changeCompilerRuntime(operation), changeCompilerRuntime(operation)]);
    expect(loaded.length).toBe(before + 1);
    expect(compilerRuntime$.retryDeck.peek()).toBeNull();
  }
  expect(loaded).toEqual(Array(5).fill("/deck.mdx"));
});

test("prefetch completing a shared background download retries the failed deck", async () => {
  discover = async () => null;
  await resolveCompilerRuntime({ refresh: true });
  const download = deferred();
  let installs = 0;
  install = () => { installs++; return download.promise; };
  const prefetched = changeCompilerRuntime(prefetchCompilerRuntime);
  await turn();
  compilerRuntime$.retryDeck.set("/deck.mdx");
  const clicked = changeCompilerRuntime(downloadCompilerRuntime);
  discover = async () => runtime;
  download.resolve(runtime);
  await Promise.all([prefetched, clicked]);
  expect(installs).toBe(1);
  expect(loaded).toEqual(["/deck.mdx"]);
});

test("failed download preserves the deck for a later successful change", async () => {
  compilerRuntime$.retryDeck.set("/deck.mdx");
  install = async () => { throw new Error("offline"); };
  await changeCompilerRuntime(downloadCompilerRuntime);
  expect(loaded).toEqual([]);
  expect(compilerRuntime$.retryDeck.peek()).toBe("/deck.mdx");
  expect(compilerRuntime$.status.peek()).toBe("error");
  await changeCompilerRuntime(() => resolveCompilerRuntime({ refresh: true }));
  expect(loaded).toEqual(["/deck.mdx"]);
});

const result = code => ({ exit: { type: "exited", code }, stdout: [], stderr: [], timedOut: false });
test("missing runtime refreshes discovery once before giving up", async () => {
  discover = async () => null;
  await resolveCompilerRuntime({ refresh: true });
  let checks = 0;
  discover = async () => { checks++; return null; };
  await expect(runCompilerCommand(["/deck.mdx"])).rejects.toBeInstanceOf(CompilerRuntimeMissingError);
  expect(checks).toBe(1);
  expect(commands).toEqual([]);
  expect(compilerRuntime$.status.peek()).toBe("missing");
});

test("exit 127 refreshes discovery and launches with the replacement runtime", async () => {
  let checks = 0;
  discover = async () => { checks++; return { ...runtime, path: "/replacement/node" }; };
  commandResults = [result(127), result(0)];
  expect((await runCompilerCommand(["/deck.mdx"], { input: "draft", timeoutMs: 123 })).exit.code).toBe(0);
  expect(checks).toBe(1);
  expect(commands.map(command => command.env.LEGEND_SLIDES_RUNTIME)).toEqual(["/runtime/bun", "/replacement/node"]);
  expect(commands[1]).toMatchObject({ args: ["/deck.mdx"], input: "draft", timeoutMs: 123 });
});

test("a second exit 127 fails with the runtime prompt instead of looping", async () => {
  commandResults = [result(127), result(127)];
  await expect(runCompilerCommand(["/deck.mdx"])).rejects.toBeInstanceOf(CompilerRuntimeMissingError);
  expect(commands).toHaveLength(2);
  expect(compilerRuntime$.status.peek()).toBe("missing");
  expect(compilerRuntime$.runtime.peek()).toBeNull();
});

test("a cached missing runtime refreshes successfully when the user installs one", async () => {
  discover = async () => null;
  await resolveCompilerRuntime({ refresh: true });
  discover = async () => runtime;
  commandResults = [result(0)];
  expect((await runCompilerCommand(["/deck.mdx"])).exit.code).toBe(0);
  expect(commands).toHaveLength(1);
  expect(compilerRuntime$.status.peek()).toBe("ready");
});

test("superseded deck builds cancel after discovery and before spawning the compiler", async () => {
  await expect(runCompilerCommand(["/old.mdx"], {}, () => { throw new Error("superseded"); })).rejects.toThrow("superseded");
  expect(commands).toEqual([]);
});

test("older discovery waits when the latest discovery is still pending", async () => {
  const old = deferred(), latest = deferred();
  discover = () => old.promise;
  const first = resolveCompilerRuntime({ refresh: true });
  await turn();
  discover = () => latest.promise;
  const second = resolveCompilerRuntime({ refresh: true });
  await turn();
  old.resolve(null);
  let completed = false;
  void first.then(() => { completed = true; });
  await turn();
  expect(completed).toBe(false);
  latest.resolve(runtime);
  expect(await first).toEqual(runtime);
  expect(await second).toEqual(runtime);
});

test("architecture failure leaves discovery usable and the prompt enabled", async () => {
  arch = async () => { throw new Error("uname failed"); };
  discover = async () => null;
  expect(await resolveCompilerRuntime({ refresh: true })).toBeNull();
  expect(compilerRuntime$.status.peek()).toBe("missing");
  expect(compilerRuntime$.arch.peek()).toBeNull();
});

test("a late second exit 127 cannot invalidate a newer discovery, even at the same path", async () => {
  const completion = deferred();
  commandResults = [result(127), completion.promise];
  const running = runCompilerCommand(["/old.mdx"]);
  await turn();
  expect(commands).toHaveLength(2);
  await resolveCompilerRuntime({ refresh: true });
  completion.resolve(result(127));
  await expect(running).rejects.toBeInstanceOf(CompilerRuntimeMissingError);
  expect(compilerRuntime$.status.peek()).toBe("ready");
  expect(compilerRuntime$.runtime.peek()).toEqual(runtime);
});

test("a late second exit 127 preserves active download progress", async () => {
  const completion = deferred(), download = deferred();
  commandResults = [result(127), completion.promise];
  const running = runCompilerCommand(["/deck.mdx"]);
  await turn();
  install = () => download.promise;
  const installing = downloadCompilerRuntime();
  compilerRuntime$.progress.set(0.5);
  completion.resolve(result(127));
  await expect(running).rejects.toBeInstanceOf(CompilerRuntimeMissingError);
  expect(compilerRuntime$.status.peek()).toBe("downloading");
  expect(compilerRuntime$.progress.peek()).toBe(0.5);
  download.resolve(runtime);
  await installing;
});

test("superseded commands check cancellation after completion before invalidating or retrying", async () => {
  for (const attempt of [0, 1]) {
    const completion = deferred();
    commandResults = attempt ? [result(127), completion.promise] : [completion.promise];
    let cancelled = false;
    const running = runCompilerCommand(["/old.mdx"], {}, () => { if (cancelled) throw new Error("superseded"); });
    await turn();
    const count = commands.length;
    cancelled = true;
    completion.resolve(result(127));
    await expect(running).rejects.toThrow("superseded");
    expect(commands).toHaveLength(count);
    expect(compilerRuntime$.status.peek()).toBe("ready");
  }
});

test("fresh deck discovery waits for an active install instead of caching missing state", async () => {
  const download = deferred();
  let checks = 0;
  discover = async () => { checks++; return runtime; };
  install = () => download.promise;
  const installing = downloadCompilerRuntime();
  const openingDeck = resolveCompilerRuntime({ refresh: true });
  await turn();
  expect(checks).toBe(0);
  expect(compilerRuntime$.status.peek()).toBe("downloading");
  download.resolve(runtime);
  expect(await openingDeck).toEqual(runtime);
  expect(await installing).toEqual(runtime);
  expect(checks).toBe(1);
});
