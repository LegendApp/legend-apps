#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import { loadAppManifest, rootDir } from "../../../scripts/lib/apps";
import { getMacOSAppWrapperName } from "../../../scripts/lib/macosShell";
import {
  getMacOSReleaseDerivedDataPath,
  getMacOSReleaseWorkspaceDir,
} from "../../../scripts/lib/macosWorkspaces";
import { runCommand } from "../../../scripts/lib/run";

type MacOSArch = "arm" | "x86";

function readOption(name: string) {
  const equals = process.argv.find((argument) => argument.startsWith(`${name}=`));
  if (equals) {
    return equals.slice(name.length + 1);
  }
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const output = readOption("--output");
if (!output) {
  throw new Error("Usage: bun run chat-history:benchmark:export --output <absolute .app path>");
}
if (!path.isAbsolute(output)) {
  throw new Error(`Benchmark output must be absolute: ${output}`);
}

const defaultArch: MacOSArch = process.arch === "x64" ? "x86" : "arm";
const arch = readOption("--arch") ?? defaultArch;
if (arch !== "arm" && arch !== "x86") {
  throw new Error(`Unsupported benchmark architecture: ${arch}`);
}

if (!process.argv.includes("--skip-build")) {
  runCommand("bun", ["scripts/build-app.ts", "chat-history", "macos", arch], {
    cwd: rootDir,
  });
}

const manifest = await loadAppManifest("chat-history");
const workspace = getMacOSReleaseWorkspaceDir(manifest.id);
const source = path.join(
  getMacOSReleaseDerivedDataPath(workspace, arch),
  "Build",
  "Products",
  "Release",
  getMacOSAppWrapperName(manifest.displayName),
);
if (!fs.existsSync(source)) {
  throw new Error(`Missing React Native production app at ${source}`);
}

fs.rmSync(output, { force: true, recursive: true });
fs.mkdirSync(path.dirname(output), { recursive: true });
runCommand("ditto", [source, output]);
runCommand("codesign", ["--force", "--deep", "--sign", "-", output]);
console.log(output);
