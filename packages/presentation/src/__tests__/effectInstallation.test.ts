// @ts-nocheck Exercise real downloads, filesystem transactions and the deck compiler.
import { afterEach, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { installEffectExample, installEffectPacks, resolveInstallation } from "../effectPacks/install";
import { effectLockPath, pinnedPackDirectory, readEffectLock, readPackArchive, sha256, writeEffectLock } from "../effectPacks/storage";
import { compileDeck } from "../compiler";
const cleanups = [];
afterEach(() => cleanups.splice(0).forEach(cleanup => cleanup()));
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slides-install-"));
  const directory = path.join(root, "installed"), deck = path.join(root, "talk.mdx");
  fs.writeFileSync(deck, 'export { sample } from "slides:motion/Pose"\n\n# Installed');
  const archives = {}, packs = {};
  for (const [id, version, source, dependencies] of [
    ["math", "1.0.0", 'export const twice = x => x * 2;', {}],
    ["motion", "1.0.0", 'import { twice } from "slides:math/Pose"; export function sample(x) { "worklet"; return twice(x); }', { math: "1.0.0" }],
    ["motion", "2.0.0", 'export function sample(x) { "worklet"; return x * 3; }', {}],
  ]) {
    const manifest = { id, version, hostApiVersion: 1, capabilities: ["reanimated"], dependencies, exports: { Pose: "./Pose.ts" } };
    const text = JSON.stringify({ schemaVersion: 1, files: { "pack.json": JSON.stringify(manifest), "Pose.ts": source } });
    const url = `/${id}-${version}.json`;
    archives[url] = text;
    packs[id] ??= { latest: version, versions: {} };
    packs[id].versions[version] = { version, sha256: sha256(text), url, bytes: Buffer.byteLength(text),
      hostApiVersion: 1, capabilities: manifest.capabilities, dependencies, exports: manifest.exports };
  }
  const catalog = { schemaVersion: 1, packs, effects: [] };
  let broken = false, requests = 0;
  const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch(request) {
    requests++; const url = new URL(request.url).pathname;
    return new Response(url === "/catalog.json" ? JSON.stringify(catalog) : broken ? "corrupt" : archives[url] ?? "missing", {status: url === "/catalog.json" || archives[url] ? 200 : 404});
  } });
  cleanups.push(() => { server.stop(true); fs.rmSync(root, {recursive: true, force: true}); });
  return { root, directory, deck, catalog, options: { directory, catalogURL: `http://127.0.0.1:${server.port}/catalog.json`, deck },
    corrupt: value => broken = value, requests: () => requests };
}
test("download dependencies atomically, retry idempotently and compile locked versions offline", async () => {
  const f = fixture();
  let result = await compileDeck(f.deck, { effectPacksDirectory: f.directory });
  expect(result.missingEffectPacks).toEqual(["motion"]);
  await installEffectPacks(["motion"], f.options);
  const lock = readEffectLock(f.deck);
  expect(Object.keys(lock.packs).sort()).toEqual(["math", "motion"]);
  const requests = f.requests();
  await installEffectPacks(["motion"], f.options);
  expect(f.requests() - requests).toBe(1); // Catalog only; verified archives are reused.
  const before = f.requests();
  result = await compileDeck(f.deck, { effectPacksDirectory: f.directory });
  expect(result.success, result.errors?.join("\n")).toBe(true);
  expect(f.requests()).toBe(before);
  const module = { exports: {} }; Function("require", "module", "exports", result.code)(() => ({}), module, module.exports);
  expect(module.exports.sample(21)).toBe(42);
  expect(result.dependencies).toContain(effectLockPath(f.deck));
});
test("new versions coexist without changing an existing deck's pin", async () => {
  const f = fixture(); await installEffectPacks(["motion"], f.options);
  const oldLock = fs.readFileSync(effectLockPath(f.deck), "utf8");
  const next = path.join(f.root, "next.mdx"); fs.copyFileSync(f.deck, next);
  f.catalog.packs.motion.latest = "2.0.0";
  await installEffectPacks(["motion"], {...f.options, deck: next});
  expect(readEffectLock(next).packs.motion.version).toBe("2.0.0");
  expect(fs.readFileSync(effectLockPath(f.deck), "utf8")).toBe(oldLock);
  for (const deck of [f.deck, next]) expect((await compileDeck(deck, {effectPacksDirectory: f.directory})).success).toBe(true);
});
test("failed downloads publish no selection or lockfile and retry cleanly", async () => {
  const f = fixture(); f.corrupt(true);
  await expect(installEffectPacks(["motion"], f.options)).rejects.toThrow("checksum");
  expect(fs.existsSync(effectLockPath(f.deck))).toBe(false);
  expect(fs.existsSync(path.join(f.directory,"motion/active.json"))).toBe(false);
  expect(fs.existsSync(path.join(f.directory,".installation.lock"))).toBe(false);
  f.corrupt(false); await installEffectPacks(["motion"], f.options);
  expect((await compileDeck(f.deck, {effectPacksDirectory: f.directory})).success).toBe(true);
});
test("dependency conflicts, edited cache contents and concurrent installations cannot change deck pins", async () => {
  const f = fixture();
  const conflict = {schemaVersion: 1,packs: {math: {version: "2.0.0",sha256: "a".repeat(64)}}};
  expect(() => resolveInstallation(f.catalog,["motion"],conflict)).toThrow();
  fs.mkdirSync(f.directory); fs.writeFileSync(path.join(f.directory,".installation.lock"),JSON.stringify({pid: process.pid,token: "other"}));
  await expect(installEffectPacks(["motion"],f.options)).rejects.toThrow("running");
  fs.unlinkSync(path.join(f.directory,".installation.lock"));
  await installEffectPacks(["motion"],f.options);
  const lock = readEffectLock(f.deck), root = pinnedPackDirectory(f.directory,"motion",lock.packs.motion);
  fs.writeFileSync(path.join(root,"Pose.ts"),'export const sample = () => 999;');
  const result = await compileDeck(f.deck,{effectPacksDirectory: f.directory});
  expect(result.success).toBe(false); expect(result.errors.join("\n")).toContain("source has changed");
});

