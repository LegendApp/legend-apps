#!/usr/bin/env bun
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { rootDir } from "./lib/apps";
import { agentDevice, check, defaultAgentSession, retryOnRunnerBusy, runStep, startDetachedMetro } from "./lib/e2eSession";

const scenario = process.env.DIFF_E2E_SCENARIO ?? "local-folder-smoke";
const session = defaultAgentSession("diff-e2e");
const artifactsDir = path.join(rootDir, ".artifacts", "diff-e2e");
const fixtureDir = path.join(artifactsDir, "fixtures", scenario);
const stepsFileByScenario: Record<string, string> = {
  "app-surface-smoke": "diff-app-surface-smoke.steps.json",
  "file-filter-smoke": "diff-file-filter-smoke.steps.json",
  "local-folder-smoke": "diff-local-folder-smoke.steps.json",
};
const stepsFileName = stepsFileByScenario[scenario] ?? stepsFileByScenario["local-folder-smoke"];
const stepsFile = path.join(rootDir, "e2e", "agent-device", stepsFileName);
const skipBuild = process.env.DIFF_E2E_SKIP_BUILD === "1";

function run(command: string, args: string[], options: { cwd?: string; env?: Record<string, string | undefined> } = {}) {
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

function writeFile(relativePath: string, contents: string | Buffer) {
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
  if (scenario === "app-surface-smoke") {
    writeFile("assets/logo.bin", Buffer.from([0x00, 0x01, 0x02, 0x03]));
  }

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
  if (scenario === "app-surface-smoke") {
    writeFile("assets/logo.bin", Buffer.from([0xff, 0x00, 0xfe, 0x01]));
  }
}

fs.mkdirSync(artifactsDir, { recursive: true });
createFixtureRepo();

const agent = agentDevice(session);
if (!skipBuild) check(await runStep("bun", ["run", "diff", "build", "macos", "--dev"]));
const port = await startDetachedMetro("diff", path.join(artifactsDir, `metro-${session}.log`));
const openApp = async () => check(await runStep("bun", ["scripts/open-app.ts", "diff", "macos", "--port", String(port), "--", "--diff-folder", fixtureDir]));
await openApp();
const openAndRunSteps = async () => {
  const opened = await agent.run(["open", "so.legend.diff.macos", "--surface", "app", "--no-record"]);
  return opened.status === 0 ? agent.run(["batch", "--steps-file", stepsFile, "--on-error", "stop"]) : opened;
};
// Closing the session quits the app, so the retry reopens it on the fixture.
check(await retryOnRunnerBusy(openAndRunSteps, async () => { await agent.close(); await openApp(); }));
