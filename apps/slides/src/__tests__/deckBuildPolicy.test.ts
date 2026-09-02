// @ts-nocheck Bun's test globals are intentionally scoped to this standalone test suite.
import { describe, expect, test } from "bun:test";
import { failedDeckUpdate, successfulDeckUpdate } from "../deckBuildPolicy";

const LastGoodDeck = () => null;
const RebuiltDeck = () => null;

function readyState() {
  return {
    audienceOpen: true,
    blackout: false,
    buildErrors: [],
    buildWarnings: [],
    component: LastGoodDeck,
    config: { title: "Last good" },
    currentSlide: 4,
    deckPath: "/deck/deck.mdx",
    revision: 7,
    slides: [],
    status: "ready",
  };
}

describe("deck build policy", () => {
  test("keeps the last successful deck and slide visible after a failed rebuild", () => {
    const current = readyState();
    const update = failedDeckUpdate({ errors: ["deck.mdx:2:4: Unexpected token"], success: false, warnings: [] });
    const failedState = { ...current, ...update };

    expect(failedState.component).toBe(LastGoodDeck);
    expect(failedState.currentSlide).toBe(4);
    expect(failedState.revision).toBe(7);
    expect(failedState.status).toBe("error");
  });

  test("recovers from a failed rebuild without resetting the current slide", () => {
    const failedState = {
      ...readyState(),
      ...failedDeckUpdate({ errors: ["broken import"], success: false, warnings: [] }),
    };
    const recoveredState = {
      ...failedState,
      ...successfulDeckUpdate(failedState, RebuiltDeck, "/deck/deck.mdx", ["warning"]),
    };

    expect(recoveredState.component).toBe(RebuiltDeck);
    expect(recoveredState.currentSlide).toBe(4);
    expect(recoveredState.revision).toBe(8);
    expect(recoveredState.status).toBe("ready");
    expect(recoveredState.buildErrors).toEqual([]);
  });
});
