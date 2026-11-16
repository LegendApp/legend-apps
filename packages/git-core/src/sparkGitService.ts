import { decodeProcessText } from "@legend-apps/runtime-utils";
import { runCommand } from "@legendapp/spark/processes";
import { GitService, type GitRunner } from "./GitService";

const services = new Map<string, GitService>();

/** A GitService that runs Git through Spark's process runtime, or through `runner` when given. */
export function createGitService(repoRoot: string, runner: GitRunner = runCommand) {
  return new GitService(repoRoot, runner, decodeProcessText);
}

/** The shared Spark-backed GitService for a repository root. */
export function getGitService(repoRoot: string) {
  const root = repoRoot.replace(/\/+$/, "") || "/";
  let service = services.get(root);
  if (!service) {
    service = createGitService(root);
    services.set(root, service);
  }
  return service;
}
