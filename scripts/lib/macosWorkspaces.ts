import { createHash, type Hash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { rootDir, shellDir } from "./apps";
import { runCommand } from "./run";
import type { AppManifest } from "./types";

const macosSourceDir = path.join(shellDir, "macos");
const workspaceRoot = path.join(shellDir, ".legend", "workspaces");
const graphHashFile = ".legend-native-graph.hash";

const macosTemplateEntries = [
  ".gitignore",
  ".xcode.env",
  "Podfile",
  "PrivacyInfo.xcprivacy",
  "legendapp-shell-macos",
  "legendapp-shell-macos.xcodeproj",
  "legendapp-shell-macos.xcworkspace",
];

export function getMacOSDevWorkspaceDir() {
  return macosSourceDir;
}

export function getMacOSReleaseWorkspaceDir(appId: string) {
  return path.join(workspaceRoot, "release", appId, "macos");
}

export function getMacOSReleaseProjectPath(appId: string) {
  return path.relative(shellDir, getMacOSReleaseWorkspaceDir(appId));
}

export function ensureMacOSReleaseWorkspace(manifest: AppManifest) {
  const workspaceDir = getMacOSReleaseWorkspaceDir(manifest.id);
  fs.mkdirSync(workspaceDir, { recursive: true });
  ensureReleaseNodeModulesLink();
  ensureReleaseAppRoot(manifest.id);

  for (const entry of macosTemplateEntries) {
    copyTemplateEntry(entry, workspaceDir);
  }

  patchMacOSProjectForApp(workspaceDir, manifest);
  return workspaceDir;
}

function ensureReleaseNodeModulesLink() {
  const linkPath = path.join(workspaceRoot, "release", "node_modules");
  const targetPath = path.join(rootDir, "node_modules");

  fs.mkdirSync(path.dirname(linkPath), { recursive: true });

  if (fs.existsSync(linkPath)) {
    return;
  }

  fs.symlinkSync(targetPath, linkPath, "dir");
}

function ensureReleaseAppRoot(appId: string) {
  const appRoot = path.join(workspaceRoot, "release", appId);

  fs.mkdirSync(appRoot, { recursive: true });
  ensureSymlink(path.join(shellDir, "package.json"), path.join(appRoot, "package.json"), "file");
  ensureSymlink(path.join(shellDir, "app.config.ts"), path.join(appRoot, "app.config.ts"), "file");
}

function ensureSymlink(targetPath: string, linkPath: string, type: fs.symlink.Type) {
  if (fs.existsSync(linkPath)) {
    return;
  }

  fs.symlinkSync(targetPath, linkPath, type);
}

export function installMacOSPods(workspaceDir: string, configPath: string, appId: string) {
  const hash = getNativeGraphHash(workspaceDir, configPath);
  const hashPath = path.join(workspaceDir, graphHashFile);
  const lockPath = path.join(workspaceDir, "Podfile.lock");
  const manifestPath = path.join(workspaceDir, "Pods", "Manifest.lock");

  if (
    fs.existsSync(hashPath) &&
    fs.existsSync(lockPath) &&
    fs.existsSync(manifestPath) &&
    fs.readFileSync(hashPath, "utf8").trim() === hash
  ) {
    console.log(`Pods are up to date for ${appId}/macos at ${path.relative(rootDir, workspaceDir)}`);
    return;
  }

  runCommand("pod", ["install"], {
    cwd: workspaceDir,
    env: getMacOSEnv(appId, configPath),
  });

  fs.writeFileSync(hashPath, `${hash}\n`);
}

export function getMacOSEnv(appId: string, configPath: string) {
  return {
    LEGEND_APP: appId,
    LEGEND_PLATFORM: "macos",
    LEGEND_NATIVE_CONFIG: configPath,
    LEGEND_APP_CONFIG: configPath,
    LEGEND_SHELL_ROOT: shellDir,
  };
}

function copyTemplateEntry(entry: string, workspaceDir: string) {
  const from = path.join(macosSourceDir, entry);
  const to = path.join(workspaceDir, entry);

  if (!fs.existsSync(from)) {
    return;
  }

  fs.cpSync(from, to, {
    recursive: true,
    force: true,
    filter: (source) => {
      const name = path.basename(source);
      return name !== "xcuserdata" && name !== "Pods" && name !== "build" && name !== "Podfile.lock";
    },
  });
}

function patchMacOSProjectForApp(workspaceDir: string, manifest: AppManifest) {
  const projectPath = path.join(workspaceDir, "legendapp-shell-macos.xcodeproj", "project.pbxproj");
  let project = fs.readFileSync(projectPath, "utf8");

  project = project.replace(
    /PRODUCT_BUNDLE_IDENTIFIER = .*?;/g,
    `PRODUCT_BUNDLE_IDENTIFIER = ${quotePBX(manifest.bundleIds.macos)};`,
  );
  project = project.replace(
    /PRODUCT_NAME = .*?;/g,
    `PRODUCT_NAME = ${quotePBX(manifest.displayName)};`,
  );

  fs.writeFileSync(projectPath, project);
}

function getNativeGraphHash(workspaceDir: string, configPath: string) {
  const hash = createHash("sha256");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
    activeNativePackages?: { root: string }[];
    nativeGraphMode?: string;
    platform?: string;
  };

  hash.update(JSON.stringify({
    activeNativePackages: config.activeNativePackages?.map((pkg) => pkg.root).sort() ?? [],
    nativeGraphMode: config.nativeGraphMode,
    platform: config.platform,
  }));
  addFile(hash, path.join(rootDir, "bun.lock"));
  addFile(hash, path.join(rootDir, "package.json"));
  addFile(hash, path.join(shellDir, "package.json"));
  addFile(hash, path.join(workspaceDir, "Podfile"));

  for (const pkg of config.activeNativePackages ?? []) {
    const pkgRoot = path.join(rootDir, pkg.root);
    addFile(hash, path.join(pkgRoot, "package.json"));
    addFile(hash, path.join(pkgRoot, "react-native.config.js"));

    if (fs.existsSync(pkgRoot)) {
      for (const podspec of fs.readdirSync(pkgRoot).filter((file) => file.endsWith(".podspec")).sort()) {
        addFile(hash, path.join(pkgRoot, podspec));
      }

      addDirectoryFileList(hash, path.join(pkgRoot, "cpp"));
      addDirectoryFileList(hash, path.join(pkgRoot, "ios"));
      addDirectoryFileList(hash, path.join(pkgRoot, "macos"));
      addDirectoryFileList(hash, path.join(pkgRoot, "nitrogen", "generated"));
      addDirectoryFileList(hash, path.join(pkgRoot, "vendor"));
    }
  }

  return hash.digest("hex");
}

function addFile(hash: Hash, filePath: string) {
  hash.update(path.relative(rootDir, filePath));

  if (fs.existsSync(filePath)) {
    hash.update(fs.readFileSync(filePath));
  }
}

function addDirectoryFileList(hash: Hash, dirPath: string) {
  hash.update(path.relative(rootDir, dirPath));

  if (!fs.existsSync(dirPath)) {
    return;
  }

  for (const filePath of getDirectoryFiles(dirPath)) {
    hash.update(path.relative(rootDir, filePath));
  }
}

function getDirectoryFiles(dirPath: string): string[] {
  const files: string[] = [];

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const entryPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      files.push(...getDirectoryFiles(entryPath));
    } else if (entry.isFile() || entry.isSymbolicLink()) {
      files.push(entryPath);
    }
  }

  return files.sort();
}

function quotePBX(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}
