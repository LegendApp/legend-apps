#!/usr/bin/env bun
import path from "node:path";
import { createRequire } from "node:module";
import { assertSupportedPlatform, loadAppManifest } from "./lib/apps";
import { runSparkDevServer } from "./lib/sparkDevServer";
import { prepareSparkWorkspace } from "./lib/sparkWorkspaces";
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
  // Required every run: `file:` links snapshot the package's file list, so new
  // files under apps/ and packages/ only become resolvable after this install.
  if (["build", "build-release", "run", "start"].includes(action)) runCommand("bun", ["install", "--linker", "hoisted"], { cwd: project, env });
  const cli = createRequire(path.join(project, "package.json")).resolve("@legendapp/spark/cli");
  if (action === "run") {
    runCommand("node", [cli, "build", "--dev"], { cwd: project, env });
    const separator = extra.indexOf("--");
    const runnerArgs = separator < 0 ? extra : extra.slice(0, separator);
    const appArgs = separator < 0 ? [] : extra.slice(separator + 1);
    await runSparkDevServer({ appId, project, cli, runnerArgs, appArgs, env });
  }
  else if (action === "build-release") runCommand("node", [cli, "build", "--release", ...extra], { cwd: project, env });
  else if (action === "build") runCommand("node", [cli, "build", "--dev", ...extra], { cwd: project, env });
  else if (action === "start") await runSparkDevServer({ appId, project, cli, runnerArgs: extra, noOpen: true, env });
  else if (action === "analyze") runCommand("node", [cli, "analyze", ...extra], { cwd: project, env });
  else throw new Error(`Unknown Spark action: ${action}`);
}
