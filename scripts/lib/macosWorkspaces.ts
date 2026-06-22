import { createHash, type Hash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { appsDir, rootDir, shellDir } from "./apps";
import {
  getMacOSAppWrapperName,
  macOSAppTemplateDir,
  macOSProjectName,
  macOSSchemeFileName,
  macOSWorkspaceName,
  macOSXcodeProjectName,
} from "./macosShell";
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
  macOSAppTemplateDir,
  macOSXcodeProjectName,
  macOSWorkspaceName,
];

export function getMacOSAppDevWorkspaceDir(appId: string) {
  return path.join(workspaceRoot, "dev", appId, "macos");
}

export function getMacOSAppDevProjectPath(appId: string) {
  return path.relative(shellDir, getMacOSAppDevWorkspaceDir(appId));
}

export function getMacOSReleaseWorkspaceDir(appId: string) {
  return path.join(workspaceRoot, "release", appId, "macos");
}

export function getMacOSReleaseAppRootDir(appId: string) {
  return path.join(workspaceRoot, "release", appId);
}

export function getMacOSReleaseProjectPath(appId: string) {
  return path.relative(shellDir, getMacOSReleaseWorkspaceDir(appId));
}

export function getMacOSDevDerivedDataPath(workspaceDir: string) {
  return path.join(workspaceDir, "build", "xcodebuild-dev");
}

export function ensureMacOSReleaseWorkspace(manifest: AppManifest, configPath: string) {
  const workspaceDir = getMacOSReleaseWorkspaceDir(manifest.id);
  fs.mkdirSync(workspaceDir, { recursive: true });
  ensureReleaseWorkspaceLinks();
  ensureReleaseAppRoot(manifest, configPath);
  copyMacOSTemplate(workspaceDir);
  patchMacOSProjectForApp(workspaceDir, manifest);
  return workspaceDir;
}

export function ensureMacOSDevWorkspace(manifest: AppManifest) {
  const workspaceDir = getMacOSAppDevWorkspaceDir(manifest.id);
  fs.mkdirSync(workspaceDir, { recursive: true });
  ensureDevWorkspaceLinks();
  ensureDevAppRoot(manifest);
  copyMacOSTemplate(workspaceDir);
  patchMacOSProjectForApp(workspaceDir, manifest);
  return workspaceDir;
}

function copyMacOSTemplate(workspaceDir: string) {
  for (const entry of macosTemplateEntries) {
    copyTemplateEntry(entry, workspaceDir);
  }
}

function ensureReleaseWorkspaceLinks() {
  ensureWorkspaceLinks(path.join(workspaceRoot, "release"));
}

function ensureDevWorkspaceLinks() {
  ensureWorkspaceLinks(path.join(workspaceRoot, "dev"));
}

function ensureWorkspaceLinks(root: string) {
  ensureSymlink(path.join(rootDir, "node_modules"), path.join(root, "node_modules"), "dir");
  ensureSymlink(path.join(rootDir, "packages"), path.join(root, "packages"), "dir");
}

function ensureSymlink(targetPath: string, linkPath: string, type: fs.symlink.Type) {
  fs.mkdirSync(path.dirname(linkPath), { recursive: true });

  if (fs.existsSync(linkPath)) {
    return;
  }

  fs.symlinkSync(targetPath, linkPath, type);
}

function ensureReleaseAppRoot(manifest: AppManifest, configPath: string) {
  const appRoot = getMacOSReleaseAppRootDir(manifest.id);

  fs.mkdirSync(appRoot, { recursive: true });
  ensureSymlink(path.join(shellDir, "app.config.ts"), path.join(appRoot, "app.config.ts"), "file");
  ensureSymlink(path.join(shellDir, "react-native.config.js"), path.join(appRoot, "react-native.config.js"), "file");
  writeReleasePackageJson(manifest, configPath, appRoot);
}

function ensureDevAppRoot(manifest: AppManifest) {
  const appRoot = path.join(workspaceRoot, "dev", manifest.id);

  fs.mkdirSync(appRoot, { recursive: true });
  ensureSymlink(path.join(shellDir, "app.config.ts"), path.join(appRoot, "app.config.ts"), "file");
  ensureSymlink(path.join(shellDir, "react-native.config.js"), path.join(appRoot, "react-native.config.js"), "file");
  ensureSymlink(path.join(shellDir, "package.json"), path.join(appRoot, "package.json"), "file");
}

export function installMacOSPods(
  workspaceDir: string,
  configPath: string,
  appId: string,
  appRoot = shellDir,
) {
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
    env: getMacOSEnv(appId, configPath, appRoot),
  });

  fs.writeFileSync(hashPath, `${hash}\n`);
}

export function getMacOSEnv(appId: string, configPath: string, appRoot = shellDir) {
  return {
    LEGEND_APP: appId,
    LEGEND_PLATFORM: "macos",
    LEGEND_NATIVE_CONFIG: configPath,
    LEGEND_APP_CONFIG: configPath,
    LEGEND_APP_ROOT: appRoot,
    LEGEND_REPO_ROOT: rootDir,
    LEGEND_SHELL_ROOT: shellDir,
  };
}

