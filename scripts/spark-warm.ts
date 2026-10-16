#!/usr/bin/env bun
import { appIds, loadAppManifest } from "./lib/apps";
import { installSparkWorkspace, parseSparkInstallArgs, SparkInstallError } from "./lib/sparkInstall";
import { prepareSharedSparkInstall, prepareSparkReleasePackages, prepareSparkWorkspace } from "./lib/sparkWorkspaces";

const options = parseSparkInstallArgs(process.argv.slice(2));
if (options.extra.length) throw new Error("Usage: bun run spark:warm [--offline] [--reinstall]");
try {
  const project = await prepareSharedSparkInstall();
  await prepareSparkReleasePackages(project, options.offline);
  const result = installSparkWorkspace({ project, appId: "shared Spark", ...options });
  if (result === "installed") console.log("Shared Spark dependencies installed.");
  for (const appId of appIds) {
    const manifest = await loadAppManifest(appId);
    if (manifest.platforms.includes("macos")) prepareSparkWorkspace(manifest);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = error instanceof SparkInstallError ? error.exitCode : 1;
}
