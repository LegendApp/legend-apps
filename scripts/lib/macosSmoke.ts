import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import type { MacOSReleaseArch } from "./types";

export async function smokeLaunchMacOSApp({
  executablePath,
  appId,
  arch,
  durationMs = 20_000,
  reportsDir = path.join(os.homedir(), "Library/Logs/DiagnosticReports"),
}: {
  executablePath: string;
  appId: string;
  arch: MacOSReleaseArch;
  durationMs?: number;
  reportsDir?: string;
}) {
  const executable = path.basename(executablePath);
  const reports = () => fs.existsSync(reportsDir)
    ? fs.readdirSync(reportsDir).filter(name => name.startsWith(`${executable}-`) && name.endsWith(".ips"))
    : [];
  const previousReports = new Set(reports());
  const started = Date.now();
  const child = spawn(executablePath, ["--legend-smoke"], { stdio: ["ignore", "pipe", "pipe"] });
  let output = "";
  for (const stream of [child.stdout, child.stderr]) {
    stream.on("data", chunk => { output = (output + chunk.toString()).slice(-16_384); });
  }
  let exit: string | undefined;
  const exited = new Promise<void>(resolve => {
    child.once("error", error => { exit = error.message; resolve(); });
    child.once("exit", (code, signal) => { exit = signal ?? `status ${code}`; resolve(); });
  });
  let crashReport: string | undefined;
  let elapsed = 0;
  try {
    do {
      const report = reports().find(name => !previousReports.has(name));
      crashReport = report && path.join(reportsDir, report);
      elapsed = Date.now() - started;
      if (exit || crashReport || elapsed >= durationMs) break;
      await Promise.race([exited, delay(Math.min(100, durationMs - elapsed))]);
    } while (true);

    if (exit || crashReport) {
      const predicate = `process == ${JSON.stringify(executable)}`;
      const logs = spawnSync("log", ["show", "--last", "2m", "--predicate", predicate], {
        encoding: "utf8", timeout: 5_000, maxBuffer: 1_048_576,
      });
      const fatal = `${output}\n${logs.stdout ?? ""}`.split(/\r?\n/)
        .find(line => /getEnforcing|Unhandled JS Exception|RCTFatal/.test(line));
      let reason = fatal?.trim();
      if (crashReport) {
        try {
          const text = fs.readFileSync(crashReport, "utf8");
          const report = JSON.parse(text.slice(text.indexOf("\n") + 1));
          reason ??= JSON.stringify(report.asi ?? report.termination ?? report.exception);
        } catch {
          reason ??= "Crash report is not yet readable.";
        }
      }
      throw new Error([
        `Release smoke launch failed: ${appId} (${arch}) ${exit ? "exited" : "crashed"} after ${(elapsed / 1000).toFixed(1)}s${exit ? ` (${exit})` : ""}.`,
        reason && `  reason: ${reason}`,
        crashReport && `  crash report: ${crashReport}`,
        `Fix: add the module to apps/${appId}/app.manifest.ts nativeModules.macos, then rebuild.`,
      ].filter(Boolean).join("\n"));
    }
  } finally {
    if (!exit) {
      child.kill("SIGTERM");
      await Promise.race([exited, delay(5_000)]);
      if (!exit) {
        child.kill("SIGKILL");
        await exited;
      }
    }
  }
}
