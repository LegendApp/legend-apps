#!/usr/bin/env bun
import path from "node:path";
import { assertSupportedPlatform, resolveDevServerPort, withDefaultPortArg, loadAppManifest } from "./lib/apps";
import { prepareSparkWorkspace, sparkCheckout } from "./lib/sparkWorkspaces";
import { getDevSyntaxAssetSourceRoot, getSlidesCompilerPath, runCommand } from "./lib/run";

const [appId, action = "prepare", ...extra] = process.argv.slice(2);
if (!appId) throw new Error("Usage: bun scripts/spark-app.ts <app> <prepare|install|build|start|analyze>");
if (!["prepare", "install", "build", "start", "analyze"].includes(action)) throw new Error(`Unknown Spark action: ${action}`);
const manifest = await loadAppManifest(appId);
assertSupportedPlatform(manifest, "macos");
const project = prepareSparkWorkspace(manifest);
const env = {
  LEGEND_APP: appId, LEGEND_PLATFORM: "macos", SPARK_PLATFORM: "macos",
  EXPO_PUBLIC_LEGEND_SYNTAX_ASSET_SOURCE: action === "start" ? getDevSyntaxAssetSourceRoot() : undefined,
  EXPO_PUBLIC_LEGEND_SLIDES_COMPILER_PATH: appId === "slides" ? getSlidesCompilerPath() : undefined,
};
if (action === "prepare") console.log(project);
else if (action === "install") runCommand("bun", ["install", "--linker", "hoisted"], { cwd: project, env });
else {
  const cli = path.join(sparkCheckout, "scripts/spark.mjs");
  if (action === "build") runCommand("node", [cli, "build", "--dev", ...extra], { cwd: project, env });
  else if (action === "start") runCommand("node", [cli, "dev", ...withDefaultPortArg(extra, resolveDevServerPort(appId, extra))], { cwd: project, env });
  else if (action === "analyze") runCommand("node", [cli, "analyze", ...extra], { cwd: project, env });
  else throw new Error(`Unknown Spark action: ${action}`);
}
