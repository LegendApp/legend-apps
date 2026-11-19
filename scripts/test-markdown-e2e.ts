#!/usr/bin/env bun
import fs from "node:fs";
import path from "node:path";
import { rootDir } from "./lib/apps";
import { agentDevice, check, defaultAgentSession, retryOnRunnerBusy, runStep, startDetachedMetro } from "./lib/e2eSession";

const scenario = process.env.MARKDOWN_E2E_SCENARIO ?? "far-down-structural-edits";
const seed = process.env.MARKDOWN_E2E_SEED ?? "12345";
const blockCount = process.env.MARKDOWN_E2E_BLOCK_COUNT ?? "2000";
const session = defaultAgentSession("markdown-e2e");
const artifactsDir = path.join(rootDir, ".artifacts", "markdown-e2e");
const stepsFileByScenario: Record<string, string> = {
  "editor-large-document": "markdown-editor-large-document.steps.json",
  "editor-code-block-smoke": "markdown-editor-code-block-smoke.steps.json",
  "editor-edit-navigation-smoke": "markdown-editor-edit-navigation-smoke.steps.json",
  "editor-navigation-smoke": "markdown-editor-navigation-smoke.steps.json",
  "editor-selection-smoke": "markdown-editor-selection-smoke.steps.json",
  "editor-soft-wrap-selection": "markdown-editor-soft-wrap-selection.steps.json",
  "editor-theme-reflow-smoke": "markdown-editor-theme-reflow-smoke.steps.json",
  "editor-ui-smoke": "markdown-editor-ui-smoke.steps.json",
  "far-down-structural-edits": "markdown-far-down.steps.json",
  "hydrate-while-editing": "markdown-far-down.steps.json",
};
const stepsFileName = stepsFileByScenario[scenario];
if (!stepsFileName) throw new Error(`Unknown Markdown E2E scenario: ${scenario}`);
const stepsFile = path.join(rootDir, "e2e", "agent-device", stepsFileName);
const skipBuild = process.env.MARKDOWN_E2E_SKIP_BUILD === "1";

fs.mkdirSync(artifactsDir, { recursive: true });
const agent = agentDevice(session);

if (!skipBuild) check(await runStep("bun", ["run", "markdown", "build", "macos", "--dev"]));
const port = await startDetachedMetro("markdown", path.join(artifactsDir, `metro-${session}.log`));
const openApp = async () => check(await runStep("bun", [
  "scripts/open-app.ts",
  "markdown",
  "macos",
  "--port",
  String(port),
  "--",
  `--markdown-e2e=${scenario}`,
  `--markdown-e2e-seed=${seed}`,
  `--markdown-e2e-block-count=${blockCount}`,
]));
await openApp();
// Closing the session quits the app, so the retry reopens it with the scenario's launch args.
check(await retryOnRunnerBusy(
  () => agent.run(["batch", "--steps-file", stepsFile, "--on-error", "stop"]),
  async () => { await agent.close(); await openApp(); },
));
