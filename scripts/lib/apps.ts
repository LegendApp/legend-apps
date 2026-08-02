import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { AppManifest, AppPackageMetadata, Platform } from "./types";

export const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
export const shellDir = path.join(rootDir, "shell");
export const appsDir = path.join(rootDir, "apps");
export const packagesDir = path.join(rootDir, "packages");

export const appIds = ["music", "markdown", "code", "diff", "chat-history", "test-kitchen-sink"] as const;
export const platforms = ["macos", "ios", "android"] as const;
const commandModes = ["run", "dev", "start", "open", "build", "prebuild", "verify", "pods", "package", "githubrelease"] as const;
const devServerPorts: Record<(typeof appIds)[number], number> = {
  music: 19091,
  markdown: 19092,
  code: 19094,
  diff: 19095,
  "chat-history": 19096,
  "test-kitchen-sink": 19093,
};

type CommandMode = (typeof commandModes)[number] | "dev-check";

export function isPlatform(value: string): value is Platform {
  return platforms.includes(value as Platform);
}

export async function loadAppManifest(appId: string): Promise<AppManifest> {
  if (!appIds.includes(appId as (typeof appIds)[number])) {
    throw new Error(`Unknown app "${appId}". Expected one of: ${appIds.join(", ")}`);
  }

  const manifestPath = path.join(appsDir, appId, "app.manifest.ts");
  const mod = await import(manifestPath);
  return mod.default as AppManifest;
}

export function loadAppPackageMetadata(appId: string): AppPackageMetadata {
  if (!appIds.includes(appId as (typeof appIds)[number])) {
    throw new Error(`Unknown app "${appId}". Expected one of: ${appIds.join(", ")}`);
  }

  const packageJsonPath = path.join(appsDir, appId, "package.json");
  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const version = packageJson.version;
  if (typeof version !== "string" || version.length === 0) {
    throw new Error(`${appId}/package.json must define a version.`);
  }
  return { version };
}

export function assertSupportedPlatform(manifest: AppManifest, platform: Platform) {
  if (!manifest.platforms.includes(platform)) {
    throw new Error(
      `App "${manifest.id}" does not support ${platform}. Supported: ${manifest.platforms.join(", ")}`,
    );
  }
}

export function formatAppUsage(appId = "<app>") {
  return [
    `Usage: bun run ${appId} <action> [platform] [options]`,
    "",
    "Actions:",
    "  start      Start Metro/dev server",
    "  open       Open the already built macOS app",
    "  run        Build and run the app",
    "  build      Build a release app",
    "  package    Package, sign, notarize, and generate a Sparkle appcast for a macOS release",
    "  githubrelease Create a GitHub release for a packaged macOS app",
    "  prebuild   Generate iOS/Android native projects",
    "  verify     Verify generated config and package linking",
    "  pods       Install CocoaPods for the app/platform",
    "",
    "Platforms:",
    `  ${platforms.join(", ")} (defaults to macos when omitted)`,
    "",
    "Examples:",
    `  bun run ${appId} start`,
    `  bun run ${appId} open`,
    `  bun run ${appId} run`,
    `  bun run ${appId} pods`,
    `  bun run ${appId} build macos`,
    `  bun run ${appId} package macos`,
    `  bun run ${appId} githubrelease macos`,
    `  bun run ${appId} build macos x86`,
  ].join("\n");
}

export function getDefaultDevServerPort(appId: string) {
  if (!appIds.includes(appId as (typeof appIds)[number])) {
    throw new Error(`Unknown app "${appId}". Expected one of: ${appIds.join(", ")}`);
  }

  return devServerPorts[appId as (typeof appIds)[number]];
}

export function readPortArg(args: string[]) {
  const portEqualsArg = args.find((arg) => arg.startsWith("--port="));
  if (portEqualsArg) {
    return Number(portEqualsArg.slice("--port=".length));
  }

  const portIndex = args.findIndex((arg) => arg === "--port");
  if (portIndex >= 0) {
    return Number(args[portIndex + 1]);
  }

  return undefined;
}

export function resolveDevServerPort(appId: string, args: string[]) {
  const port = readPortArg(args) ?? getDefaultDevServerPort(appId);

  if (!Number.isInteger(port) || port <= 0) {
    throw new Error(`Invalid --port value for ${appId}: ${String(port)}`);
  }

  return port;
}

export function withDefaultPortArg(args: string[], port: number) {
  if (args.includes("--port") || args.some((arg) => arg.startsWith("--port="))) {
    return args;
  }

  return [...args, "--port", String(port)];
}

export function parseAppCommand(argv: string[]) {
  const [appOrFlag, ...rest] = argv;

  if (!appOrFlag) {
    throw new Error("Missing app id. Usage: bun run music macos");
  }

  if (appOrFlag === "--all") {
    const mode = rest.includes("--dev-check") ? "dev-check" : "run";
    return { all: true as const, mode: mode as CommandMode, appId: null, platform: null, extraArgs: [] };
  }

  let mode: CommandMode = "run";
  let platformArg = rest[0];
  let platformIndex = 0;
  let consumedArgs = 0;
  let platform: Platform;

  if (commandModes.includes(platformArg as (typeof commandModes)[number])) {
    mode = platformArg === "dev" ? "run" : platformArg as CommandMode;
    platformArg = rest[1];
    platformIndex = 1;
  }

  if (!platformArg || platformArg.startsWith("-")) {
    platform = "macos";
    consumedArgs = platformIndex;
  } else if (isPlatform(platformArg)) {
    platform = platformArg;
    consumedArgs = platformIndex + 1;
  } else {
    throw new Error(`Invalid platform "${platformArg}". Expected one of: ${platforms.join(", ")}`);
  }

  return {
    all: false as const,
    appId: appOrFlag,
    mode,
    platform,
    extraArgs: rest.slice(consumedArgs),
  };
}
