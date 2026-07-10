import { createInstrumentationLogger } from "@legend-apps/instrumentation";

const startupDiagnostics = createInstrumentationLogger({
  debugId: "diff-startup-boundaries-v2",
  namespace: "diff",
  timingLabel: "DiffOpenTiming",
});

export function markDiffStartupBoundary(event: string) {
  startupDiagnostics.timing(event, () => ({}));
}

markDiffStartupBoundary("app.beforeDependencyImports");
