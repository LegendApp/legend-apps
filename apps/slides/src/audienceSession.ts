import type { Display } from "@legend-apps/window-manager";

type AudiencePlatform = {
  open(display: Display): Promise<void>;
  close(): Promise<void>;
  focusPresenter(): Promise<void>;
  update(state: { audienceOpen?: boolean; blackout?: boolean; displayMessage?: string; deckLocked?: boolean }): void;
};

// Serialize opens, closes and display changes so an unplug during an async
// window open cannot leave an orphaned audience window on the laptop display.
export function createAudienceSession(platform: AudiencePlatform) {
  let active: Display | null = null;
  let rehearsing = false;
  let queue = Promise.resolve();
  const enqueue = (operation: () => Promise<void>) => {
    queue = queue.then(operation).catch((error) => {
      platform.update({ deckLocked: active !== null && !rehearsing, blackout: true, displayMessage: `Audience window: ${error instanceof Error ? error.message : String(error)}` });
    });
    return queue;
  };

  return {
    open(display: Display, rehearsal = false) {
      platform.update({ deckLocked: !rehearsal });
      return enqueue(async () => {
        await platform.open(display);
        active = display;
        rehearsing = rehearsal;
        platform.update({ audienceOpen: true, blackout: false, displayMessage: "" });
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
    displaysChanged(displays: Display[]) {
      return enqueue(async () => {
        if (!active) return;
        const next = displays.find((display) => display.id === active?.id);
        if (!next) {
          platform.update({ blackout: true, displayMessage: "Presentation display disconnected. Reconnect it, select a display, then press Present to resume." });
          await platform.close();
          active = null;
          platform.update({ audienceOpen: false, deckLocked: false });
          await platform.focusPresenter();
        } else if (Object.keys(next.frame).some((key) => next.frame[key as keyof Display["frame"]] !== active?.frame[key as keyof Display["frame"]])) {
          await platform.open(next);
          active = next;
          if (!rehearsing) await platform.focusPresenter();
        }
      });
    },
  };
}
