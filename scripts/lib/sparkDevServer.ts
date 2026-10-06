import fs from "node:fs";
import path from "node:path";
import { resolveDevServerPort, rootDir, withDefaultPortArg } from "./apps";
import { runCommand } from "./run";

function canonicalRoot(root: string) {
  try { return fs.realpathSync(root); }
  catch { return path.resolve(root); }
}

async function matchingMetro(project: string, port: number, https: boolean) {
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

export async function runSparkDevServer({ appId, project, cli, runnerArgs = [], appArgs = [], noOpen = false, env }: {
  appId: string;
  project: string;
  cli: string;
  runnerArgs?: string[];
  appArgs?: string[];
  noOpen?: boolean;
  env?: Record<string, string | undefined>;
}, execute: typeof runCommand = runCommand) {
  const port = resolveDevServerPort(appId, runnerArgs);
  if (await matchingMetro(project, port, runnerArgs.includes("--https"))) {
    console.log(`Reusing ${appId} dev server on port ${port}.`);
    if (!noOpen && !runnerArgs.includes("--no-open")) {
      const bundleArgs = runnerArgs.filter(arg => ["--https", "--no-dev", "--minify"].includes(arg));
      execute("bun", ["scripts/open-app.ts", appId, "macos", "--port", String(port), ...bundleArgs, "--", ...appArgs], { cwd: rootDir, env });
    }
  } else {
    execute("node", [cli, "dev", ...(noOpen ? ["--no-open"] : []),
      ...withDefaultPortArg(runnerArgs, port), ...appArgs.map(arg => `--app-arg=${arg}`)], { cwd: project, env });
  }
}
