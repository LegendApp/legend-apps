import { displayKey } from "./displayRoles";
import type { DisplayInfo } from "@legendapp/spark/windows";

type AudiencePlatform = {
  open(display: DisplayInfo): Promise<void>;
  close(): Promise<void>;
  focusPresenter(): Promise<void>;
  update(state: { audienceOpen?: boolean; blackout?: boolean; displayMessage?: string; deckLocked?: boolean }): void;
};

// Serialize opens, closes and display changes so an unplug during an async
// window open cannot leave an orphaned audience window on the laptop display.
export function createAudienceSession(platform: AudiencePlatform) {
  let active: DisplayInfo | null = null;
  let rehearsing = false;
  let queue = Promise.resolve();
  const enqueue = (operation: () => Promise<void>) => {
    const result = queue.then(operation).then(() => true).catch((error) => {
      platform.update({ deckLocked: active !== null && !rehearsing, displayMessage: `Audience window: ${error instanceof Error ? error.message : String(error)}` });
      return false;
    });
    queue = result.then(() => {});
    return result;
  };

  return {
    open(display: DisplayInfo, rehearsal = false) {
      return enqueue(async () => {
        // Apply the lock in queue order; an earlier close must not clear it.
        platform.update({ deckLocked: !rehearsal });
        await platform.open(display);
        active = display;
        rehearsing = rehearsal;
        platform.update({ audienceOpen: true, deckLocked: !rehearsal, blackout: false, displayMessage: "" });
        if (!rehearsing) await platform.focusPresenter();
      });
    },
    close() {
      return enqueue(async () => {
        await platform.close();
        active = null;
        platform.update({ audienceOpen: false, deckLocked: false, blackout: false });
        await platform.focusPresenter();
      });
    },
    closed() {
      active = null;
      platform.update({ audienceOpen: false, deckLocked: false, blackout: false });
    },
    displaysChanged(displays: DisplayInfo[]) {
      return enqueue(async () => {
        if (!active) return;
        const next = displays.find((display) => active && displayKey(display) === displayKey(active));
        if (!next) {
          platform.update({ displayMessage: "Presentation display disconnected. Reconnect it, select a display, then press Present to resume." });
          await platform.close();
          active = null;
          platform.update({ audienceOpen: false, deckLocked: false, blackout: false });
          await platform.focusPresenter();
        } else if (JSON.stringify([next.id, next.size, next.workArea]) !== JSON.stringify([active.id, active.size, active.workArea])) {
          await platform.open(next);
          active = next;
          if (!rehearsing) await platform.focusPresenter();
        }
      });
    },
  };
}
