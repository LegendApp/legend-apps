#!/usr/bin/env node

const fs = require("fs");
const path = require("path");

const projectRoot = process.cwd();
const candidateNativeDirs = ["macos", "ios"];

function isNativeAppleProject(dirPath) {
  if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
    return false;
  }

  const entries = fs.readdirSync(dirPath);
  return entries.includes("Podfile") || entries.some((entry) => entry.endsWith(".xcodeproj") || entry.endsWith(".xcworkspace"));
}

function shellEscape(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

const nodeBinary = process.env.NODE_BINARY || process.execPath;
const nativeDirs = candidateNativeDirs
  .map((dirName) => path.join(projectRoot, dirName))
  .filter(isNativeAppleProject);

for (const nativeDir of nativeDirs) {
  const baseEnvPath = path.join(nativeDir, ".xcode.env");
  const localEnvPath = `${baseEnvPath}.local`;

  if (!fs.existsSync(baseEnvPath)) {
    fs.writeFileSync(baseEnvPath, "export NODE_BINARY=$(command -v node)\n", { flag: "wx" });
  }

  if (!fs.existsSync(localEnvPath) && nodeBinary) {
    fs.writeFileSync(localEnvPath, `export NODE_BINARY=${shellEscape(nodeBinary)}\n`, { flag: "wx" });
  }
}
