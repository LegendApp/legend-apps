import fs from "node:fs";
import path from "node:path";
import { validateCatalog, validatePin, validPackId, type EffectCatalog, type EffectLock, type PackPin, type PackRelease } from "./schema";
import { atomicWrite, effectLockPath, ensureEffectSpace, installedPacksDirectory, pinnedPackDirectory, readEffectLock, readPackArchive, sha256, verifyInstalledPack, writeEffectLock } from "./storage";
export const effectCatalogURL = () => process.env.LEGEND_SLIDES_EFFECTS_CATALOG ?? "https://legend.so/slides/effects/catalog.json";
export function catalogResourceURL(resource: string, catalogURL: string) {
  const url = new URL(resource, catalogURL), catalog = new URL(catalogURL);
  if (url.origin !== catalog.origin || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) throw new Error("Effect downloads must use the catalog's HTTPS origin.");
  return url.href;
}
export type EffectInstallProgress = { pack: string; receivedBytes: number; totalBytes: number };
async function download(url: string, maximum: number, expected?: { sha256: string; bytes: number }, onBytes?: (size: number) => void) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000), redirect: "error" });
  if (!response.ok || !response.body) throw new Error(`Effect download failed (${response.status}).`);
  const reader = response.body.getReader(), chunks: Uint8Array[] = []; let size = 0;
  try {
    for (;;) { const { value, done } = await reader.read(); if (done) break; size += value.length;
      if (size > maximum) throw new Error("Effect download exceeds its declared size."); chunks.push(value); onBytes?.(size); }
  } finally { await reader.cancel(); }
  const bytes = Buffer.concat(chunks);
  if (expected && (size !== expected.bytes || sha256(bytes) !== expected.sha256)) throw new Error("Effect download checksum or size does not match the catalog.");
  return bytes.toString("utf8");
}
export async function loadEffectCatalog(url = effectCatalogURL()) {
  catalogResourceURL(url, url);
  return validateCatalog(JSON.parse(await download(url, 2_000_000)));
}
export function resolveInstallation(catalog: EffectCatalog, ids: string[], existing: EffectLock = { schemaVersion: 1, packs: {} }, requested: Record<string, PackPin> = {}) {
  const pins = { ...existing.packs }; const releases = new Map<string, PackRelease>(); const visiting = new Set<string>();
  function visit(id: string, required?: string) {
    if (!validPackId(id)) throw new Error("Invalid effect pack ID.");
    const pack = catalog.packs[id]; if (!pack) throw new Error(`Effect pack "${id}" is not in the catalog.`);
    const pin = requested[id] ?? pins[id]; if (pin) validatePin(pin);
    const version = pin?.version ?? required ?? pack.latest;
    if (required && version !== required) throw new Error(`Effect dependency conflict for "${id}": ${version} versus ${required}.`);
    const release = pack.versions[version];
    if (!release || pin && pin.sha256 !== release.sha256) throw new Error(`Pinned effect "${id}" ${version} is not available in this catalog.`);
    if (visiting.has(id)) throw new Error("Effect pack dependencies form a cycle.");
    if (releases.has(id)) { if (releases.get(id)!.version !== version) throw new Error(`Effect dependency conflict for "${id}".`); return; }
    visiting.add(id);
    for (const [dependency, requiredVersion] of Object.entries(release.dependencies)) visit(dependency, requiredVersion);
    visiting.delete(id); pins[id] = { version, sha256: release.sha256 }; releases.set(id, release);
  }
  ids.forEach(id => visit(id));
  return { lock: { schemaVersion: 1 as const, packs: pins }, releases };
}
async function installRelease(directory: string, id: string, release: PackRelease, catalogURL: string, onProgress?: (progress: EffectInstallProgress) => void) {
  const destination = pinnedPackDirectory(directory, id, release);
  if (verifyInstalledPack(destination, release)) return;
  ensureEffectSpace(directory, release.bytes * 4);
  const text = await download(catalogResourceURL(release.url, catalogURL), release.bytes, release,
    receivedBytes => onProgress?.({ pack: id, receivedBytes, totalBytes: release.bytes }));
  const archive = readPackArchive(text), manifest = JSON.parse(archive.files["pack.json"]);
  if (manifest.id !== id || manifest.version !== release.version || manifest.hostApiVersion !== release.hostApiVersion ||
    JSON.stringify(manifest.dependencies ?? {}) !== JSON.stringify(release.dependencies) || JSON.stringify(manifest.exports) !== JSON.stringify(release.exports) ||
    JSON.stringify(manifest.capabilities) !== JSON.stringify(release.capabilities)) throw new Error("Effect archive does not match its catalog manifest.");
  fs.mkdirSync(path.dirname(destination), { recursive: true });
  const stage = fs.mkdtempSync(path.join(path.dirname(destination), ".install-"));
  try {
    for (const [file, source] of Object.entries(archive.files)) { const target = path.join(stage, file); fs.mkdirSync(path.dirname(target), { recursive: true }); fs.writeFileSync(target, source); }
    fs.writeFileSync(path.join(stage, ".archive.json"), text);
    verifyInstalledPack(stage, release);
    try { fs.renameSync(stage, destination); }
    catch (error) { if (!verifyInstalledPack(destination, release)) throw error; }
  } finally { if (fs.existsSync(stage)) fs.rmSync(stage, { recursive: true }); }
}
type InstallOptions = { directory?: string; catalogURL?: string; deck?: string; requested?: Record<string, PackPin>; onProgress?: (progress: EffectInstallProgress) => void };
async function withInstallationLease<T>(directory: string, work: () => Promise<T>) {
  fs.mkdirSync(directory, { recursive: true });
  const lease = path.join(directory, ".installation.lock"), token = crypto.randomUUID();
  const temporary = path.join(directory, `.lease-${token}`);
  fs.writeFileSync(temporary, JSON.stringify({ pid: process.pid, token }), { flag: "wx" });
  let acquired = false;
  try {
    for (let attempt = 0; attempt < 2; attempt++) {
      try { fs.linkSync(temporary, lease); acquired = true; break; }
      catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
        const owner = JSON.parse(fs.readFileSync(lease, "utf8"));
        if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0 || typeof owner.token !== "string") throw new Error("Invalid effect installation lease.");
        try { process.kill(owner.pid, 0); throw new Error("Another effect installation is running. Retry when it finishes."); }
        catch (error) { if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error; }
        if (fs.readFileSync(lease, "utf8") === JSON.stringify(owner)) fs.unlinkSync(lease);
      }
    }
    if (!acquired) throw new Error("Could not acquire effect installation lease. Retry.");
    return await work();
  } finally {
    if (acquired && JSON.parse(fs.readFileSync(lease, "utf8")).token === token) fs.unlinkSync(lease);
    fs.unlinkSync(temporary);
  }
}
export async function installEffectPacks(ids: string[], options: InstallOptions = {}) {
  const directory = options.directory ?? installedPacksDirectory();
  ensureEffectSpace(directory, 2_000_000);
  return withInstallationLease(directory, () => installPacks(ids, { ...options, directory }));
}
async function installPacks(ids: string[], options: InstallOptions) {
  const directory = options.directory ?? installedPacksDirectory(), catalogURL = options.catalogURL ?? effectCatalogURL();
  const lockFile = options.deck ? effectLockPath(options.deck) : undefined;
  const before = lockFile && fs.existsSync(lockFile) ? fs.readFileSync(lockFile, "utf8") : undefined;
  const existing = options.deck ? readEffectLock(options.deck) : undefined;
  const catalog = await loadEffectCatalog(catalogURL);
  const { lock, releases } = resolveInstallation(catalog, ids, existing, options.requested);
  ensureEffectSpace(directory, [...releases.values()].reduce((sum, release) => sum + release.bytes * 4, 0));
  for (const [id, release] of releases) await installRelease(directory, id, release, catalogURL, options.onProgress);
  if (options.deck) writeEffectLock(options.deck, lock, before);
  // Default selections affect new decks only. Existing decks resolve their lockfile.
  for (const [id] of releases) atomicWrite(path.join(directory, id, "active.json"), JSON.stringify(lock.packs[id]) + "\n");
  return { lock, catalog };
}
/** Remove every installed version; decks pinned to the pack offer to reinstall it. */
export async function removeEffectPack(id: string, options: { directory?: string } = {}) {
  if (!validPackId(id)) throw new Error("Invalid effect pack ID.");
  const directory = options.directory ?? installedPacksDirectory();
  if (!fs.existsSync(directory)) return;
  await withInstallationLease(directory, async () => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (!entry.isDirectory() || entry.name === id || !validPackId(entry.name)) continue;
      const active = path.join(directory, entry.name, "active.json");
      if (!fs.existsSync(active)) continue;
      const pin = JSON.parse(fs.readFileSync(active, "utf8")) as PackPin;
      validatePin(pin);
      const manifest = path.join(pinnedPackDirectory(directory, entry.name, pin), "pack.json");
      if (fs.existsSync(manifest) && Object.hasOwn(JSON.parse(fs.readFileSync(manifest, "utf8")).dependencies ?? {}, id)) {
        throw new Error(`Cannot remove "${id}": installed pack "${entry.name}" depends on it.`);
      }
    }
    fs.rmSync(path.join(directory, id), { recursive: true, force: true });
  });
}
export async function installEffectExample(slug: string, options: { directory?: string; catalogURL?: string } = {}) {
  const directory = options.directory ?? installedPacksDirectory();
  ensureEffectSpace(directory, 2_000_000);
  const catalogURL = options.catalogURL ?? effectCatalogURL(), catalog = await loadEffectCatalog(catalogURL);
  const effect = catalog.effects.find(item => item.slug === slug); if (!effect) throw new Error("Unknown effect example.");
  const text = await download(catalogResourceURL(effect.example.url, catalogURL), effect.example.bytes, effect.example);
  const deck = path.join(directory, "examples", slug, effect.example.sha256, catalog.packs[effect.pack].versions[catalog.packs[effect.pack].latest].sha256, "example.mdx");
  await installEffectPacks([effect.pack], { ...options, directory, deck, requested: { [effect.pack]: catalog.packs[effect.pack].versions[catalog.packs[effect.pack].latest] } });
  atomicWrite(deck, text);
  return deck;
}
