// @ts-nocheck Exercise real downloads, filesystem transactions and the deck compiler.
import { afterEach, expect, test } from "bun:test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { gunzipSync } from "node:zlib";
import { catalogResourceURL, installEffectExample, installEffectPacks, loadEffectCatalog, removeEffectPack, resolveInstallation } from "../effectPacks/install";
import { effectLockPath, pinnedPackDirectory, readEffectLock, readPackArchive, sha256, writeEffectLock } from "../effectPacks/storage";
import { compileDeck } from "../compiler";
import { defaultEffectPacksDirectory } from "../compiler/effectPacks";
const cleanups = [];
afterEach(() => cleanups.splice(0).forEach(cleanup => cleanup()));
async function withEnv(name, value, work) {
  const previous = process.env[name];
  process.env[name] = value;
  try { await work(); }
  finally { if (previous === undefined) delete process.env[name]; else process.env[name] = previous; }
}
function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "slides-install-"));
  const directory = path.join(root, "installed"), deck = path.join(root, "talk.mdx");
  fs.writeFileSync(deck, 'export { sample } from "slides:motion/Pose"\n\n# Installed');
  const archives = {}, packs = {};
  for (const [id, version, source, dependencies] of [
    ["math", "2.0.0", 'export const twice = x => x * 4;', {}],
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
  packs.math.latest = "1.0.0";
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
test("catalog rejects malformed preview fields", async () => {
  const f = fixture();
  f.catalog.effects.push({ slug: "pose", pack: "motion", entry: "Pose", title: "Pose", description: "", symbol: "sample", tags: [], props: [], snippet: "",
    example: { url: "/example.mdx", sha256: "e".repeat(64), bytes: 1 }, preview: { poster: null, renderer: "video" } });
  await expect(loadEffectCatalog(f.options.catalogURL)).rejects.toThrow("Invalid catalog effect");
  f.catalog.effects[0].preview = { poster: "/pose.png", video: 5, renderer: "video" };
  await expect(loadEffectCatalog(f.options.catalogURL)).rejects.toThrow("Invalid catalog effect");
});
test("unlocked decks use installed packs by default in development", async () => {
  const f = fixture();
  await withEnv("LEGEND_SLIDES_EFFECT_PACKS", f.directory, async () => {
    expect(defaultEffectPacksDirectory()).toBe(f.directory);
    await installEffectPacks(["motion"], { ...f.options, deck: undefined });
    expect((await compileDeck(f.deck)).success).toBe(true);
  });
});
test("removal refuses active dependents and skips the installation space check", async () => {
  const f = fixture();
  await installEffectPacks(["motion"], { ...f.options, deck: undefined });
  await expect(removeEffectPack("math", { directory: f.directory })).rejects.toThrow('installed pack "motion" depends on it');
  expect(fs.existsSync(path.join(f.directory, "math"))).toBe(true);
  await withEnv("LEGEND_SLIDES_EFFECTS_DISK_RESERVE_BYTES", String(Number.MAX_SAFE_INTEGER), () => removeEffectPack("motion", { directory: f.directory }));
  expect(fs.existsSync(path.join(f.directory, "motion"))).toBe(false);
  fs.mkdirSync(path.join(f.directory, "broken"));
  fs.writeFileSync(path.join(f.directory, "broken/active.json"), "{");
  const corruptPin = { version: "1.0.0", sha256: "a".repeat(64) };
  const corruptManifest = pinnedPackDirectory(f.directory, "corrupt", corruptPin);
  fs.mkdirSync(corruptManifest, { recursive: true });
  fs.writeFileSync(path.join(f.directory, "corrupt/active.json"), JSON.stringify(corruptPin));
  fs.writeFileSync(path.join(corruptManifest, "pack.json"), "{");
  await removeEffectPack("math", { directory: f.directory });
  expect(fs.existsSync(path.join(f.directory, "math"))).toBe(false);
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
test("the compiler CLI lists, installs with progress, compiles from Application Support and removes packs", async () => {
  const f = fixture(), script = path.resolve(import.meta.dirname, "../../../../scripts/compile-slides.ts");
  const effects = path.join(f.root, "Library/Application Support/Legend Slides/effects");
  const env = { ...process.env, HOME: f.root, LEGEND_SLIDES_EFFECTS_CATALOG: f.options.catalogURL };
  delete env.LEGEND_SLIDES_EFFECT_PACKS;
  const run = async (...args) => {
    const child = Bun.spawn([process.execPath, script, ...args], { env, stdout: "pipe", stderr: "pipe" });
    const [stdout, stderr] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited]);
    const envelope = JSON.parse(stdout);
    return { result: JSON.parse(gunzipSync(Buffer.from(envelope.data, "base64")).toString()), stderr };
  };
  const listed = await run("--effect-catalog");
  expect(listed.result.url).toBe(f.options.catalogURL);
  expect(Object.keys(listed.result.catalog.packs).sort()).toEqual(["math", "motion"]);
  const installed = await run("--effect-action", "legend-slides://effects/install?pack=motion&version=1.0.0");
  expect(installed.result.success).toBe(true);
  const progress = installed.stderr.trim().split("\n").map(line => JSON.parse(line).effectProgress);
  expect(progress.at(-1)).toEqual({ pack: "motion", receivedBytes: f.catalog.packs.motion.versions["1.0.0"].bytes, totalBytes: f.catalog.packs.motion.versions["1.0.0"].bytes });
  expect(progress.some(event => event.pack === "math")).toBe(true);
  expect(JSON.parse(fs.readFileSync(path.join(effects, "motion/active.json"), "utf8")).version).toBe("1.0.0");
  const compiled = await run(f.deck, "--install-effects");
  expect(compiled.result.success, compiled.result.errors?.join("\n")).toBe(true);
  expect(compiled.result.dependencies.some(file => file.startsWith(`${effects}/motion/1.0.0/`))).toBe(true);
  expect((await run("--remove-effect", "motion")).result.success).toBe(true);
  expect(fs.existsSync(path.join(effects, "motion"))).toBe(false);
  expect((await run(f.deck)).result.missingEffectPacks).toEqual(["motion"]);
  expect((await run("--remove-effect", "../outside")).result.errors.join("\n")).toContain("Invalid effect pack ID");
  const custom = path.join(f.root, "custom");
  fs.mkdirSync(path.join(custom, "motion"), { recursive: true });
  fs.mkdirSync(path.join(effects, "motion"), { recursive: true });
  expect((await run("--remove-effect", "motion", "--effect-packs", custom)).result.success).toBe(true);
  expect(fs.existsSync(path.join(custom, "motion"))).toBe(false);
  expect(fs.existsSync(path.join(effects, "motion"))).toBe(true);
  expect((await run("--effect-action", "legend-slides://effects/install?pack=motion&version=1.0.0", "--effect-packs", custom)).result.success).toBe(true);
  expect(fs.existsSync(path.join(custom, "motion/active.json"))).toBe(true);
});

test("future host versions and capabilities are isolated before any archive download", async () => {
  const f = fixture();
  f.catalog.packs.motion.versions["2.0.0"].hostApiVersion = 2;
  expect((await loadEffectCatalog(f.options.catalogURL)).packs.motion.versions["2.0.0"].hostApiVersion).toBe(2);
  await installEffectPacks(["motion"], f.options);
  const lock = fs.readFileSync(effectLockPath(f.deck), "utf8");
  const active = fs.readFileSync(path.join(f.directory, "motion/active.json"), "utf8");
  for (const incompatible of [{ hostApiVersion: 2, capabilities: [] }, { hostApiVersion: 1, capabilities: ["future-engine"] }]) {
    Object.assign(f.catalog.packs.motion.versions["2.0.0"], incompatible);
    f.catalog.packs.motion.latest = "2.0.0";
    const before = f.requests();
    await expect(installEffectPacks(["motion"], { ...f.options, deck: undefined })).rejects.toThrow("incompatible");
    expect(f.requests() - before).toBe(1);
    expect(fs.readFileSync(effectLockPath(f.deck), "utf8")).toBe(lock);
    expect(fs.readFileSync(path.join(f.directory, "motion/active.json"), "utf8")).toBe(active);
    expect((await compileDeck(f.deck, { effectPacksDirectory: f.directory })).success).toBe(true);
  }
  f.catalog.packs.math.versions["1.0.0"].capabilities = ["future-engine"];
  expect(() => resolveInstallation(f.catalog, ["motion"], readEffectLock(f.deck))).toThrow("future-engine");
});

test("independent default updates resolve exact dependencies and preserve deck locks", async () => {
  const f = fixture();
  await installEffectPacks(["motion"], f.options);
  const oldLock = fs.readFileSync(effectLockPath(f.deck), "utf8");
  await installEffectPacks(["math"], { ...f.options, deck: undefined, requested: { math: f.catalog.packs.math.versions["2.0.0"] } });
  const fresh = path.join(f.root, "fresh.mdx");
  fs.copyFileSync(f.deck, fresh);
  let result = await compileDeck(fresh, { effectPacksDirectory: f.directory });
  expect(result.success, result.errors?.join("\n")).toBe(true);
  expect(readEffectLock(fresh).packs.math.version).toBe("1.0.0");
  const module = { exports: {} };
  Function("require", "module", "exports", result.code)(() => ({}), module, module.exports);
  expect(module.exports.sample(21)).toBe(42);
  await installEffectPacks(["motion"], { ...f.options, deck: undefined });
  expect(JSON.parse(fs.readFileSync(path.join(f.directory, "math/active.json"), "utf8")).version).toBe("2.0.0");
  f.catalog.packs.motion.latest = "2.0.0";
  await installEffectPacks(["motion"], { ...f.options, deck: undefined });
  const next = path.join(f.root, "next.mdx");
  fs.copyFileSync(f.deck, next);
  result = await compileDeck(next, { effectPacksDirectory: f.directory });
  expect(result.success, result.errors?.join("\n")).toBe(true);
  expect(readEffectLock(next).packs.motion.version).toBe("2.0.0");
  expect(fs.readFileSync(effectLockPath(f.deck), "utf8")).toBe(oldLock);
  expect((await compileDeck(f.deck, { effectPacksDirectory: f.directory })).success).toBe(true);
  // Explicit imports requiring two versions cannot silently overwrite a deck pin.
  const conflict = path.join(f.root, "conflict.mdx");
  await installEffectPacks(["motion"], { ...f.options, deck: undefined, requested: { motion: f.catalog.packs.motion.versions["1.0.0"] } });
  fs.writeFileSync(conflict, 'export { sample } from "slides:motion/Pose";\nexport { twice } from "slides:math/Pose";\n\n# Conflict');
  result = await compileDeck(conflict, { effectPacksDirectory: f.directory });
  expect(result.success).toBe(false);
  expect(result.errors.join("\n")).toContain("dependency conflict");
  expect(fs.existsSync(effectLockPath(conflict))).toBe(false);
});

test("catalog content and examples retain same-origin download trust", async () => {
  const f = fixture();
  for (const url of ["https://evil.example/pack.json", "//evil.example/pack.json", "http://legend.so/pack.json"]) {
    expect(() => catalogResourceURL(url, "https://legend.so/catalog.json")).toThrow("origin");
  }
  expect(catalogResourceURL("packs/a.json", "https://legend.so/effects/catalog.json")).toBe("https://legend.so/effects/packs/a.json");
  f.catalog.packs.math.versions["1.0.0"].url = "https://evil.example/pack.json";
  await expect(installEffectPacks(["motion"], f.options)).rejects.toThrow("origin");
  expect(fs.existsSync(effectLockPath(f.deck))).toBe(false);
  expect(fs.existsSync(path.join(f.directory, "motion/active.json"))).toBe(false);
});
