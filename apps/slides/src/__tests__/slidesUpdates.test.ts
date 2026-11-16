import { afterEach, beforeEach, expect, mock, test } from "bun:test";
import { observable } from "@legendapp/state";
import type { UpdateStatus } from "@legendapp/spark/updates";
import type { MenuOptions } from "@legendapp/spark/menus";

let available = true;
let canCheck = true;
let automaticallyChecks = false;
let calls: string[] = [];
let menu: MenuOptions;
let failConfiguration = false;
const status = async (): Promise<UpdateStatus> => available ? {
  available: true, started: true, canCheck, automaticallyChecks, checkIntervalSeconds: 86400,
  feedURL: "https://example.com/updates.xml", skippedBuild: null, skippedMajorBuild: null, lastCheckedAt: null,
} : {
  available: false, reason: "development", started: false, canCheck: false, automaticallyChecks: false,
  checkIntervalSeconds: null, skippedBuild: null, skippedMajorBuild: null, lastCheckedAt: null,
};
mock.module("@legendapp/spark/updates", () => ({
  getUpdateStatus: status,
  configureUpdates: async (config: { automaticallyChecks: boolean; checkIntervalSeconds: number }) => {
    expect(config.checkIntervalSeconds).toBe(86400);
    if (failConfiguration) { failConfiguration = false; throw new Error("configuration failed"); }
    automaticallyChecks = config.automaticallyChecks;
    calls.push(`automatic:${automaticallyChecks}`);
  },
  startUpdates: async () => { calls.push("start"); },
  checkForUpdates: async () => { calls.push("check"); canCheck = false; },
}));
mock.module("@legendapp/spark/menus", () => ({ useMenu: (config: MenuOptions) => { menu = config; } }));
mock.module("@legendapp/state/react", () => ({ useValue: (read: () => unknown) => read() }));
mock.module("../webExport", () => ({ exportDeckToHTML: async () => {}, webExport$: observable({ status: "idle" }) }));
mock.module("@legendapp/spark/settings/window", () => ({ createSettingsWindowOptions: (options: object) => options }));
mock.module("@legend-apps/runtime-utils", () => ({ openOrShowWindow: async (_id: string, open: () => Promise<void>) => open() }));
mock.module("@legendapp/spark/windows", () => ({
  createWindowsNavigator: () => ({ open: async () => { expect(automaticallyChecks).toBe(false); calls.push("audience"); } }),
  setWindowBounds: async () => { expect(getSlidesState().audienceOpen).toBe(true); },
  setWindowFullscreen: async () => {},
}));
const { getSlidesState, setSlidesState } = await import("../slidesStore");
const { installSlidesUpdates, checkSlidesForUpdates, withSlidesUpdatesPaused } = await import("../slidesUpdates");
const { openSlidesAudienceWindow } = await import("../slidesWindows");
const { useSlidesMenus } = await import("../slidesMenus");
const turn = () => new Promise<void>(resolve => setTimeout(resolve, 0));
let dispose: (() => void) | undefined;
beforeEach(async () => {
  available = true; canCheck = true; automaticallyChecks = false; failConfiguration = false;
  setSlidesState({ deckLocked: false, audienceOpen: false });
  await turn(); calls = [];
});
afterEach(async () => { dispose?.(); dispose = undefined; await turn(); });

test("unavailable development updates do not start or check", async () => {
  available = false;
  dispose = installSlidesUpdates();
  await checkSlidesForUpdates();
  expect(calls).toEqual([]);
  await withSlidesUpdatesPaused(async () => { calls.push("open"); });
  expect(calls).toEqual(["open"]);
});

test("automatic checks pause for both a locked deck and a rehearsal audience, then resume", async () => {
  dispose = installSlidesUpdates(); await turn();
  expect(automaticallyChecks).toBe(true);
  expect(calls).toContain("start");
  setSlidesState({ deckLocked: true }); await turn();
  expect(automaticallyChecks).toBe(false);
  setSlidesState({ audienceOpen: true, deckLocked: false }); await turn();
  expect(automaticallyChecks).toBe(false);
  setSlidesState({ audienceOpen: false }); await turn();
  expect(automaticallyChecks).toBe(true);
});

