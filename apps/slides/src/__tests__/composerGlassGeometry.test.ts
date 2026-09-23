// @ts-nocheck
import { expect, test } from "bun:test";
import { takeoverComposerRect } from "../../decks/react-native-desktop/NineAppsTour";

test("glass overlays the recorded composer's aspect ratio and centered camera crop", () => {
  const rect = takeoverComposerRect();
  expect(rect.x + rect.width / 2).toBeCloseTo(960);
  expect(rect.y + rect.height / 2).toBeCloseTo(540);
  expect(rect.width / rect.height).toBeCloseTo(1684 / 120);
  expect(rect.height).toBeLessThan(125);
  expect(rect.radius).toBeLessThan(rect.height / 2);
});
