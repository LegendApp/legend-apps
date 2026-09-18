// @ts-nocheck This suite uses Bun test globals, like the other Slides suites.
import { expect, test } from "bun:test";
import { appCardLayout, appOrder, filmstripPosition, filmstripLeadInMs, filmstripHoldMs, filmstripMoveMs } from "../../decks/react-native-desktop/NineAppsGeometry";

test("RN anchors the hero, grid, and initial filmstrip", () => {
  for (const mode of ["hero", "grid", "filmstrip"] as const) expect(appCardLayout(0, mode).x).toBe(960);
  const grid = appOrder.map((_, i) => appCardLayout(i, "grid"));
  expect(new Set(grid.map(r => `${r.x},${r.y}`)).size).toBe(9);
  for (const card of grid) {
    expect(card.x - card.width / 2).toBeGreaterThan(0);
    expect(card.y + card.width * 0.625 / 2).toBeLessThan(960);
  }
});

test("filmstrip holds, advances, shrinks neighbors, and wraps indefinitely offscreen", () => {
  expect(filmstripPosition(filmstripLeadInMs + filmstripHoldMs)).toBe(0);
  const period = filmstripHoldMs + filmstripMoveMs;
  expect(filmstripPosition(filmstripLeadInMs + period)).toBe(1);
  expect(appCardLayout(1, "filmstrip", 1).width).toBeGreaterThan(appCardLayout(0, "filmstrip", 1).width);
  for (let i = 0; i < 9; i++) {
    expect(appCardLayout(i, "filmstrip", 9 * 10000)).toEqual(appCardLayout(i, "filmstrip", 0));
  }
  // Wrapping jumps happen beyond the stage, never through the visible center.
  const before = appCardLayout(0, "filmstrip", 4.5 - 0.001);
  const after = appCardLayout(0, "filmstrip", 4.5 + 0.001);
  expect(before.x + before.width / 2).toBeLessThan(0);
  expect(after.x - after.width / 2).toBeGreaterThan(1920);
});
