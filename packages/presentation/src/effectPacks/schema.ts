export type PackPin = { version: string; sha256: string };
export type EffectLock = { schemaVersion: 1; packs: Record<string, PackPin> };
export type PackRelease = PackPin & { url: string; bytes: number; hostApiVersion: number; capabilities: string[];
  dependencies: Record<string, string>; exports: Record<string, string> };
export type EffectListing = { slug: string; title: string; description: string; pack: string; entry: string; symbol: string;
  tags: string[]; props: { name: string; description: string }[]; snippet: string;
  example: { url: string; sha256: string; bytes: number }; preview?: { poster: string; video?: string; renderer: string } };
export type EffectCatalog = { schemaVersion: 1; packs: Record<string, { latest: string; versions: Record<string, PackRelease> }>; effects: EffectListing[] };
export const validPackId = (id: string) => typeof id === "string" && /^[a-z][a-z0-9-]*$/.test(id);
export const validVersion = (version: string) => typeof version === "string" && /^\d+\.\d+\.\d+(?:-[a-zA-Z0-9.-]+)?$/.test(version);
export const validSha = (sha: string) => typeof sha === "string" && /^[a-f0-9]{64}$/.test(sha);
const record = (value: unknown) => !!value && typeof value === "object" && !Array.isArray(value);
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(item => typeof item === "string");
export function validatePin(pin: PackPin) {
  if (!pin || !validVersion(pin.version) || !validSha(pin.sha256)) throw new Error("Invalid effect pack version or checksum.");
}
export function validateLock(lock: EffectLock) {
  if (!lock || lock.schemaVersion !== 1 || !record(lock.packs)) throw new Error("Invalid effect lockfile.");
  for (const [id, pin] of Object.entries(lock.packs)) { if (!validPackId(id)) throw new Error("Invalid pack ID."); validatePin(pin); }
  return lock;
}
export function validateCatalog(catalog: EffectCatalog) {
  if (!catalog || catalog.schemaVersion !== 1 || !record(catalog.packs) || !Array.isArray(catalog.effects)) throw new Error("Invalid effect catalog.");
  for (const [id, pack] of Object.entries(catalog.packs)) {
    if (!validPackId(id) || !pack || !record(pack.versions) || !pack.versions[pack.latest]) throw new Error("Invalid catalog pack.");
    for (const [version, release] of Object.entries(pack.versions)) {
      validatePin(release);
      if (version !== release.version || !Number.isSafeInteger(release.bytes) || release.bytes < 1 || release.bytes > 10_000_000 ||
        !Number.isSafeInteger(release.hostApiVersion) || release.hostApiVersion < 1 || !strings(release.capabilities) || !record(release.dependencies) || !record(release.exports) || typeof release.url !== "string") throw new Error("Incompatible effect pack release.");
      for (const [entry, file] of Object.entries(release.exports)) {
        if (!/^[A-Za-z][A-Za-z0-9-]*$/.test(entry) || typeof file !== "string" || !/^\.\/[A-Za-z0-9_.\/-]+\.(?:tsx?|json)$/.test(file) || file.slice(2).split("/").some(part => !part || part === "." || part === "..")) throw new Error("Invalid effect export.");
      }
      for (const [dependency, required] of Object.entries(release.dependencies)) {
        if (!validPackId(dependency) || !validVersion(required)) throw new Error("Invalid effect dependency.");
      }
    }
  }
  const slugs = new Set<string>();
  for (const effect of catalog.effects) {
    const pack = effect && catalog.packs[effect.pack];
    if (!effect || !validPackId(effect.slug) || slugs.has(effect.slug) || !pack?.versions[pack.latest].exports[effect.entry] || !effect.example ||
      typeof effect.example.url !== "string" || !validSha(effect.example.sha256) || !Number.isSafeInteger(effect.example.bytes) || effect.example.bytes < 1 || effect.example.bytes > 1_000_000 ||
      typeof effect.title !== "string" || typeof effect.description !== "string" || typeof effect.snippet !== "string" || !strings(effect.tags) || !Array.isArray(effect.props) || effect.props.some(prop => !prop || typeof prop.name !== "string" || typeof prop.description !== "string") ||
      effect.preview !== undefined && (!record(effect.preview) || typeof effect.preview.poster !== "string" || typeof effect.preview.renderer !== "string" || effect.preview.video !== undefined && typeof effect.preview.video !== "string")) throw new Error("Invalid catalog effect.");
    slugs.add(effect.slug);
  }
  return catalog;
}

/** Capabilities exposed by the signed Slides host; packs cannot add native engines. */
const effectHostCapabilities = new Set(["reanimated", "skia", "webgpu", "lottie", "native-video"]);
export function effectPackIncompatibility(pack: { hostApiVersion: number; capabilities?: string[] }) {
  if (pack.hostApiVersion !== 1) return `Requires host API ${pack.hostApiVersion}; this app provides 1.`;
  if (pack.capabilities !== undefined && !strings(pack.capabilities)) return "Invalid host capabilities.";
  const missing = (pack.capabilities ?? []).filter(capability => !effectHostCapabilities.has(capability));
  if (missing.length) return `Requires unavailable host capabilities: ${missing.join(", ")}.`;
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
    const incompatibility = effectPackIncompatibility(release);
    if (incompatibility) throw new Error(`Effect pack "${id}" ${version} is incompatible: ${incompatibility}`);
    if (visiting.has(id)) throw new Error("Effect pack dependencies form a cycle.");
    if (releases.has(id)) { if (releases.get(id)!.version !== version) throw new Error(`Effect dependency conflict for "${id}".`); return; }
    visiting.add(id);
    for (const [dependency, requiredVersion] of Object.entries(release.dependencies)) visit(dependency, requiredVersion);
    visiting.delete(id); pins[id] = { version, sha256: release.sha256 }; releases.set(id, release);
  }
  ids.forEach(id => visit(id));
  return { lock: { schemaVersion: 1 as const, packs: pins }, releases };
}
