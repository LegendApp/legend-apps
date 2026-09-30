import { getUpdateStatus, configureUpdates, startUpdates, checkForUpdates } from "@legendapp/spark/updates";
import { settings$ } from "../settings/SettingsFile";
import { observe } from "@legendapp/state";
export function initializeUpdater() {
  let active = true, previousEnabled = false;
  let queue = Promise.resolve();
  let dispose: (() => void) | undefined;
  const ready = getUpdateStatus().then(status => {
    if (!active || __DEV__ || !status.available) return;
    dispose = observe(() => {
      const enabled = settings$.general.autoUpdate.enabled.get();
      const interval = settings$.general.autoUpdate.checkInterval.get() * 3600;
      queue = queue.catch(console.error).then(async () => {
        if (!active) return;
        await configureUpdates({ automaticallyChecks: enabled, checkIntervalSeconds: interval });
        if (!active) return;
        await startUpdates();
        if (enabled && !previousEnabled) await checkForUpdates({ mode: "background" });
        previousEnabled = enabled;
      });
      void queue.catch(console.error);
    });
  });
  void ready.catch(console.error);
  return { async remove() { active = false; dispose?.(); await ready; await queue; } };
}
