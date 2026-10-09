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
        release.hostApiVersion !== 1 || !strings(release.capabilities) || !record(release.dependencies) || !record(release.exports) || typeof release.url !== "string") throw new Error("Incompatible effect pack release.");
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
      typeof effect.title !== "string" || typeof effect.description !== "string" || typeof effect.snippet !== "string" || !strings(effect.tags) || !Array.isArray(effect.props) || effect.props.some(prop => !prop || typeof prop.name !== "string" || typeof prop.description !== "string")) throw new Error("Invalid catalog effect.");
    slugs.add(effect.slug);
  }
  return catalog;
}