test("example installation pins its dependencies and retries a stale lease", async () => {
  const f = fixture();
  const snippet = 'export { sample } from "slides:motion/Pose"\n\n# Example';
  f.catalog.effects.push({slug: "pose", title: "Pose", description: "A test effect", pack: "motion", entry: "Pose", symbol: "sample", tags: [], props: [], snippet,
    example: {url: "/example.mdx", sha256: sha256(snippet), bytes: Buffer.byteLength(snippet)}});
  const server = Bun.serve({hostname: "127.0.0.1", port: 0, async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === "/example.mdx") return new Response(snippet);
    return fetch(f.options.catalogURL.replace("/catalog.json",url.pathname));
  }});
  cleanups.push(() => server.stop(true));
  fs.mkdirSync(f.directory);
  fs.writeFileSync(path.join(f.directory,".installation.lock"),JSON.stringify({pid: 2147483647,token: "stale"}));
  const deck = await installEffectExample("pose", {...f.options,catalogURL: `http://127.0.0.1:${server.port}/catalog.json`});
  expect(fs.readFileSync(deck,"utf8")).toBe(snippet);
  expect((await compileDeck(deck,{effectPacksDirectory:f.directory})).success).toBe(true);
  expect(readEffectLock(deck).packs.motion.version).toBe("1.0.0");
  expect(await installEffectExample("pose",{...f.options,catalogURL: `http://127.0.0.1:${server.port}/catalog.json`})).toBe(deck);
  f.catalog.packs.motion.latest = "2.0.0";
  const next = await installEffectExample("pose",{...f.options,catalogURL: `http://127.0.0.1:${server.port}/catalog.json`});
  expect(next).not.toBe(deck);
  expect(readEffectLock(deck).packs.motion.version).toBe("1.0.0");
  expect(readEffectLock(next).packs.motion.version).toBe("2.0.0");
});
test("archives reject escaping and aliased paths and lock writes preserve concurrent edits", () => {
  const f = fixture();
  for (const files of [{"pack.json":"{}","../escape.ts":"export {}"}, {"pack.json":"{}","File.ts":"","file.ts":""}])
    expect(() => readPackArchive(JSON.stringify({schemaVersion:1,files}))).toThrow("Invalid source pack file");
  const lock = {schemaVersion:1,packs:{}};
  writeEffectLock(f.deck,lock);
  fs.writeFileSync(effectLockPath(f.deck),'{"schemaVersion":1,"packs":{},"owner":"other"}');
  expect(() => writeEffectLock(f.deck,lock,JSON.stringify(lock))).toThrow("changed during installation");
  expect(fs.readFileSync(effectLockPath(f.deck),"utf8")).toContain("other");
});
