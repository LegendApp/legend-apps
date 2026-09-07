// @ts-nocheck This suite uses Bun's test globals.
import { describe, expect, it } from "bun:test";
import { initialPresenterTimerState, transitionPresenterTimer } from "../presenterTimer";

describe("presenter timer", () => {
  it("waits for the first slide transition in presentation mode", () => {
    const opened = transitionPresenterTimer(initialPresenterTimerState, {
      mode: "presentation",
      type: "audience-started",
    });
    expect(opened).toMatchObject({
      restart: true,
      state: { pauseReason: "presentation-start", running: false },
    });

    const started = transitionPresenterTimer(opened.state, { from: 0, to: 1, type: "slide-navigated" });
    expect(started).toMatchObject({ restart: true, state: { pauseReason: null, running: true } });
  });

  it("restarts every time presentation returns from slide 1 to slide 2", () => {
    const running = {
      mode: "presentation",
      pauseReason: null,
      running: true,
    };
    const returned = transitionPresenterTimer(running, { from: 1, to: 0, type: "slide-navigated" });
    expect(returned).toEqual({ restart: false, state: running });

    const restarted = transitionPresenterTimer(returned.state, { from: 0, to: 1, type: "slide-navigated" });
    expect(restarted).toMatchObject({ restart: true, state: { running: true } });
  });

  it("starts immediately and does not restart on slide 2 when presentation automation is disabled", () => {
    const behavior = {
      presentationStartsOnSecondSlide: false,
      rehearsalPausesWhileEditing: true,
    };
    const opened = transitionPresenterTimer(initialPresenterTimerState, {
      mode: "presentation",
      type: "audience-started",
    }, behavior);
    expect(opened).toMatchObject({
      restart: true,
      state: { pauseReason: null, running: true },
    });

    const advanced = transitionPresenterTimer(opened.state, { from: 0, to: 1, type: "slide-navigated" }, behavior);
    expect(advanced).toEqual({ restart: false, state: opened.state });
  });

  it("starts rehearsal immediately and resumes an editing pause on navigation", () => {
    const opened = transitionPresenterTimer(initialPresenterTimerState, {
      mode: "rehearsal",
      type: "audience-started",
    });
    expect(opened).toMatchObject({ restart: true, state: { running: true } });

    const editing = transitionPresenterTimer(opened.state, { type: "editing-started" });
    expect(editing).toMatchObject({ restart: false, state: { pauseReason: "editing", running: false } });

    const resumed = transitionPresenterTimer(editing.state, { from: 2, to: 3, type: "slide-navigated" });
    expect(resumed).toMatchObject({ restart: false, state: { pauseReason: null, running: true } });
  });

  it("does not override a manual pause when navigating in rehearsal", () => {
    const paused = transitionPresenterTimer(
      { mode: "rehearsal", pauseReason: null, running: true },
      { type: "pause-requested" },
    );
    const navigated = transitionPresenterTimer(paused.state, { from: 2, to: 3, type: "slide-navigated" });

    expect(navigated).toEqual({ restart: false, state: paused.state });
  });

  it("keeps rehearsal running while editing when edit automation is disabled", () => {
    const running = {
      mode: "rehearsal",
      pauseReason: null,
      running: true,
    };
    const editing = transitionPresenterTimer(running, { type: "editing-started" }, {
      presentationStartsOnSecondSlide: true,
      rehearsalPausesWhileEditing: false,
    });

    expect(editing).toEqual({ restart: false, state: running });
  });

  it("restarts and runs on a manual restart", () => {
    const restarted = transitionPresenterTimer(
      { mode: "presentation", pauseReason: "manual", running: false },
      { type: "restart-requested" },
    );

    expect(restarted).toMatchObject({ restart: true, state: { pauseReason: null, running: true } });
  });
});
