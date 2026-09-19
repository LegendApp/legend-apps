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
