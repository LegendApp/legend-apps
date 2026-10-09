// @ts-nocheck Bun test globals follow the repository test setup.
import { expect, test } from "bun:test";
import { deckWatchDirectories } from "../deckWatchDirectories";

test("watch only the selected pack roots and drop them when the deck stops importing them", () => {
  expect(deckWatchDirectories("/talk/deck.mdx", "/transitions", [
    "/talk/scene.tsx", "/effects/type/Title.tsx", "/effects/type/pack.json", "/effects/type/pack.json",
    "/effects/glass/pack.json",
  ])).toEqual(["/effects/glass", "/effects/type", "/talk", "/transitions"]);
  expect(deckWatchDirectories("/talk/deck.mdx", "/transitions", [])).toEqual(["/talk", "/transitions"]);
});
