#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import { assertSupportedPlatform, loadAppManifest, resolveDevServerPort } from "./lib/apps";
import { parseAppCommand } from "./lib/apps";
import { sparkWorkspace } from "./lib/sparkWorkspaces";
import { splitLaunchArgs, type OptionSpecs } from "./lib/launchArgs";
import { runCommand } from "./lib/run";
import type { Platform } from "./lib/types";

const openOptionSpecs: OptionSpecs = {
  "--configuration": "value",
  "--mode": "value",
  "--print": "boolean",
  "--port": "value",
  "--https": "boolean",
  "--no-dev": "boolean",
  "--minify": "boolean",
  "--release": "boolean",
  "--arch": "value",
};

type MacOSBuildArch = "arm" | "x86";

function readMode(args: string[]) {
  if (args.includes("--release")) {
    return "Release";
  }

  const modeIndex = args.findIndex((arg) => arg === "--mode" || arg === "--configuration");
  const mode = modeIndex >= 0 ? args[modeIndex + 1] : undefined;
  return mode === "Release" ? "Release" : "Debug";
}

function readMacOSBuildArch(args: string[]): MacOSBuildArch {
  const archEqualsArg = args.find((arg) => arg.startsWith("--arch="));
  const archIndex = args.findIndex((arg) => arg === "--arch");
  const arch = archEqualsArg
    ? archEqualsArg.slice("--arch=".length)
    : archIndex >= 0
      ? args[archIndex + 1]
      : "arm";

  if (arch !== "arm" && arch !== "x86") {
    throw new Error(`Invalid macOS release architecture "${arch}". Expected "arm" or "x86".`);
  }

  return arch;
}

function shouldPrintOnly(args: string[]) {
  return args.includes("--print");
}

async function openOne(appId: string, platform: Platform, args: string[]) {
  if (platform !== "macos") {
    throw new Error("Opening an already built app is currently implemented for macos only.");
  }

  const { launchArgs, runnerArgs } = splitLaunchArgs(args, openOptionSpecs);
  const manifest = await loadAppManifest(appId);
  assertSupportedPlatform(manifest, platform);

  const mode = readMode(runnerArgs);
  const buildMode = mode === "Release" ? "release" : "dev";
  const record = path.join(sparkWorkspace(appId, buildMode), `.spark/${buildMode}-build.json`);
  if (!fs.existsSync(record)) throw new Error(`Build the Spark app first: bun run ${appId} build macos${mode === "Debug" ? " --dev" : ""}`);
  const built = JSON.parse(fs.readFileSync(record, "utf8"));
  const appPath = built.app as string;
  if (!fs.existsSync(appPath)) throw new Error(`Spark app is missing: ${appPath}`);
  if (mode === "Release" && (runnerArgs.includes("--arch") || runnerArgs.some(arg => arg.startsWith("--arch=")))) {
    const expected = readMacOSBuildArch(runnerArgs) === "arm" ? "arm64" : "x64";
    if (built.runtime.arch !== expected) throw new Error(`The latest release build is ${built.runtime.arch}, not ${expected}. Build the requested architecture first.`);
  }
  if (shouldPrintOnly(runnerArgs)) { console.log(appPath); return; }
  const port = resolveDevServerPort(appId, runnerArgs);
  const protocol = runnerArgs.includes("--https") ? "https" : "http";
  const envArgs = mode === "Debug" ? ["--env", `SPARK_BUNDLE_URL=${protocol}://127.0.0.1:${port}/index.bundle?platform=macos&dev=${!runnerArgs.includes("--no-dev")}&minify=${runnerArgs.includes("--minify")}`] : [];
  const runtimeArgs = mode === "Debug" ? ["-RCT_jsLocation", `127.0.0.1:${port}`] : [];
  runCommand("open", [...(launchArgs.length ? ["-n"] : []), ...envArgs, appPath, ...((runtimeArgs.length || launchArgs.length) ? ["--args", ...runtimeArgs, ...launchArgs] : [])]);

}

async function main() {
  const command = parseAppCommand(process.argv.slice(2));

  if (command.all) {
    throw new Error("Opening all apps is not supported. Open one app/platform at a time.");
  }

  await openOne(command.appId, command.platform, command.extraArgs);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
