#!/usr/bin/env bun
import { appIds, loadAppManifest } from "./lib/apps";
import { installSparkWorkspace, parseSparkInstallArgs, SparkInstallError } from "./lib/sparkInstall";
import { prepareSparkWorkspace } from "./lib/sparkWorkspaces";

const options = parseSparkInstallArgs(process.argv.slice(2));
if (options.extra.length) throw new Error("Usage: bun run spark:warm [--offline] [--reinstall]");
let exitCode = 0;
for (const appId of appIds) {
  try {
    const manifest = await loadAppManifest(appId);
    if (!manifest.platforms.includes("macos")) continue;
    const project = prepareSparkWorkspace(manifest);
    const result = installSparkWorkspace({ project, appId, ...options });
    if (result === "installed") console.log(`${appId}: dependencies installed.`);
  } catch (error) {
    if (!exitCode) exitCode = error instanceof SparkInstallError ? error.exitCode : 1;
    console.error(`${appId}: ${error instanceof Error ? error.message : error}`);
  }
}
process.exitCode = exitCode;
