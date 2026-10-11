#!/usr/bin/env bun
import path from "node:path";
import { createRequire } from "node:module";
import { assertSupportedPlatform, loadAppManifest } from "./lib/apps";
import { runSparkDevServer } from "./lib/sparkDevServer";
import { assertSparkOfflineArgs, assertSparkOfflineBuild, assertSparkOfflineStart, installSparkWorkspace, parseSparkInstallArgs, SparkInstallError, sparkOfflineHelp } from "./lib/sparkInstall";
import { prepareSparkWorkspace } from "./lib/sparkWorkspaces";
import { getDevSyntaxAssetSourceRoot, getSlidesCompilerPath, runCommand } from "./lib/run";

const { extra, ...installOptions } = parseSparkInstallArgs(process.argv.slice(2));
const separator = extra.indexOf("--");
const commandArgs = separator < 0 ? extra : extra.slice(0, separator);
const [appId, action = "prepare"] = commandArgs;
const actionArgs = commandArgs.slice(2);
const runnerArgs = actionArgs;
const appArgs = separator < 0 ? [] : extra.slice(separator + 1);
if (!appId) throw new Error(`Usage: bun scripts/spark-app.ts <app> <prepare|install|build|build-release|run|start|analyze> [--offline] [--reinstall]\n${sparkOfflineHelp}`);
if (!["prepare", "install", "build", "build-release", "run", "start", "analyze"].includes(action)) throw new Error(`Unknown Spark action: ${action}`);
const manifest = await loadAppManifest(appId);
assertSupportedPlatform(manifest, "macos");
const project = prepareSparkWorkspace(manifest, action === "build-release" ? "release" : "dev");
const env = {
  LEGEND_APP: appId, LEGEND_PLATFORM: "macos", SPARK_PLATFORM: "macos",
  ...(installOptions.offline ? { LEGEND_OFFLINE: "1", EXPO_OFFLINE: "1" } : {}),
  EXPO_PUBLIC_LEGEND_SYNTAX_ASSET_SOURCE: ["start", "run"].includes(action) ? getDevSyntaxAssetSourceRoot() : undefined,
  EXPO_PUBLIC_LEGEND_SLIDES_COMPILER_PATH: appId === "slides" ? getSlidesCompilerPath() : undefined,
  EXPO_PUBLIC_LEGEND_DIFF_CUSTOMIZER_PATH: appId === "diff" ? path.resolve(project, "../../../../scripts/diff-customization.mjs") : undefined,
};
if (installOptions.offline) {
  for (const [key, value] of Object.entries(env)) if (value !== undefined) process.env[key] = value;
}
let cli = "";
const buildArgs = ["build", action === "build-release" ? "--release" : "--dev", ...(action === "run" ? [] : [...actionArgs, ...(separator < 0 ? [] : extra.slice(separator))])];
try {
  if (installOptions.offline) assertSparkOfflineArgs(action === "run" ? actionArgs : extra);
  if (["install", "build", "build-release", "run", "start"].includes(action)) installSparkWorkspace({ project, appId, env, ...installOptions });
  if (!["prepare", "install"].includes(action)) cli = createRequire(path.join(project, "package.json")).resolve("@legendapp/spark/cli");
  if (installOptions.offline && ["build", "build-release", "run"].includes(action)) {
    await assertSparkOfflineBuild(project, cli, buildArgs);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exit(error instanceof SparkInstallError ? error.exitCode : 1);
}
if (action === "prepare") console.log(project);
else if (action !== "install") {
  if (action === "run") {
    runCommand("node", [cli, ...buildArgs], { cwd: project, env });
    if (installOptions.offline) await assertSparkOfflineStart(project, cli, runnerArgs);
    await runSparkDevServer({ appId, project, cli, runnerArgs, appArgs, env });
  }
  else if (action === "build-release" || action === "build") runCommand("node", [cli, ...buildArgs], { cwd: project, env });
  else if (action === "start") await runSparkDevServer({ appId, project, cli, runnerArgs: actionArgs, noOpen: true, env });
  else if (action === "analyze") runCommand("node", [cli, "analyze", ...extra], { cwd: project, env });
  else throw new Error(`Unknown Spark action: ${action}`);
}