function writeReleasePackageJson(manifest: AppManifest, configPath: string, appRoot: string) {
  const shellPackage = readJson(path.join(shellDir, "package.json"));
  const appPackage = readJson(path.join(appsDir, manifest.id, "package.json"));
  const generatedConfig = readJson(configPath) as {
    excludedNativePackages?: { name: string }[];
  };
  const excludedPackages = new Set(generatedConfig.excludedNativePackages?.map((pkg) => pkg.name) ?? []);
  const packageJsonPath = path.join(appRoot, "package.json");
  const packageJson = {
    ...shellPackage,
    name: `shell-${manifest.id}-release`,
    dependencies: filterDependencies({
      ...shellPackage.dependencies,
      ...appPackage.dependencies,
    }, excludedPackages),
    devDependencies: filterDependencies({
      ...shellPackage.devDependencies,
      ...appPackage.devDependencies,
    }, excludedPackages),
  };

  fs.rmSync(packageJsonPath, { force: true });
  fs.writeFileSync(packageJsonPath, `${JSON.stringify(packageJson, null, 2)}\n`);
}

function readJson(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, "utf8")) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  } & Record<string, unknown>;
}

function filterDependencies(
  dependencies: Record<string, string> | undefined,
  excludedPackages: Set<string>,
) {
  if (!dependencies) {
    return undefined;
  }

  const filtered = Object.fromEntries(
    Object.entries(dependencies).filter(([name]) => !excludedPackages.has(name)),
  );

  return Object.keys(filtered).length > 0 ? filtered : undefined;
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
  const projectPath = path.join(workspaceDir, macOSXcodeProjectName, "project.pbxproj");
  const schemePath = path.join(
    workspaceDir,
    macOSXcodeProjectName,
    "xcshareddata",
    "xcschemes",
    macOSSchemeFileName,
  );
  const appWrapperName = getMacOSAppWrapperName(manifest.displayName);
  let project = fs.readFileSync(projectPath, "utf8");
  const appReferencePattern = new RegExp(`/\\* ${escapeRegExp(macOSProjectName)}\\.app \\*/`, "g");
  const appPathPattern = new RegExp(`path = "${escapeRegExp(macOSProjectName)}\\.app";`, "g");
  const productNamePattern = new RegExp(`productName = "${escapeRegExp(macOSProjectName)}";`, "g");
  const schemeBuildablePattern = new RegExp(`BuildableName = "${escapeRegExp(macOSProjectName)}\\.app"`, "g");

  project = project.replace(
    appReferencePattern,
    `/* ${appWrapperName} */`,
  );
  project = project.replace(
    appPathPattern,
    `path = ${quotePBX(appWrapperName)};`,
  );
  project = project.replace(
    productNamePattern,
    `productName = ${quotePBX(manifest.displayName)};`,
  );
  project = project.replace(
    /PRODUCT_BUNDLE_IDENTIFIER = .*?;/g,
    `PRODUCT_BUNDLE_IDENTIFIER = ${quotePBX(manifest.bundleIds.macos)};`,
  );
  project = project.replace(
    /PRODUCT_NAME = .*?;/g,
    `PRODUCT_NAME = ${quotePBX(manifest.displayName)};`,
  );

  fs.writeFileSync(projectPath, project);

  if (fs.existsSync(schemePath)) {
    let scheme = fs.readFileSync(schemePath, "utf8");
    scheme = scheme.replace(
      schemeBuildablePattern,
      `BuildableName = ${quoteXMLAttribute(appWrapperName)}`,
    );
    fs.writeFileSync(schemePath, scheme);
  }
}

function getNativeGraphHash(workspaceDir: string, configPath: string) {
  const hash = createHash("sha256");
  const config = JSON.parse(fs.readFileSync(configPath, "utf8")) as {
    id?: string;
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
  addFile(hash, path.join(shellDir, "react-native.config.js"));
  if (config.id) {
    addFile(hash, path.join(appsDir, config.id, "package.json"));
  }
  addFile(hash, path.join(workspaceDir, "Podfile"));

  if (config.activeNativePackages?.some((pkg) => pkg.root === "packages/diff-parser")) {
    addFile(hash, path.join(rootDir, "packages/libgit2/LegendLibGit2.podspec"));
  }

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
      addCodegenSpecFiles(hash, path.join(pkgRoot, "src"));
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

function addCodegenSpecFiles(hash: Hash, dirPath: string) {
  hash.update(path.relative(rootDir, dirPath));

  if (!fs.existsSync(dirPath)) {
    return;
  }

  for (const filePath of getDirectoryFiles(dirPath)) {
    if (!/^Native.*\.[jt]sx?$/.test(path.basename(filePath))) {
      continue;
    }

    addFile(hash, filePath);
  }
}

function quotePBX(value: string) {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function quoteXMLAttribute(value: string) {
  return `"${value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll("\"", "&quot;")}"`;
}
