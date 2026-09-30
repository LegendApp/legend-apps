// @ts-nocheck This suite uses Bun's test globals.
import { describe, expect, it } from "bun:test";
import {
  presenterAppearanceToolbarItemId,
  createPresenterToolbarItems,
  formatPresenterElapsed,
  presenterDisplayToolbarItemId,
  presenterEditToolbarItemId,
  presenterElapsedToolbarItemId,
  presenterModeToolbarItemId,
  presenterStartToolbarItemId,
  presenterStopValue,
  presenterTimerPauseValue,
  presenterTimerRestartValue,
} from "../presenterToolbar";

const displays = [
  { id: "main", name: "Built-in Display" },
  { id: "stage", name: "Stage Display" },
];

describe("presenter toolbar", () => {
  it("formats elapsed time with stable minute and hour fields", () => {
    expect(formatPresenterElapsed(0)).toBe("0:00");
    expect(formatPresenterElapsed(65_000)).toBe("1:05");
    expect(formatPresenterElapsed(3_665_000)).toBe("1:01:05");
  });

  it("builds the idle presentation controls at the trailing edge", () => {
    const items = createPresenterToolbarItems({
      audienceOpen: false,
      displays,
      elapsed: 65_000,
      hasDeck: true,
      rehearsalEnabled: false,
      selectedDisplayId: "stage",
      timerRunning: false,
    });

    expect(items.map((item) => item.id)).toEqual([
      presenterElapsedToolbarItemId,
      presenterEditToolbarItemId,
      presenterAppearanceToolbarItemId,
      presenterModeToolbarItemId,
      presenterDisplayToolbarItemId,
      presenterStartToolbarItemId,
    ]);
    expect(items.filter((item) => item.placement === "trailing").at(-1)?.id).toBe(presenterStartToolbarItemId);
    expect(items.every((item) => item.placement === "trailing")).toBe(true);
    expect(items[2]).toMatchObject({ placement: "trailing", type: "menu" });
    expect(items[2].items[0]).toMatchObject({ id: "background-intensity", type: "slider", min: 0, max: 100, value: 17, suffix: "%" });
    expect(items[0]).toMatchObject({ disabled: true, label: "1:05", type: "menu", width: 76 });
    expect(items[3]).toMatchObject({ width: 36, symbol: "play.rectangle" });
    expect(items[4]).toMatchObject({ type: "menu" });
    expect(items[5]).toMatchObject({ disabled: false, label: "Start Presentation", type: "button" });
    expect(items[1]).toMatchObject({ disabled: false, symbol: "square.and.pencil", tooltip: "Edit Source" });
  });

  it("puts active timer controls in the elapsed-time menu", () => {
    const items = createPresenterToolbarItems({
      audienceOpen: true,
      displays,
      elapsed: 2_000,
      backgroundIntensity: 6,
      hasDeck: true,
      rehearsalEnabled: true,
      selectedDisplayId: "stage",
      timerRunning: true,
    });
    expect(items[2].disabled).not.toBe(true);
    expect(items[2].items[0].value).toBe(100);
    const timerItem = items[0];

    expect(timerItem).toMatchObject({ disabled: false, label: "0:02", type: "menu" });
    expect("items" in timerItem && timerItem.items).toMatchObject([
      { id: presenterTimerPauseValue },
      { id: presenterTimerRestartValue },
    ]);
    expect(items[3]).toMatchObject({ disabled: true });
    expect(items[4]).toMatchObject({ type: "menu" });
    expect(items[5]).toMatchObject({ label: "Stop" });
    expect(items[1]).toMatchObject({ disabled: true });
  });

  it("keeps start disabled until a deck and output target are available", () => {
    const items = createPresenterToolbarItems({
      audienceOpen: false,
      displays: [],
      elapsed: 0,
      hasDeck: false,
      rehearsalEnabled: false,
      selectedDisplayId: null,
      timerRunning: false,
    });

    expect(items[0]).toMatchObject({ disabled: true });
    expect(items[4]).toMatchObject({ type: "menu" });
    expect(items[5]).toMatchObject({ disabled: true });
    expect(items[1]).toMatchObject({ disabled: true });
  });
});


it("offers window actions instead of display roles on a single screen", () => {
  const options = { displays: displays.slice(0, 1), elapsed: 0, hasDeck: true, rehearsalEnabled: false, selectedDisplayId: null, timerRunning: false };
  const menu = (audienceOpen: boolean) => createPresenterToolbarItems({ ...options, audienceOpen }).find(item => item.id === presenterDisplayToolbarItemId).items;
  expect(menu(false).map(item => item.label)).toEqual(["Open Audience Window", "Preview Notes Screen"]);
  expect(menu(false)[0].disabled).toBe(false);
  expect(menu(true)[0].id).toBe("close-audience");
  const multiple = createPresenterToolbarItems({ ...options, displays, audienceOpen: false }).find(item => item.id === presenterDisplayToolbarItemId).items;
  expect(multiple.some(item => item.label.includes("Built-in Display"))).toBe(true);
  expect(multiple.some(item => item.id === "identify-displays")).toBe(true);
});
