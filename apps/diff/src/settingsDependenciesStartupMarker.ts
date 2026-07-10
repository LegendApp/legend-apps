import { logDiffOpenTiming } from "./diffInstrumentation";

logDiffOpenTiming("settings.dependencies.start", () => ({}));

export function markSettingsModuleEvaluated() {
  logDiffOpenTiming("settings.module.evaluated", () => ({}));
}
