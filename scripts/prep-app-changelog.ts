#!/usr/bin/env bun
import path from "node:path";
import {
  assertSupportedPlatform,
  loadAppManifest,
  loadAppPackageMetadata,
  rootDir,
} from "./lib/apps";
import { ensureAppChangelogEntry } from "./lib/changelog";

function parseOptions(args: string[]) {
  const options = {
    dryRun: false,
  };

  for (const arg of args) {
    if (arg === "--dry-run") {
      options.dryRun = true;
    } else {
      throw new Error(`Unexpected changelog option "${arg}".`);
    }
  }

  return options;
}

async function main() {
  const [appId, ...args] = process.argv.slice(2);
  if (!appId) {
    throw new Error("Usage: bun scripts/prep-app-changelog.ts <app> [--dry-run]");
  }

  const options = parseOptions(args);
  const manifest = await loadAppManifest(appId);
  assertSupportedPlatform(manifest, "macos");
  const appPackage = loadAppPackageMetadata(appId);
  const result = ensureAppChangelogEntry(manifest, appPackage, { write: !options.dryRun });
  const relativeChangelogPath = path.relative(rootDir, result.changelogPath);

  if (options.dryRun && result.updated) {
    console.log(`Would update ${relativeChangelogPath} for ${result.version}.`);
    console.log("");
    console.log(result.releaseNotes);
  } else if (result.updated) {
    console.log(`Updated ${relativeChangelogPath} for ${result.version}.`);
  } else {
    console.log(`${relativeChangelogPath} already has notes for ${result.version}.`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
