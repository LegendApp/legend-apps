// @ts-nocheck This suite uses Bun's test globals.
import { describe, expect, it } from "bun:test";
import {
  createPresenterToolbarItems,
  formatPresenterElapsed,
  presenterDisplayToolbarItemId,
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
      presenterModeToolbarItemId,
      presenterDisplayToolbarItemId,
      presenterStartToolbarItemId,
    ]);
    expect(items.every((item) => item.placement === "trailing")).toBe(true);
    expect(items[0]).toMatchObject({ enabled: false, label: "1:05", monospacedDigits: true, type: "menuButton", width: 76 });
    expect(items[2]).toMatchObject({ enabled: true, label: "Stage Display", type: "menuButton" });
    expect(items[3]).toMatchObject({ enabled: true, label: "Start Presentation", type: "button" });
  });

  it("puts active timer controls in the elapsed-time menu", () => {
    const items = createPresenterToolbarItems({
      audienceOpen: true,
      displays,
      elapsed: 2_000,
      hasDeck: true,
      rehearsalEnabled: true,
      selectedDisplayId: "stage",
      timerRunning: true,
    });
    const timerItem = items[0];

    expect(timerItem).toMatchObject({ enabled: true, label: "0:02", type: "menuButton" });
    expect("menuItems" in timerItem && timerItem.menuItems).toMatchObject([
      { value: presenterTimerPauseValue },
      { value: presenterTimerRestartValue },
    ]);
    expect(items[1]).toMatchObject({ enabled: false });
    expect(items[2]).toMatchObject({ enabled: false });
    expect(items[3]).toMatchObject({ label: "Stop", value: presenterStopValue });
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

    expect(items[0]).toMatchObject({ enabled: false });
    expect(items[2]).toMatchObject({ enabled: false });
    expect(items[3]).toMatchObject({ enabled: false });
  });
});
