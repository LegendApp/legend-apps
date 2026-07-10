import { logDiffOpenTiming } from "./diffInstrumentation";

logDiffOpenTiming("viewer.dependencies.start", () => ({}));

export function markViewerShellModuleEvaluated() {
  logDiffOpenTiming("viewer.shell.module.evaluated", () => ({}));
}
