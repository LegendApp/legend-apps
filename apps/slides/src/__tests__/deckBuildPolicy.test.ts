// @ts-nocheck Bun's test globals are intentionally scoped to this standalone test suite.
import { describe, expect, test } from "bun:test";
import { failedDeckUpdate, shouldDeferDeckUpdate, successfulDeckUpdate } from "../deckBuildPolicy";

const LastGoodDeck = () => null;
const RebuiltDeck = () => null;

function readyState() {
  return {
    deckLocked: false,
    pendingDeck: null,
    audienceOpen: false,
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
    templates: {},
  };
}

describe("deck build policy", () => {
  test("defers updates only while presenting or opening the audience window", () => {
    expect(shouldDeferDeckUpdate({ ...readyState(), deckLocked: true })).toBe(true);
    expect(shouldDeferDeckUpdate(readyState())).toBe(false);
    expect(shouldDeferDeckUpdate({ ...readyState(), audienceOpen: true, deckLocked: true })).toBe(true);
    expect(shouldDeferDeckUpdate({ ...readyState(), audienceOpen: true, deckLocked: false })).toBe(false);
    expect(shouldDeferDeckUpdate({ ...readyState(), component: null, deckLocked: true })).toBe(false);
  });

  test("applying a pending build preserves the lock and slide position", () => {
    const current = { ...readyState(), deckLocked: true, pendingDeck: { path: "/deck/deck.mdx" } };
    const applied = { ...current, ...successfulDeckUpdate(current, RebuiltDeck, {}, "/deck/deck.mdx", []) };
    expect(applied.deckLocked).toBe(true);
    expect(applied.pendingDeck).toBeNull();
    expect(applied.currentSlide).toBe(4);
  });
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
      ...successfulDeckUpdate(failedState, RebuiltDeck, {}, "/deck/deck.mdx", ["warning"]),
    };

    expect(recoveredState.component).toBe(RebuiltDeck);
    expect(recoveredState.currentSlide).toBe(4);
    expect(recoveredState.revision).toBe(8);
    expect(recoveredState.status).toBe("ready");
    expect(recoveredState.buildErrors).toEqual([]);
  });
});
