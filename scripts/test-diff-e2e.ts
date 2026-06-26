#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { rootDir } from "./lib/apps";

const scenario = process.env.DIFF_E2E_SCENARIO ?? "local-folder-smoke";
const session = process.env.AGENT_DEVICE_SESSION ?? "diff-e2e";
const artifactsDir = path.join(rootDir, ".artifacts", "diff-e2e");
const fixtureDir = path.join(artifactsDir, "fixtures", "local-folder-smoke");
const stepsFileByScenario: Record<string, string> = {
  "local-folder-smoke": "diff-local-folder-smoke.steps.json",
};
const stepsFileName = stepsFileByScenario[scenario] ?? stepsFileByScenario["local-folder-smoke"];
const stepsFile = path.join(rootDir, "e2e", "agent-device", stepsFileName);
const skipBuild = process.env.DIFF_E2E_SKIP_BUILD === "1";

function run(command: string, args: string[], options: { cwd?: string; env?: NodeJS.ProcessEnv } = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? rootDir,
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

function writeFile(relativePath: string, contents: string) {
  const filePath = path.join(fixtureDir, relativePath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, contents);
}

function createFixtureRepo() {
  fs.rmSync(fixtureDir, { force: true, recursive: true });
  fs.mkdirSync(fixtureDir, { recursive: true });

  writeFile("src/App.tsx", "export function App() {\n  return null;\n}\n");
  writeFile("src/Deleted.ts", "export const removed = true;\n");
  writeFile("README.md", "# Fixture\n");

  run("git", ["init"], { cwd: fixtureDir });
  run("git", ["add", "."], { cwd: fixtureDir });
  run("git", [
    "-c",
    "user.email=diff-e2e@example.com",
    "-c",
    "user.name=Diff E2E",
    "commit",
    "-m",
    "initial fixture",
  ], { cwd: fixtureDir });

  writeFile("src/App.tsx", "export function App() {\n  return \"changed\";\n}\n");
  writeFile("src/NewFile.ts", "export const added = true;\n");
  fs.rmSync(path.join(fixtureDir, "src", "Deleted.ts"));
}

fs.mkdirSync(artifactsDir, { recursive: true });
createFixtureRepo();

run("bun", [
  "run",
  "diff",
  skipBuild ? "open" : "run",
  "macos",
  "--",
  "--diff-folder",
  fixtureDir,
]);

run("agent-device", [
  "--session",
  session,
  "--platform",
  "macos",
  "--session-lock",
  "reject",
  "batch",
  "--steps-file",
  stepsFile,
  "--on-error",
  "stop",
], {
  env: {
    AGENT_DEVICE_PLATFORM: "macos",
    AGENT_DEVICE_SESSION: session,
    AGENT_DEVICE_SESSION_LOCK: "reject",
  },
});
