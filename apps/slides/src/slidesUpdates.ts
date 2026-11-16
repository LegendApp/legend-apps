import { observe } from "@legendapp/state";
import { checkForUpdates, configureUpdates, getUpdateStatus, startUpdates } from "@legendapp/spark/updates";
import { getSlidesState, slidesState$ } from "./slidesStore";

let audienceOpenings = 0;
let checkingManually = false;
let configuration = Promise.resolve();

function updatesPaused() {
  const state = getSlidesState();
  return audienceOpenings > 0 || state.deckLocked || state.audienceOpen;
}

function reportUpdateError(error: unknown) {
  console.error("[SlidesUpdates]", error);
}

function synchronizeUpdates() {
  configuration = configuration.catch(reportUpdateError).then(async () => {
    const status = await getUpdateStatus();
    if (status.available) {
      await configureUpdates({ automaticallyChecks: !updatesPaused(), checkIntervalSeconds: 86400 });
      await startUpdates();
    }
  });
  return configuration;
}

export function installSlidesUpdates() {
  return observe(() => ({ locked: slidesState$.deckLocked.get(), audience: slidesState$.audienceOpen.get() }), () => {
    void synchronizeUpdates().catch(reportUpdateError);
  });
}

export async function checkSlidesForUpdates() {
  if (updatesPaused() || checkingManually) return;
  checkingManually = true;
  try {
    await synchronizeUpdates();
    const status = await getUpdateStatus();
    if (status.available && status.canCheck && !updatesPaused()) await checkForUpdates();
  } catch (error) {
    reportUpdateError(error);
  } finally {
    checkingManually = false;
  }
}

export async function withSlidesUpdatesPaused(openAudience: () => Promise<void>) {
  audienceOpenings++;
  try {
    await synchronizeUpdates();
    // Disabling scheduled checks does not cancel an existing Sparkle session.
    const status = await getUpdateStatus();
    if (checkingManually || (status.available && !status.canCheck)) {
      throw new Error("Finish checking for updates before opening the audience window.");
    }
    await openAudience();
  } finally {
    audienceOpenings--;
    void synchronizeUpdates().catch(reportUpdateError);
  }
}
