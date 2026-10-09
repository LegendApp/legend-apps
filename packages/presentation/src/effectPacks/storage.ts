import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { validateLock, type EffectLock, type PackPin } from "./schema";
export const sha256 = (contents: string | Uint8Array) => createHash("sha256").update(contents).digest("hex");
export const installedPacksDirectory = () => process.env.LEGEND_SLIDES_EFFECT_PACKS ?? path.join(os.homedir(), "Library/Application Support/Legend Slides/effects");
export const effectLockPath = (deck: string) => `${deck}.effects.lock.json`;
export function readEffectLock(deck: string): EffectLock | undefined {
  const file = effectLockPath(deck);
  return fs.existsSync(file) ? validateLock(JSON.parse(fs.readFileSync(file, "utf8"))) : undefined;
}
export const pinnedPackDirectory = (directory: string, id: string, pin: PackPin) => path.join(directory, id, pin.version, pin.sha256);
export function ensureEffectSpace(directory: string, additionalBytes: number) {
  let existing = directory;
  while (!fs.existsSync(existing)) existing = path.dirname(existing);
  const volume = process.platform === "darwin" ? "/System/Volumes/Data" : existing;
  const reserve = Number(process.env.LEGEND_SLIDES_EFFECTS_DISK_RESERVE_BYTES ?? 1_000_000);
  if (!Number.isSafeInteger(reserve) || reserve < 0) throw new Error("Invalid effect installation disk reserve.");
  for (const target of new Set([volume, existing])) {
    const stat = fs.statfsSync(target);
    if (stat.bavail * stat.bsize - additionalBytes <= reserve) throw new Error("Not enough disk space to install effects while preserving the configured disk reserve.");
  }
}
export function atomicWrite(file: string, contents: string) {
  ensureEffectSpace(path.dirname(file), Buffer.byteLength(contents));
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  fs.mkdirSync(path.dirname(file), { recursive: true });
  try { fs.writeFileSync(temporary, contents, { flag: "wx" }); fs.renameSync(temporary, file); }
  finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
export function writeEffectLock(deck: string, lock: EffectLock, expected?: string) {
  validateLock(lock);
  const file = effectLockPath(deck);
  if ((fs.existsSync(file) ? fs.readFileSync(file, "utf8") : undefined) !== expected) throw new Error("The effect lockfile changed during installation. Retry to preserve its versions.");
  atomicWrite(file, JSON.stringify(lock, null, 2) + "\n");
}
export function readPackArchive(text: string) {
  const archive = JSON.parse(text) as { schemaVersion: number; files: Record<string, string> };
  if (archive.schemaVersion !== 1 || !archive.files || Object.keys(archive.files).length > 256 || typeof archive.files["pack.json"] !== "string") throw new Error("Invalid source pack archive.");
  const seen = new Set<string>();
  for (const [file, source] of Object.entries(archive.files)) {
    if (!/^[a-zA-Z0-9_.\/-]+\.(?:tsx?|json)$/.test(file) || file.startsWith("/") || file.split("/").some(part => !part || part === "." || part === "..") || typeof source !== "string" || seen.has(file.toLowerCase())) throw new Error("Invalid source pack file.");
    seen.add(file.toLowerCase());
  }
  return archive;
}
export function verifyInstalledPack(root: string, pin: PackPin) {
  const archiveFile = path.join(root, ".archive.json");
  if (!fs.existsSync(archiveFile)) return false;
  const text = fs.readFileSync(archiveFile, "utf8");
  if (sha256(text) !== pin.sha256) throw new Error("Installed effect checksum does not match its pinned version.");
  const archive = readPackArchive(text);
  for (const [file, source] of Object.entries(archive.files)) {
    const target = path.join(root, file), relative = path.relative(fs.realpathSync(root), fs.realpathSync(target));
    if (relative.startsWith("..") || path.isAbsolute(relative) || fs.readFileSync(target, "utf8") !== source) throw new Error("Installed effect source has changed. Restore the pinned source files or install into a fresh effect cache.");
  }
  return true;
}
