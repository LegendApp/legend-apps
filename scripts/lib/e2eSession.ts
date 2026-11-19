import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { resolveDevServerPort, rootDir } from "./apps";
import { sharedDebugAppWorkspace } from "./sharedDebugHost";
import { matchingMetro } from "./sparkDevServer";

type Env = Record<string, string | undefined>;

/** A session name no other run shares, so a leftover session never blocks the next run with DEVICE_IN_USE. */
export function defaultAgentSession(base: string, env: Env = process.env, pid = process.pid) {
  if (env.AGENT_DEVICE_SESSION) return env.AGENT_DEVICE_SESSION;
  const job = env.JOB_NAME || (env.JOB_DIR ? path.basename(env.JOB_DIR) : "");
  return job ? `${job}-${base}` : `${base}-pid${pid}`;
}

/** The runner refuses new commands while it finishes one that exceeded its watchdog, usually an accessibility capture. */
export function isRunnerBusy(output: string) {
  return output.includes("RUNNER_BUSY") || output.includes("exceeded its execution watchdog");
}

const children = new Set<ChildProcess>();
const cleanups: Array<() => void> = [];
let cleaned = false;

function runCleanups() {
  if (cleaned) return;
  cleaned = true;
  for (const child of children) child.kill("SIGTERM");
  for (const cleanup of cleanups.reverse()) {
    try { cleanup(); } catch (error) { console.error(error instanceof Error ? error.message : error); }
  }
}

/** Runs `cleanup` once when the script exits normally, throws, or is stopped with SIGINT/SIGTERM/SIGHUP. */
export function onExit(cleanup: () => void) {
  if (cleanups.length === 0) {
    process.once("exit", runCleanups);
    for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143], ["SIGHUP", 129]] as const) {
      process.once(signal, () => { runCleanups(); process.exit(code); });
    }
  }
  cleanups.push(cleanup);
}

export type StepResult = { status: number; output: string };

/** Runs a step without blocking the event loop, so a stop signal reaches the cleanup while the step is still running. */
export function runStep(command: string, args: string[], options: { env?: Env; quiet?: boolean } = {}): Promise<StepResult> {
  return new Promise((resolve) => {
    const child = spawn(command, args, { cwd: rootDir, env: { ...process.env, ...options.env }, stdio: ["ignore", "pipe", "pipe"] });
    children.add(child);
    let output = "";
    child.stdout.on("data", (chunk) => { output += chunk; if (!options.quiet) process.stdout.write(chunk); });
    child.stderr.on("data", (chunk) => { output += chunk; process.stderr.write(chunk); });
    child.once("error", (error) => { children.delete(child); resolve({ status: 1, output: output + error.message }); });
    child.once("close", (code) => { children.delete(child); resolve({ status: code ?? 1, output }); });
  });
}

/** Retries `attempt` once after `recover` when the runner is still busy with a watchdog-abandoned capture. */
export async function retryOnRunnerBusy(attempt: () => Promise<StepResult>, recover: () => Promise<unknown>) {
  const first = await attempt();
  if (first.status === 0 || !isRunnerBusy(first.output)) return first;
  console.error("agent-device runner busy on a previous accessibility capture; resetting this run's session and retrying once.");
  await recover();
  return attempt();
}

/** agent-device bound to one session on the macOS host, with the session closed when the script ends. */
export function agentDevice(session: string) {
  const env = { AGENT_DEVICE_PLATFORM: "macos", AGENT_DEVICE_SESSION: session, AGENT_DEVICE_SESSION_LOCK: "reject" };
  const flags = ["--session", session, "--platform", "macos", "--session-lock", "reject"];
  const run = (args: string[], quiet = false) => runStep("agent-device", [...flags, ...args], { env, quiet });
  const close = () => run(["close"], true);
  onExit(() => { spawnSync("agent-device", [...flags, "close"], { cwd: rootDir, env: { ...process.env, ...env }, stdio: "ignore" }); });
  return { env, run, close };
}

/**
 * Starts the app's shared Debug Metro in its own process group and returns once it answers, so the
 * steps after it can run (`run macos` keeps Metro in the foreground and never returns). A Metro this
 * run did not start is reused and left running; the one it started is stopped when the script ends.
 */
export async function startDetachedMetro(appId: string, logPath: string, env: Env = process.env) {
  const port = resolveDevServerPort(appId, env.RCT_METRO_PORT ? ["--port", env.RCT_METRO_PORT] : []);
  const project = sharedDebugAppWorkspace(appId);
  if (await matchingMetro(project, port, false)) return port;
  fs.mkdirSync(path.dirname(logPath), { recursive: true });
  const log = fs.openSync(logPath, "a");
  const metro = spawn("bun", ["run", appId, "start", "macos", "--no-open", "--port", String(port)], {
    cwd: rootDir, detached: true, stdio: ["ignore", log, log],
  });
  fs.closeSync(log);
  metro.unref();
  onExit(() => { try { process.kill(-metro.pid!, "SIGTERM"); } catch {} });
  const deadline = Date.now() + 240_000;
  while (Date.now() < deadline) {
    if (metro.exitCode !== null) throw new Error(`Metro exited with ${metro.exitCode}; see ${logPath}`);
    if (await matchingMetro(project, port, false).catch(() => false)) return port;
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Metro did not answer on port ${port} within 240 seconds; see ${logPath}`);
}

/** Exits with the step's status when it failed. */
export function check(result: StepResult) {
  if (result.status !== 0) process.exit(result.status);
}
