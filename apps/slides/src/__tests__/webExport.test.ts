// @ts-nocheck Native dialogs and processes are replaced to exercise export lifecycle ordering.
import { beforeEach, expect, mock, test } from "bun:test";
let pick, prepare, command, reveal, calls, deckPath;
mock.module("@legendapp/spark/dialogs", () => ({ openFileDialog: options => pick(options) }));
mock.module("@legendapp/spark/files", () => ({ revealInFileManager: path => reveal(path) }));
mock.module("@legend-apps/runtime-utils", () => ({ decodeProcessText: value => value ?? "" }));
mock.module("../compilerCommand", () => ({ runCompilerCommand: (...args) => command(...args) }));
mock.module("../deckLoader", () => ({ parseCompilerResult: JSON.parse }));
mock.module("../slidesExit", () => ({ prepareSlidesExit: () => prepare() }));
mock.module("../slidesStore", () => ({ getSlidesState: () => ({ deckPath }) }));
mock.module("../transitionLibrary", () => ({ transitionDirectoryPath: () => "/transitions" }));
const { webExport$, exportDeckToHTML, cancelWebExport } = await import("../webExport");
const { effectRequests$ } = await import("../effectRequests");
const result = value => ({ stdout: JSON.stringify(value), stderr: "", aborted: false, timedOut: false });
function deferred() { let resolve; const promise = new Promise(done => { resolve = done; }); return { promise, resolve }; }
beforeEach(() => {
  deckPath = "/source/deck.mdx"; calls = [];
  prepare = async () => true;
  pick = async () => ({ canceled: false, paths: ["/destination"] });
  command = async (args, options) => { calls.push({ args, options }); return result({ success: true, path: "/destination", warnings: ["Remote URL requires network: https://example.com/image.png"] }); };
  reveal = async path => { calls.push({ revealed: path }); };
  webExport$.assign({ status: "idle", message: "", warnings: [] });
  effectRequests$.pending.set(null);
});

test("saves before choosing a folder and runs the shared helper with progress and reveal", async () => {
  let saved = false;
  prepare = async () => { saved = true; return true; };
  pick = async () => { expect(saved).toBe(true); return { canceled: false, paths: ["/destination"] }; };
  const run = command;
  command = async (args, options) => {
    options.onOutput({ stream: "stderr", bytes: '{"exportProgress":{"step":2,"steps":5,' });
    options.onOutput({ stream: "stderr", bytes: '"label":"Bundling player"}}\nother diagnostic\n' });
    expect(webExport$.label.peek()).toBe("Bundling player");
    return run(args, options);
  };
  await exportDeckToHTML();
  expect(calls[0].args).toEqual(["/source/deck.mdx", "--export-html", "/destination", "--transitions", "/transitions"]);
  expect(calls[0].options.signal).toBeInstanceOf(AbortSignal);
  expect(calls[1]).toEqual({ revealed: "/destination" });
  expect(webExport$.status.peek()).toBe("done");
  expect(webExport$.warnings.peek()).toHaveLength(1);
});

test("reentrant actions cannot open a second picker; dialog cancellation runs nothing", async () => {
  const choosing = deferred(); let picked = 0;
  pick = () => { picked++; return choosing.promise; };
  const first = exportDeckToHTML();
  await exportDeckToHTML();
  choosing.resolve({ canceled: true, paths: [] });
  await first;
  expect(picked).toBe(1); expect(calls).toEqual([]); expect(webExport$.status.peek()).toBe("idle");
});

test("save cancellation and picker errors settle the action and allow retry", async () => {
  prepare = async () => false;
  await exportDeckToHTML(); expect(calls).toEqual([]);
  expect(webExport$.status.peek()).toBe("error");
  expect(webExport$.message.peek()).toContain("Save your changes and try again");
  prepare = async () => true;
  pick = async () => { throw new Error("Folder picker unavailable"); };
  await exportDeckToHTML(); expect(webExport$.message.peek()).toBe("Folder picker unavailable");
  expect(webExport$.status.peek()).toBe("error");
  pick = async () => ({ canceled: true, paths: [] });
  await exportDeckToHTML(); expect(webExport$.status.peek()).toBe("idle");
});

test("cancel aborts the running process and never reveals a folder or reports an error", async () => {
  const launched = deferred(), stopped = deferred(); let signal;
  command = (args, options) => { signal = options.signal; launched.resolve(); return stopped.promise; };
  const running = exportDeckToHTML();
  await launched.promise;
  cancelWebExport(); expect(signal.aborted).toBe(true);
  stopped.resolve({ aborted: true }); await running;
  expect(calls).toEqual([]); expect(webExport$.status.peek()).toBe("idle");
});

test("missing packs offer the existing install action for the captured source deck", async () => {
  command = async () => { deckPath = "/another.mdx"; return result({ success: false, errors: ["deck.mdx:7:2: Unexpected closing tag"], missingEffectPacks: ["animation"] }); };
  await exportDeckToHTML();
  expect(effectRequests$.pending.peek()).toEqual({ path: "/source/deck.mdx", packs: ["animation"] });
  expect(webExport$.message.peek()).toContain("Install Required Effects");
  expect(webExport$.message.peek()).toContain("deck.mdx:7:2: Unexpected closing tag");
  expect(webExport$.status.peek()).toBe("error"); expect(calls).toEqual([]);
});

test("compile diagnostics and timeout survive without a success reveal", async () => {
  command = async () => result({ success: false, errors: ["/source/deck.mdx:7:2: Unexpected closing tag"] });
  await exportDeckToHTML(); expect(webExport$.message.peek()).toContain("deck.mdx:7:2");
  command = async () => ({ timedOut: true });
  await exportDeckToHTML(); expect(webExport$.message.peek()).toContain("10 minutes");
  command = async () => ({ stdout: "", stderr: "Exporter crashed: permission denied" });
  await exportDeckToHTML(); expect(webExport$.message.peek()).toContain("permission denied"); expect(calls).toEqual([]);
});

test("Finder failure preserves export success and gives its usable folder path", async () => {
  reveal = async () => { throw new Error("Finder unavailable"); };
  await exportDeckToHTML();
  expect(webExport$.status.peek()).toBe("done"); expect(webExport$.message.peek()).toContain("/destination");
  expect(webExport$.message.peek()).toContain("open this folder manually");
});
