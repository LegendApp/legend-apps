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
      activeMode: null,
      audienceOpen: false,
      displays,
      elapsed: 65_000,
      hasDeck: true,
      rehearsalEnabled: false,
      selectedDisplayId: "stage",
      timerRunning: false,
    });

    expect(items.map((item) => item.id)).toEqual([
      presenterModeToolbarItemId,
      presenterDisplayToolbarItemId,
      presenterStartToolbarItemId,
      presenterElapsedToolbarItemId,
    ]);
    expect(items.every((item) => item.placement === "trailing")).toBe(true);
    expect(items[1]).toMatchObject({ enabled: true, label: "Stage Display", type: "menuButton" });
    expect(items[2]).toMatchObject({ enabled: true, label: "Start Presentation", type: "button" });
    expect(items[3]).toMatchObject({ text: "1:05", type: "label" });
  });

  it("replaces mode choices with timer controls during rehearsal", () => {
    const items = createPresenterToolbarItems({
      activeMode: "rehearsal",
      audienceOpen: true,
      displays,
      elapsed: 2_000,
      hasDeck: true,
      rehearsalEnabled: true,
      selectedDisplayId: "stage",
      timerRunning: true,
    });
    const modeItem = items[0];

    expect(modeItem).toMatchObject({ enabled: true, label: "Rehearsal", type: "menuButton" });
    expect("menuItems" in modeItem && modeItem.menuItems?.[0]).toMatchObject({ value: presenterTimerPauseValue });
    expect(items[1]).toMatchObject({ enabled: false });
    expect(items[2]).toMatchObject({ label: "Stop", value: presenterStopValue });
  });

  it("keeps start disabled until a deck and output target are available", () => {
    const items = createPresenterToolbarItems({
      activeMode: null,
      audienceOpen: false,
      displays: [],
      elapsed: 0,
      hasDeck: false,
      rehearsalEnabled: false,
      selectedDisplayId: null,
      timerRunning: false,
    });

    expect(items[1]).toMatchObject({ enabled: false });
    expect(items[2]).toMatchObject({ enabled: false });
  });
});
