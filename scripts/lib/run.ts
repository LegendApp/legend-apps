import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { getDefaultDevServerPort, resolveDevServerPort, rootDir, shellDir, withDefaultPortArg } from "./apps";
import { splitLaunchArgs, type OptionSpecs } from "./launchArgs";
import { macOSSchemeName, macOSWorkspaceName, macOSXcodeProjectName } from "./macosShell";
import { getMacOSDevDerivedDataPath } from "./macosWorkspaces";
import type { Platform } from "./types";

const macosRunOptionSpecs: OptionSpecs = {
  "--configuration": "value",
  "--mode": "value",
  "--no-packager": "boolean",
  "--port": "value",
  "--project-path": "value",
  "--scheme": "value",
  "--terminal": "value",
  "--verbose": "boolean",
};

export function runCommand(command: string, args: string[], options: {
  cwd?: string;
  env?: Record<string, string | undefined>;
} = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: {
      ...process.env,
      ...options.env,
    },
    stdio: "inherit",
  });

  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

function readStringArg(args: string[], names: string[], defaultValue: string) {
  for (const name of names) {
    const equalsArg = args.find((arg) => arg.startsWith(`${name}=`));
    if (equalsArg) {
      return equalsArg.slice(name.length + 1);
    }

    const index = args.findIndex((arg) => arg === name);
    if (index >= 0 && args[index + 1]) {
      return args[index + 1];
    }
  }

  return defaultValue;
}

function runMacOSBuildForLaunchArgs(args: string[], env: Record<string, string | undefined>) {
  const mode = readStringArg(args, ["--mode", "--configuration"], "Debug");
  const projectPath = readStringArg(args, ["--project-path"], "macos");
  const scheme = readStringArg(args, ["--scheme"], macOSSchemeName);
  const terminal = readStringArg(args, ["--terminal"], "ghostty");
  const projectDir = path.join(shellDir, projectPath);
  const workspacePath = path.join(projectDir, macOSWorkspaceName);
  const xcodeProjectPath = path.join(projectDir, macOSXcodeProjectName);
  const derivedDataPath = getMacOSDevDerivedDataPath(projectDir);
  const containerArgs = fs.existsSync(workspacePath)
    ? ["-workspace", workspacePath]
    : ["-project", xcodeProjectPath];

  runCommand(
    "xcodebuild",
    [
      ...containerArgs,
      "-configuration",
      mode,
      "-scheme",
      scheme,
      "-derivedDataPath",
      derivedDataPath,
    ],
    {
      cwd: shellDir,
      env: {
        ...env,
        RCT_NO_LAUNCH_PACKAGER: args.includes("--no-packager") ? "true" : undefined,
        RCT_TERMINAL: terminal,
      },
    },
  );
}

export function runPlatformCommand(
  appId: string,
  platform: Platform,
  mode: "dev" | "release",
  extraArgs: string[] = [],
  extraEnv: Record<string, string | undefined> = {},
) {
  const macosArgs = platform === "macos" ? splitLaunchArgs(extraArgs, macosRunOptionSpecs) : undefined;
  const runnerArgs = macosArgs?.runnerArgs ?? extraArgs;
  const launchArgs = macosArgs?.launchArgs ?? [];
  const devServerPort = mode === "dev"
    ? resolveDevServerPort(appId, runnerArgs)
    : undefined;
  const env = {
    LEGEND_APP: appId,
    LEGEND_PLATFORM: platform,
    RCT_METRO_PORT: devServerPort ? String(devServerPort) : undefined,
    ...extraEnv,
  };

  if (platform === "ios") {
    runCommand(
      "bun",
      mode === "release"
        ? ["x", "expo", "run:ios", "--configuration", "Release"]
        : ["x", "expo", "run:ios", ...extraArgs],
      { cwd: shellDir, env },
    );
  } else if (platform === "android") {
    runCommand(
      "bun",
      mode === "release"
        ? ["x", "expo", "run:android", "--variant", "release"]
        : ["x", "expo", "run:android", ...extraArgs],
      { cwd: shellDir, env },
    );
  } else {
    const argsWithPort = withDefaultPortArg(runnerArgs, devServerPort ?? getDefaultDevServerPort(appId));
    const openMode = readStringArg(argsWithPort, ["--mode", "--configuration"], "Debug");
    const openArgs = openMode === "Release" ? ["--mode", "Release"] : ["--port", String(devServerPort)];
    runMacOSBuildForLaunchArgs(argsWithPort, env);
    runCommand("bun", ["scripts/open-app.ts", appId, platform, ...openArgs, ...launchArgs], {
      cwd: rootDir,
      env,
    });
  }
}
