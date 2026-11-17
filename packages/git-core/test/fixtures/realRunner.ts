import { spawn } from "node:child_process";
import type { GitRunner } from "../../src/GitService";

export const realRunner: GitRunner = (options) => new Promise((resolve, reject) => {
  const command = options.target.type === "executable" ? options.target.path : options.target.name;
  // Its own process group, so an abort ends the whole tree (as Spark's runner does), not just the direct child.
  const child = spawn(command, [...(options.args ?? [])], { cwd: options.cwd, env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", ...options.env }, detached: true, stdio: ["pipe", "pipe", "pipe"] });
  const abort = () => { try { process.kill(-child.pid!, "SIGTERM"); } catch { /* already gone */ } };
  if (options.signal?.aborted) abort();
  options.signal?.addEventListener("abort", abort, { once: true });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdin.on("error", error => { if ((error as NodeJS.ErrnoException).code !== "EPIPE") reject(error); });
  child.stdin.end(options.input);
  child.stdout.on("data", (bytes: Buffer) => stdout.push(bytes));
  child.stderr.on("data", (bytes: Buffer) => { stderr.push(bytes); options.onOutput?.({ stream: "stderr", bytes: new Uint8Array(bytes) }); });
  child.on("error", (error) => {
    if (error.name !== "AbortError") reject(error);
  });
  child.on("close", (code, signal) => { options.signal?.removeEventListener("abort", abort); resolve({
    exit: signal ? { type: "terminated", signal: 15 } : { type: "exited", code: code! },
    stdout: new Uint8Array(Buffer.concat(stdout)),
    stderr: new Uint8Array(Buffer.concat(stderr)),
    timedOut: false,
    aborted: options.signal?.aborted ?? false,
    outputTruncated: false,
  }); });
});
