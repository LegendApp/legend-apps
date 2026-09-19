// @ts-nocheck This suite uses Bun test globals, like the other Slides suites.
import { expect, test } from "bun:test";
import { appCardLayout, appOrder } from "../../decks/react-native-desktop/NineAppsGeometry";

test("nine-app lineup combines Deno and includes Compose, with RN first", () => {
  expect(appOrder).toHaveLength(9);
  expect(appOrder[0]).toBe("react-native");
  expect(appOrder.filter(id => id.startsWith("deno"))).toEqual(["deno"]);
  expect(appOrder).toContain("compose");
  expect(appCardLayout(0, "grid")).toMatchObject({ x: 520, y: 285 });
  expect(new Set(appOrder.map((_, i) => JSON.stringify(appCardLayout(i, "grid")))).size).toBe(9);
});

test("filmstrip starts at the left margin and never wraps later cards to the left", () => {
  const first = appCardLayout(0, "filmstrip");
  expect(first.x - first.width / 2).toBe(112);
  for (let i = 1; i < appOrder.length; i++) {
    expect(appCardLayout(i, "filmstrip").x).toBeGreaterThan(first.x);
  }
  expect(appCardLayout(1, "filmstrip", 1).width).toBeGreaterThan(appCardLayout(0, "filmstrip", 1).width);
  expect(appCardLayout(8, "filmstrip", 1000)).toEqual(appCardLayout(8, "filmstrip", 8));
});

import { detailCamera, tourSteps, tourStep } from "../../decks/react-native-desktop/NineAppsTour";
import { readFileSync } from "node:fs";

test("manual tour covers every app in rendering order, with close-ups on each group's first app", () => {
  expect([...new Set(tourSteps.map(step => step.app))]).toEqual([...appOrder]);
  for (const app of ["react-native", "electron", "flutter"]) {
    expect(tourSteps.filter(step => step.app === app).map(step => step.detail)).toEqual(["app", "sidebar", "composer", "app"]);
  }
  expect(tourSteps.slice(-4)).toEqual([
    { app: "gpui", detail: "app" }, { app: "gpui", detail: "composer" },
    { app: "gpui", detail: "fake" }, { app: "gpui", detail: "takeover" },
  ]);
  expect(tourStep(-1)).toEqual(tourSteps[0]);
  expect(tourStep(999)).toEqual(tourSteps.at(-1));
  const deck = readFileSync(new URL("../../decks/react-native-desktop/rnconnection.mdx", import.meta.url), "utf8");
  expect(deck).toContain(`template: ./NineApps.tsx\nsteps: ${tourSteps.length}\n`);
  expect(deck.indexOf('<Chart workload="hello" metric="memory"')).toBeLessThan(deck.indexOf('<NineApps mode="hero"'));
  expect(deck.indexOf('<NineApps mode="filmstrip"')).toBeLessThan(deck.indexOf('<Chart metric="content"'));
});

test("detail cameras share the composer framing through the glass finale", () => {
  expect(detailCamera("app")).toEqual({ x: 0, y: 0, scaleX: 1, scaleY: 1 });
  expect(detailCamera("sidebar").scaleX).toBeGreaterThan(1);
  expect(detailCamera("composer").scaleX).toBeGreaterThan(1);
  expect(detailCamera("fake")).toEqual(detailCamera("composer"));
  expect(detailCamera("takeover")).toEqual(detailCamera("composer"));
});