test("manual checks ignore stale enabled menu actions during a presentation", async () => {
  for (const protection of [{ deckLocked: true, audienceOpen: false }, { deckLocked: false, audienceOpen: true }]) {
    setSlidesState(protection);
    await checkSlidesForUpdates();
  }
  expect(calls).toEqual([]);
  setSlidesState({ audienceOpen: false });
  await checkSlidesForUpdates();
  expect(calls).toContain("check");
  let opened = false;
  await expect(withSlidesUpdatesPaused(async () => { opened = true; })).rejects.toThrow("Finish checking");
  expect(opened).toBe(false);
});

test("audience startup pauses the scheduler before native open and blocks a racing manual check", async () => {
  dispose = installSlidesUpdates(); await turn();
  const opening = withSlidesUpdatesPaused(async () => {
    expect(automaticallyChecks).toBe(false);
    setSlidesState({ audienceOpen: true });
  });
  await checkSlidesForUpdates();
  await opening; await turn();
  expect(calls).not.toContain("check");
  expect(automaticallyChecks).toBe(false);
  setSlidesState({ audienceOpen: false }); await turn();
  expect(automaticallyChecks).toBe(true);
});

test("native audience windows cannot open while a Sparkle session is active", async () => {
  const display = { id: "stage", persistentId: "stage", name: "Stage", primary: false, size: { width: 1920, height: 1080 }, workArea: { x: 0, y: 0, width: 1920, height: 1080 }, scaleFactor: 1 };
  canCheck = false;
  await expect(openSlidesAudienceWindow(display, true)).rejects.toThrow("Finish checking");
  expect(calls).not.toContain("audience");
  canCheck = true;
  await openSlidesAudienceWindow(display, true); await turn();
  expect(calls).toContain("audience");
  expect(getSlidesState().audienceOpen).toBe(true);
  expect(automaticallyChecks).toBe(false);
});

test("a failed audience open releases the scheduler pause", async () => {
  await expect(withSlidesUpdatesPaused(async () => { throw new Error("window failed"); })).rejects.toThrow("window failed");
  await turn();
  expect(automaticallyChecks).toBe(true);
});

test("an updater configuration failure prevents native open and a later attempt can recover", async () => {
  const originalError = console.error;
  console.error = () => {};
  try {
    failConfiguration = true;
    await expect(withSlidesUpdatesPaused(async () => { throw new Error("must not open"); })).rejects.toThrow("configuration failed");
    await turn();
    let opened = false;
    await withSlidesUpdatesPaused(async () => { opened = true; });
    expect(opened).toBe(true);
  } finally { console.error = originalError; }
});

test("the app menu offers update checks after About and disables them while presenting", async () => {
  const render = () => useSlidesMenus(() => {}, false, false, () => {}, () => {});
  const updateItem = () => {
    const app = menu.items.find(item => item.type === "submenu" && item.id === "app");
    if (app?.type !== "submenu") throw new Error("App menu missing");
    const item = app.items.find(item => item.type === "action" && item.id === "checkForUpdates");
    if (item?.type !== "action") throw new Error("Update action missing");
    return item;
  };
  render();
  expect(updateItem()).toMatchObject({ label: "Check for Updates…", placement: { after: { role: "about" } }, disabled: false });
  await menu.onAction?.({ type: "action", itemId: "checkForUpdates" }); await turn();
  expect(calls).toContain("check");
  setSlidesState({ deckLocked: true }); render();
  expect(updateItem()?.disabled).toBe(true);
  setSlidesState({ deckLocked: false, audienceOpen: true }); render();
  expect(updateItem()?.disabled).toBe(true);
});
