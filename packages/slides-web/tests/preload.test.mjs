import { expect, test } from "bun:test";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { createPreloadManifest } from "../preloadManifest";
import { AssetPreloader } from "../src/preload";

test("preload manifest follows slide usage through component imports, including companion videos", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "slides-preload-"));
  try {
    const deck = path.join(dir, "deck.mdx");
    await fs.writeFile(deck, 'import Later from "./Later";\n\n# First\n\n![First](./first.png)\n\n---\n\n# Second\n\n<Later />\n\n---\n\n<Later />');
    await fs.writeFile(path.join(dir, "Later.tsx"), 'import Nested from "./Nested"; export default Nested;');
    await fs.writeFile(path.join(dir, "Nested.tsx"), 'import poster from "./last image.png"; export default () => poster;');
    const media = ["last image.png", "last image.mp4", "unused.svg", "first.png"].map(file => path.join(dir, file));
    const manifest = await createPreloadManifest(deck, [deck, path.join(dir, "Later.tsx"), path.join(dir, "Nested.tsx"), ...media], media);
    expect(manifest).toEqual([
      { source: "./assets/first.png", slide: 0 },
      { source: "./assets/last%20image.png", slide: 1, slides: [1, 2] },
      { source: "./assets/last%20image.mp4", slide: 1, slides: [1, 2] },
      { source: "./assets/unused.svg", slide: 3 },
    ]);
  } finally { await fs.rm(dir, { recursive: true, force: true }); }
});

async function until(condition) {
  for (let i = 0; i < 200; i++) {
    if (condition()) return;
    await new Promise(resolve => setTimeout(resolve, 10));
  }
  throw new Error("Timed out waiting for preload state");
}

test("preloader serializes full downloads, reprioritizes navigation, deduplicates and continues after failures", async () => {
  const requests = [];
  let release;
  const first = new Promise(resolve => { release = resolve; });
  const server = Bun.serve({ port: 0, async fetch(request) {
    const pathname = new URL(request.url).pathname;
    requests.push(pathname);
    if (pathname === "/a") await first;
    return new Response(pathname, { status: pathname === "/missing" ? 404 : 200 });
  } });
  const originalDocument = globalThis.document;
  globalThis.document = { baseURI: server.url.href };
  const preloader = new AssetPreloader([
    { source: "/a", slide: 0 }, { source: "/b", slide: 1, slides: [1, 8] },
    { source: "/missing", slide: 4 }, { source: "/c", slide: 8 }, { source: "/c", slide: 8 },
  ]);
  try {
    const done = preloader.run();
    void preloader.run();
    await until(() => requests.length === 1);
    preloader.prioritize(8);
    expect(preloader.status.loaded).toBe(0);
    expect(requests).toEqual(["/a"]);
    release();
    await done;
    expect(requests).toEqual(["/a", "/b", "/c", "/missing"]);
    expect(preloader.status).toEqual({ total: 4, loaded: 3, failed: ["/missing"], active: "", complete: true });
    const blob = preloader.source("/a");
    expect(blob.startsWith("blob:")).toBe(true);
    expect(await (await fetch(blob)).text()).toBe("/a");
    expect(preloader.source("/missing")).toBe("/missing");
    preloader.dispose();
    expect(preloader.source("/a")).toBe("/a");
    await expect(fetch(blob)).rejects.toThrow();
  } finally { release(); preloader.dispose(); server.stop(true); globalThis.document = originalDocument; }
});

test("disposal cancels an in-flight download and stops the queue", async () => {
  const requests = [];
  const server = Bun.serve({ port: 0, fetch(request) {
    requests.push(new URL(request.url).pathname);
    return new Response(new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([1])); } }));
  } });
  const originalDocument = globalThis.document;
  globalThis.document = { baseURI: server.url.href };
  const preloader = new AssetPreloader([{ source: "/slow", slide: 0 }, { source: "/next", slide: 1 }]);
  try {
    const done = preloader.run();
    await until(() => requests.length === 1);
    preloader.dispose();
    await done;
    expect(requests).toEqual(["/slow"]);
    expect(preloader.status.loaded).toBe(0);
    expect(preloader.status.complete).toBe(false);
    expect(preloader.status.failed).toEqual([]);
  } finally { preloader.dispose(); server.stop(true); globalThis.document = originalDocument; }
});

test("versioned assets use cache-first requests and publish progress without reusing a changed content URL", async () => {
  const versions = [];
  const cacheModes = [];
  const server = Bun.serve({ port: 0, fetch(request) {
    const version = new URL(request.url).searchParams.get("v");
    versions.push(version);
    return new Response(version);
  } });
  const originalDocument = globalThis.document;
  const originalFetch = globalThis.fetch;
  globalThis.document = { baseURI: server.url.href };
  globalThis.fetch = (source, options) => { cacheModes.push(options?.cache); return originalFetch(source, options); };
  const first = new AssetPreloader([{ source: "/poster.png", slide: 0, version: "first" }]);
  const next = new AssetPreloader([{ source: "/poster.png", slide: 0, version: "changed" }]);
  const progress = [];
  const unsubscribe = first.status$.onChange(({ value }) => progress.push({ loaded: value.loaded, complete: value.complete }));
  try {
    await first.run();
    await next.run();
    expect(versions).toEqual(["first", "changed"]);
    expect(cacheModes).toEqual(["force-cache", "force-cache"]);
    expect(progress.some(value => value.loaded === 1)).toBe(true);
    expect(progress.at(-1)).toEqual({ loaded: 1, complete: true });
    expect(await (await originalFetch(first.source("/poster.png"))).text()).toBe("first");
    expect(await (await originalFetch(next.source("/poster.png"))).text()).toBe("changed");
  } finally { unsubscribe(); first.dispose(); next.dispose(); server.stop(true); globalThis.fetch = originalFetch; globalThis.document = originalDocument; }
});
