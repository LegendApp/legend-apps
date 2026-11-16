import { spawn } from "node:child_process";
import type { GitRunner } from "../../src/GitService";

export const realRunner: GitRunner = (options) => new Promise((resolve, reject) => {
  const command = options.target.type === "executable" ? options.target.path : options.target.name;
  const child = spawn(command, [...(options.args ?? [])], { cwd: options.cwd, env: { ...process.env, GIT_CONFIG_NOSYSTEM: "1", GIT_CONFIG_GLOBAL: "/dev/null", ...options.env }, signal: options.signal, stdio: ["pipe", "pipe", "pipe"] });
  const stdout: Buffer[] = [];
  const stderr: Buffer[] = [];
  child.stdin.on("error", error => { if ((error as NodeJS.ErrnoException).code !== "EPIPE") reject(error); });
  child.stdin.end(options.input);
  child.stdout.on("data", (bytes: Buffer) => stdout.push(bytes));
  child.stderr.on("data", (bytes: Buffer) => stderr.push(bytes));
  child.on("error", (error) => {
    if (error.name !== "AbortError") reject(error);
  });
  child.on("close", (code, signal) => resolve({
    exit: signal ? { type: "terminated", signal: 15 } : { type: "exited", code: code! },
    stdout: new Uint8Array(Buffer.concat(stdout)),
    stderr: new Uint8Array(Buffer.concat(stderr)),
    timedOut: false,
    aborted: options.signal?.aborted ?? false,
    outputTruncated: false,
  }));
});
