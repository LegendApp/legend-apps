// @ts-nocheck Bun's test globals are intentionally scoped to this standalone test suite.
import { describe, expect, test } from "bun:test";
import { audienceFullscreenForDisplayCount, createAudienceSession } from "../audienceSession";

const projector = { id: "projector", size: { width: 1920, height: 1080 }, workArea: { x: 1920, y: 0, width: 1920, height: 1080 } };
function setup(open = async () => {}) {
  const calls = [];
  let state = { blackout: false };
  const session = createAudienceSession({
    open: async (display) => { calls.push(["open", display]); await open(); },
    close: async () => { calls.push(["close"]); },
    focusPresenter: async () => {},
    update: (update) => { state = { ...state, ...update }; },
  });
  return { session, calls, state: () => state };
}

describe("audience display recovery", () => {
  test("uses a normal visible window on one display and fullscreen on multiple displays", async () => {
    const calls = [];
    const session = createAudienceSession({
      open: async (_display, fullscreen) => { calls.push(["open", fullscreen]); },
      close: async () => {},
      focusPresenter: async () => { calls.push(["focus-presenter"]); },
      update: () => {},
    });

    await session.open(projector, false, audienceFullscreenForDisplayCount(1));
    expect(calls).toEqual([["open", false]]);
    await session.close();
    calls.length = 0;
    await session.open(projector, false, audienceFullscreenForDisplayCount(2));
    expect(calls).toEqual([["open", true], ["focus-presenter"]]);
  });

  test("closes on disconnect and does not silently resume on reconnect", async () => {
    const { session, calls, state } = setup();
    await session.open(projector);
    await session.displaysChanged([]);
    expect(state().audienceOpen).toBe(false);
    expect(state().deckLocked).toBe(false);
    expect(state().blackout).toBe(false);
    expect(state().displayMessage).toContain("disconnected");
    await session.displaysChanged([projector]);
    expect(calls).toEqual([["open", projector], ["close"]]);
    await session.open(projector);
    expect(state().audienceOpen).toBe(true);
    expect(state().blackout).toBe(false);
  });
  test("repositions only when the active display's frame changes", async () => {
    const { session, calls } = setup();
    await session.open(projector);
    await session.displaysChanged([{ ...projector }]);
    expect(calls.length).toBe(1);
    const resized = { ...projector, size: { width: 1280, height: 720 }, workArea: { x: -1280, y: 200, width: 1280, height: 720 } };
    await session.displaysChanged([resized]);
    expect(calls).toEqual([["open", projector], ["open", resized]]);
  });
  test("uses the selected fullscreen display without locking rehearsal updates", async () => {
    const { session, calls, state } = setup();
    await session.open(projector, true);
    expect(calls).toEqual([["open", projector]]);
    expect(state().audienceOpen).toBe(true);
    expect(state().deckLocked).toBe(false);
    await session.displaysChanged([]);
    expect(calls.at(-1)).toEqual(["close"]);
  });
  test("processes an unplug received during an unfinished window open", async () => {
    let release;
    const { session, calls, state } = setup(() => new Promise((resolve) => { release = resolve; }));
    const opening = session.open(projector);
    await Promise.resolve();
    const unplugged = session.displaysChanged([]);
    release();
    await Promise.all([opening, unplugged]);
    expect(calls.at(-1)).toEqual(["close"]);
    expect(state().audienceOpen).toBe(false);
    expect(state().deckLocked).toBe(false);
  });
  test("contains native failures and keeps subsequent commands usable", async () => {
    let failOpen = true;
    const { session, state } = setup(async () => { if (failOpen) throw new Error("native failure"); });
    expect(await session.open(projector)).toBe(false);
    expect(state().blackout).toBe(false);
    expect(state().deckLocked).toBe(false);
    expect(state().displayMessage).toContain("native failure");
    failOpen = false;
    expect(await session.open(projector)).toBe(true);
    expect(state()).toMatchObject({ audienceOpen: true, blackout: false, displayMessage: "" });
    await session.close();
    expect(state().audienceOpen).toBe(false);
    expect(state().deckLocked).toBe(false);
  });
});

 test("unlocks updates when the audience window is closed manually", async () => {
  const { session, state } = setup();
  await session.open(projector);
  expect(state().deckLocked).toBe(true);
  session.closed();
  expect(state().audienceOpen).toBe(false);
  expect(state().deckLocked).toBe(false);
});

 test("waits for native fullscreen completion before focusing presenter", async () => {
  let finishFullscreen;
  const calls = [];
  const session = createAudienceSession({
    open: () => new Promise(resolve => { finishFullscreen = resolve; }),
    close: async () => {},
    focusPresenter: async () => { calls.push("presenter"); },
    update: update => { if (update.audienceOpen) calls.push("audience-ready"); },
  });
  const opening = session.open(projector);
  await Promise.resolve();
  expect(calls).toEqual([]);
  finishFullscreen();
  await opening;
  expect(calls).toEqual(["audience-ready", "presenter"]);
});

 test("queued stop then start restores the presentation lock", async () => {
  const { session, state } = setup();
  await session.open(projector);
  const stopping = session.close();
  const starting = session.open(projector);
  expect(await stopping).toBe(true);
  expect(await starting).toBe(true);
  expect(state()).toMatchObject({ audienceOpen: true, deckLocked: true, blackout: false });
});

 test("failed close reports failure and keeps the active presentation locked", async () => {
  let state = {};
  let failClose = true;
  const session = createAudienceSession({
    open: async () => {}, close: async () => { if (failClose) throw new Error("Close failed"); },
    focusPresenter: async () => {}, update: patch => { state = { ...state, ...patch }; },
  });
  expect(await session.open(projector)).toBe(true);
  expect(await session.close()).toBe(false);
  expect(state).toMatchObject({ audienceOpen: true, deckLocked: true, blackout: false });
  failClose = false;
  expect(await session.close()).toBe(true);
  expect(state).toMatchObject({ audienceOpen: false, deckLocked: false });
});

test("failed display reposition preserves output and allows retry without blackout", async () => {
  let failOpen = false;
  const { session, state } = setup(async () => { if (failOpen) throw new Error("Reposition failed"); });
  await session.open(projector);
  const resized = { ...projector, size: { width: 1280, height: 720 } };
  failOpen = true;
  expect(await session.displaysChanged([resized])).toBe(false);
  expect(state()).toMatchObject({ audienceOpen: true, deckLocked: true, blackout: false });
  failOpen = false;
  expect(await session.displaysChanged([resized])).toBe(true);
  expect(state().blackout).toBe(false);
});

test("window failures preserve a manually selected blackout", async () => {
  let state = { blackout: false };
  const session = createAudienceSession({
    open: async () => {}, close: async () => { throw new Error("Close failed"); },
    focusPresenter: async () => {}, update: patch => { state = { ...state, ...patch }; },
  });
  await session.open(projector);
  state.blackout = true;
  expect(await session.close()).toBe(false);
  expect(state.blackout).toBe(true);
});

test("presenter focus failures do not enable blackout after a successful open", async () => {
  let state = { blackout: false };
  const session = createAudienceSession({
    open: async () => {}, close: async () => {},
    focusPresenter: async () => { throw new Error("Focus failed"); }, update: patch => { state = { ...state, ...patch }; },
  });
  expect(await session.open(projector)).toBe(false);
  expect(state).toMatchObject({ audienceOpen: true, deckLocked: true, blackout: false });
});
