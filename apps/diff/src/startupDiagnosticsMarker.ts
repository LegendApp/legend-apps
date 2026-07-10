import { createInstrumentationLogger } from "@legend-apps/instrumentation";

const startupDiagnostics = createInstrumentationLogger({
  debugId: "diff-startup-candidates-v1",
  namespace: "diff",
  timingLabel: "DiffOpenTiming",
});

startupDiagnostics.timing("app.beforeDependencyImports", () => ({}));
