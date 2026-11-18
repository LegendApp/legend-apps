import { settingsVersion } from "./schema";

export type SettingsDocument = Record<string, unknown>;
/** `migrations[n]` turns a version-n file into a version-(n+1) file. Pure; each ships with an in/out fixture pair. */
export type Migrations = Readonly<Record<number, (file: SettingsDocument) => SettingsDocument>>;

/** No version 2 yet; a rename, removal or change of meaning adds one here (spec §3.4). */
export const migrations: Migrations = {};

export type MigrationResult = { file: SettingsDocument; from: number; error?: string };

/**
 * Brings a file up to `target` in memory. Files at or past the target, or without a usable version, pass through
 * unchanged (validation reports those). The caller writes the result only when the user next saves that layer.
 */
export function migrateSettings(file: SettingsDocument, table: Migrations = migrations, target = settingsVersion): MigrationResult {
  const from = file.version;
  if (typeof from !== "number" || !Number.isInteger(from) || from < 1 || from >= target) return { file, from: typeof from === "number" ? from : target };
  let current = file;
  for (let version = from; version < target; version++) {
    const step = table[version];
    if (!step) return { file, from, error: `no migration from version ${version}` };
    current = { ...step(current), version: version + 1 };
  }
  return { file: current, from };
}
