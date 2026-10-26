#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import { rootDir } from "../../../scripts/lib/apps";
import { sparkWorkspace } from "../../../scripts/lib/sparkWorkspaces";
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

// Apply the existing benchmark Markdown options to this Release build.
process.env.LEGEND_CHAT_HISTORY_BENCHMARK = "1";

if (!process.argv.includes("--skip-build")) {
  runCommand("bun", ["scripts/build-app.ts", "chat-history", "macos", arch], {
    cwd: rootDir,
  });
}

const build = JSON.parse(fs.readFileSync(
  path.join(sparkWorkspace("chat-history", "release"), ".spark/release-build.json"),
  "utf8",
));
if (build.runtime.arch !== (arch === "arm" ? "arm64" : "x64")) {
  throw new Error(`React Native production build does not match architecture ${arch}`);
}
const source = build.app as string;
if (!fs.existsSync(source)) {
  throw new Error(`Missing React Native production app at ${source}`);
}

fs.rmSync(output, { force: true, recursive: true });
fs.mkdirSync(path.dirname(output), { recursive: true });
runCommand("ditto", [source, output]);
runCommand("codesign", ["--force", "--deep", "--sign", "-", output]);
console.log(output);
