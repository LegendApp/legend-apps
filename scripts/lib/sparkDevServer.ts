import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { resolveDevServerPort, rootDir } from "./apps";
import { runCommand } from "./run";

function canonicalRoot(root: string) {
  try { return fs.realpathSync(root); }
  catch { return path.resolve(root); }
}

export async function matchingMetro(project: string, port: number, https: boolean) {
  const url = `${https ? "https" : "http"}://127.0.0.1:${port}/status`;
  let response: Response;
  let status: string;
  try {
    response = await fetch(url, { signal: AbortSignal.timeout(2000), redirect: "error" });
    status = await response.text();
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code ?? (error as { cause?: NodeJS.ErrnoException }).cause?.code;
    if (code === "ECONNREFUSED" || code === "ConnectionRefused") return false;
    throw new Error(`Could not check the dev server on port ${port}. Retry when it is ready.`, { cause: error });
  }
  const root = response.headers.get("X-React-Native-Project-Root");
  if (!response.ok || status.trim() !== "packager-status:running" || !root) {
    throw new Error(`Port ${port} is occupied by an unrecognized server. Stop it or choose --port.`);
  }
  if (canonicalRoot(decodeURI(root)) !== canonicalRoot(project)) {
    throw new Error(`Port ${port} serves ${decodeURI(root)}, not ${project}. Stop that server or choose --port.`);
  }
  return true;
}

/** Expo Metro deliberately avoids Spark's exact per-app development-build fingerprint gate. */
export async function runSharedDebugMetro({ appId, project, runnerArgs, appArgs, noOpen, env }: {
  appId: string; project: string; runnerArgs: string[]; appArgs: string[]; noOpen: boolean;
  env?: Record<string, string | undefined>;
}, execute: typeof runCommand = runCommand) {
  const port = resolveDevServerPort(appId, runnerArgs);
  if (runnerArgs.some(arg => !["--port", "--no-open", "--clear", "--max-workers", "--no-dev", "--minify"].includes(arg) && !/^\d+$/.test(arg) && !/^--(?:port|max-workers)=\d+$/.test(arg))) {
    throw new Error("Shared Debug Metro supports --port, --max-workers, --clear, --no-dev, --minify and --no-open.");
  }
  const open = () => {
    if (!noOpen && !runnerArgs.includes("--no-open")) execute("bun", ["scripts/open-app.ts", appId, "macos", "--port", String(port), ...runnerArgs.filter(arg => ["--no-dev", "--minify"].includes(arg)), "--", ...appArgs], { cwd: rootDir, env });
  };
  if (await matchingMetro(project, port, false)) { open(); return; }
  const cli = createRequire(path.join(project, "package.json")).resolve("expo/bin/cli");
  const args = runnerArgs.filter(arg => !["--no-open", "--no-dev", "--minify"].includes(arg));
  const child = spawn("node", ["--dns-result-order=ipv4first", cli, "start", project, "--localhost",
    ...args, ...(!args.some(arg => arg === "--port" || arg.startsWith("--port=")) ? ["--port", String(port)] : [])], {
    cwd: project, env: { ...process.env, ...env, EXPO_NO_TYPESCRIPT_SETUP: "1" }, stdio: "inherit",
  });
  let ended = false;
  const exited = new Promise<number>((resolve, reject) => {
    child.once("error", reject);
    child.once("exit", (code) => { ended = true; resolve(code ?? 1); });
  });
  const stop = () => { child.kill("SIGTERM"); };
  process.once("SIGINT", stop); process.once("SIGTERM", stop);
  try {
    const deadline = Date.now() + 120_000;
    while (!ended && Date.now() < deadline) {
      if (await matchingMetro(project, port, false).catch(error => {
        const cause = error.cause;
        if (cause?.name === "TimeoutError" || ["ECONNRESET", "ConnectionClosed"].includes(cause?.code)) return false;
        throw error;
      })) { open(); break; }
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    if (!ended && Date.now() >= deadline) throw new Error("Expo Metro did not start within 120 seconds.");
    const code = await exited;
    if (code) process.exitCode = code;
  } finally {
    stop();
    process.removeListener("SIGINT", stop); process.removeListener("SIGTERM", stop);
  }
}
