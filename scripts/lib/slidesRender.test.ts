import { expect, test } from "bun:test";
import { createContext, runInContext } from "node:vm";
import { installRenderClock } from "./slidesRenderClock";
import { parseRenderArgs, selectRenderItems } from "./slidesRender";

test("selects one-based ranges in deck order without duplicates", () => {
  expect(selectRenderItems("4,2-4", 5)).toEqual([1, 2, 3]);
  expect(selectRenderItems("all", 3)).toEqual([0, 1, 2]);
  for (const value of ["0", "6", "3-2", "1-99", "2.5", "", "1,"]) expect(() => selectRenderItems(value, 5)).toThrow();
});

test("parses still and video commands, rounding duration to whole frames", () => {
  const still = parseRenderArgs(["deck.mdx", "--slide", "14", "--steps", "all", "--out", "images"]);
  expect(still.slides).toBe("14"); expect(still.framesPerStep).toBe(180);
  const video = parseRenderArgs(["deck.mdx", "--slides", "10-14", "--video", "out.mp4", "--fps", "24", "--step-seconds", "0.11"]);
  expect(video.framesPerStep).toBe(3); expect(video.fps).toBe(24);
  for (const args of [["--fps", "0"], ["--fps", "1.5"], ["--width", "NaN"], ["--steps"], ["--slide", "1", "--slides", "2"], ["--video", "a.mp4", "--out", "images"], ["--wat", "1"]]) {
    expect(() => parseRenderArgs(["deck.mdx", ...args])).toThrow();
  }
});

test("offscreen time advances only on explicit ticks, including timers and animation frames", async () => {
  const context = createContext({ setTimeout, performance: {}, addEventListener() {}, document: { querySelectorAll: () => [], getAnimations: () => [] } });
  runInContext(`(${installRenderClock.toString()})();`, context);
  runInContext(`globalThis.samples=[];
    setTimeout(()=>samples.push(['timer',performance.now()]),50);
    setInterval(()=>samples.push(['interval',Date.now()]),20);
    requestAnimationFrame(t=>samples.push(['frame',t]));`, context);
  await context.__slidesRenderClock.tick(0);
  expect(JSON.parse(JSON.stringify(context.samples))).toEqual([["frame", 0]]);
  await new Promise(resolve => setTimeout(resolve, 25));
  expect(runInContext("performance.now()", context)).toBe(0);
  await context.__slidesRenderClock.tick(1000 / 60);
  expect(context.samples.length).toBe(1);
  await context.__slidesRenderClock.tick(50);
  expect(JSON.parse(JSON.stringify(context.samples)).slice(1)).toEqual([["timer", 50], ["interval", 1700000000050]]);
  expect(runInContext("typeof Date()", context)).toBe("string");
  expect(runInContext("performance.timeOrigin + performance.now()", context)).toBe(1700000000050);
  expect(runInContext("new Date().getTime()", context)).toBe(1700000000050);
  expect(runInContext("new Date(2024,0,2).getFullYear()", context)).toBe(2024);
  await expect(context.__slidesRenderClock.tick(49)).rejects.toThrow("backwards");
});

test("video frames seek by synthetic time while prepared inactive videos stay paused", async () => {
  const events = new EventTarget();
  let position = 0;
  const video = { dataset: { slidesPlaying: "false" }, duration: 2, loop: true, pause() {},
    addEventListener: events.addEventListener.bind(events), removeEventListener: events.removeEventListener.bind(events),
    get currentTime() { return position; },
    set currentTime(value: number) { position = value; queueMicrotask(() => events.dispatchEvent(new Event("seeked"))); },
  };
  const context = createContext({ setTimeout, performance: {}, addEventListener() {}, document: { querySelectorAll: (selector: string) => selector === "video" ? [video] : [], getAnimations: () => [] } });
  runInContext(`(${installRenderClock.toString()})();`, context);
  await context.__slidesRenderClock.tick(1000);
  expect(position).toBe(0);
  video.dataset.slidesPlaying = "true";
  await context.__slidesRenderClock.tick(1100);
  await context.__slidesRenderClock.tick(1600);
  expect(position).toBe(0.5);
  await context.__slidesRenderClock.tick(3200);
  expect(position).toBeCloseTo(0.1);
});
