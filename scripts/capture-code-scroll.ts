#!/usr/bin/env bun
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appArg = process.argv[2];
if (!appArg || appArg === "--help") {
  console.log('Usage: bun scripts/capture-code-scroll.ts "/absolute/path/Legend Code.app"\nSave your work and quit Code first. Requires a rebuilt app with source-scroll-v1 probes.');
  process.exit(appArg ? 0 : 1);
}
const app = path.resolve(appArg);
const plist = path.join(app, "Contents/Info.plist");
function readPlist(key: string) {
  const result = spawnSync("/usr/libexec/PlistBuddy", ["-c", `Print :${key}`, plist], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`Cannot read ${key} from app Info.plist`);
  return result.stdout.trim();
}
if (readPlist("CFBundleIdentifier") !== "so.legend.code.macos") throw new Error("Expected a Legend Code app bundle.");
const executable = path.join(app, "Contents/MacOS", readPlist("CFBundleExecutable"));
if (!existsSync(executable)) throw new Error("App executable not found.");
const processes = spawnSync("ps", ["-axo", "comm="], { encoding: "utf8" });
if (processes.status !== 0) throw new Error("Could not check for existing Code processes.");
if (processes.stdout.split("\n").some(line => /\/Legend Code\.app\/Contents\/MacOS\//.test(line))) {
  throw new Error("Code is already running. Save your work and quit it before capture; this script will not close it.");
}
const directory = mkdtempSync(path.join(tmpdir(), "legend-code-scroll-"));
const executableSha256 = createHash("sha256").update(readFileSync(executable)).digest("hex");
const repo = fileURLToPath(new URL("../", import.meta.url));
const commit = spawnSync("git", ["rev-parse", "HEAD"], { cwd: repo, encoding: "utf8" });
const listPackage = JSON.parse(readFileSync(path.join(repo, "packages/legend-list-sparse-layout/package.json"), "utf8"));
writeFileSync(path.join(directory, "capture.json"), JSON.stringify({
  timestamp: Date.now(), probe: "source-scroll-v1", app, executableSha256,
  checkoutCommit: commit.status === 0 ? commit.stdout.trim() : null, checkoutListVersion: listPackage.version,
  note: "Checkout metadata identifies the source used for this launcher, not proof of which JS a prebuilt app contains. Rebuild from this checkout.",
  instructions: "Mark a visible blank with Command-Option-Shift-D. Capture stops after five minutes. No document contents are recorded.",
}, null, 2), { mode: 0o600 });
console.log(`Capture folder: ${directory}\nOpen the affected file, wait for it to finish loading, then scroll normally.\nWhen the entire viewport blanks, press Command-Option-Shift-D immediately after it.\nWait at least 2 seconds before quitting Code normally. Maximum capture: 5 minutes.`);
const child = spawn(executable, [], { env: { ...process.env, LEGEND_SOURCE_SCROLL_TRACE_DIR: directory }, stdio: "ignore" });
child.on("error", error => { console.error(error.message); process.exitCode = 1; });
// Do not interrupt an editor that may have unsaved work when the terminal closes.
process.on("SIGINT", () => { console.log(`Capture remains in ${directory}. Quit Code normally when finished.`); child.unref(); process.exit(0); });
setTimeout(() => {
  if (!readdirSync(directory).some(name => name.endsWith(".jsonl"))) {
    console.error("No native trace appeared. Open a file; if still absent, this app is stale or could not write the capture. Rebuild before reproducing.");
  }
}, 10000).unref();
child.on("exit", () => {
  const traces = readdirSync(directory).filter(name => name.endsWith(".jsonl"));
  console.log(`App exited. Capture: ${directory}`);
  if (!traces.length) { console.error("No trace found; this is not a valid capture."); process.exitCode = 1; }
  else console.log("Send the capture folder and reply done. Include which file/build mode you tested and whether the marked event was the reported full blank.");
});
