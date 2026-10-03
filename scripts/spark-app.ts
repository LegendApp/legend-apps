#!/usr/bin/env bun
import path from "node:path";
import { assertSupportedPlatform, resolveDevServerPort, withDefaultPortArg, loadAppManifest } from "./lib/apps";
import { prepareSparkWorkspace, sparkCheckout } from "./lib/sparkWorkspaces";
import { getDevSyntaxAssetSourceRoot, getSlidesCompilerPath, runCommand } from "./lib/run";

const [appId, action = "prepare", ...extra] = process.argv.slice(2);
if (!appId) throw new Error("Usage: bun scripts/spark-app.ts <app> <prepare|install|build|build-release|run|start|analyze>");
if (!["prepare", "install", "build", "build-release", "run", "start", "analyze"].includes(action)) throw new Error(`Unknown Spark action: ${action}`);
const manifest = await loadAppManifest(appId);
assertSupportedPlatform(manifest, "macos");
const project = prepareSparkWorkspace(manifest, action === "build-release" ? "release" : "dev");
const env = {
  LEGEND_APP: appId, LEGEND_PLATFORM: "macos", SPARK_PLATFORM: "macos",
  EXPO_PUBLIC_LEGEND_SYNTAX_ASSET_SOURCE: ["start", "run"].includes(action) ? getDevSyntaxAssetSourceRoot() : undefined,
  EXPO_PUBLIC_LEGEND_SLIDES_COMPILER_PATH: appId === "slides" ? getSlidesCompilerPath() : undefined,
  EXPO_PUBLIC_LEGEND_DIFF_CUSTOMIZER_PATH: appId === "diff" ? path.resolve(project, "../../../../scripts/diff-customization.mjs") : undefined,
};
if (action === "prepare") console.log(project);
else if (action === "install") runCommand("bun", ["install", "--linker", "hoisted"], { cwd: project, env });
else {
  const cli = path.join(sparkCheckout, "scripts/spark.mjs");
  // Required every run: `file:` links snapshot the package's file list, so new
  // files under apps/ and packages/ only become resolvable after this install.
  if (["build", "build-release", "run", "start"].includes(action)) runCommand("bun", ["install", "--linker", "hoisted"], { cwd: project, env });
  if (action === "run") {
    runCommand("node", [cli, "build", "--dev"], { cwd: project, env });
    const separator = extra.indexOf("--");
    const runnerArgs = separator < 0 ? extra : extra.slice(0, separator);
    const appArgs = separator < 0 ? [] : extra.slice(separator + 1);
    runCommand("node", [cli, "dev", ...withDefaultPortArg(runnerArgs, resolveDevServerPort(appId, runnerArgs)), ...appArgs.map(arg => `--app-arg=${arg}`)], { cwd: project, env });
  }
  else if (action === "build-release") runCommand("node", [cli, "build", "--release", ...extra], { cwd: project, env });
  else if (action === "build") runCommand("node", [cli, "build", "--dev", ...extra], { cwd: project, env });
  else if (action === "start") runCommand("node", [cli, "dev", "--no-open", ...withDefaultPortArg(extra, resolveDevServerPort(appId, extra))], { cwd: project, env });
  else if (action === "analyze") runCommand("node", [cli, "analyze", ...extra], { cwd: project, env });
  else throw new Error(`Unknown Spark action: ${action}`);
}
