// @ts-nocheck Execute the injected browser controller against deterministic DOM objects.
import { expect, test } from "bun:test";
import { runInNewContext } from "node:vm";
import { webviewPlaybackScript } from "../webviewPlayback";
function browser() {
  const animations = [], media = [], observers = [], messages = [];
  const events = {};
  const document = {getAnimations: () => animations, querySelectorAll: () => media,
    addEventListener: (name, fn) => { events[name] = fn; }};
  const window = {frames: [{postMessage: value => messages.push(value)}], parent: {},
    addEventListener: (name, fn) => { events[name] = fn; }};
  class MutationObserver {
    constructor(fn) { this.notify = fn; observers.push(this); }
    observe() { this.active = true; }
    disconnect() { this.active = false; }
  }
  return {animations, media, observers, messages, events, window,
    update: (phase, time = 2) => runInNewContext(webviewPlaybackScript(phase, time), {window, document, MutationObserver})};
}
function animation(playState = "running") {
  return {playState, currentTime: 500, plays: 0, pauses: 0,
    play() { this.playState = "running"; this.plays++; },
    pause() { this.playState = "paused"; this.pauses++; }};
}
function video(paused = false, autoplay = false) {
  return {paused, autoplay, currentTime: 0.5, duration: 8, readyState: 1, plays: 0, pauses: 0,
    play() { this.paused = false; this.plays++; return Promise.resolve(); },
    pause() { this.paused = true; this.pauses++; }};
}
test("previews freeze at a fixed sample and promotion starts owned animation and media at zero", () => {
  const b = browser(); const moving = animation(), authoredPause = animation("paused"), clip = video(true, true);
  b.animations.push(moving, authoredPause); b.media.push(clip);
  b.update("preview");
  expect(moving.currentTime).toBe(2000); expect(moving.playState).toBe("paused");
  expect(clip.currentTime).toBe(2); expect(clip.plays).toBe(0);
  b.update("playing");
  expect(moving.currentTime).toBe(0); expect(moving.plays).toBe(1);
  expect(authoredPause.plays).toBe(0);
  expect(clip.currentTime).toBe(0); expect(clip.plays).toBe(1);
  expect(b.observers).toHaveLength(1); expect(b.observers[0].active).toBe(false);
  expect(b.messages.at(-1).phase).toBe("playing");
});
test("outgoing slides freeze the live pose and paused slides resume without rewinding", () => {
  const b = browser(); const moving = animation(), clip = video();
  b.animations.push(moving); b.media.push(clip);
  b.update("playing"); moving.currentTime = 9000; clip.currentTime = 5;
  b.update("outgoing");
  expect(moving.currentTime).toBe(9000); expect(clip.currentTime).toBe(5);
  expect(clip.paused).toBe(true);
  b.update("paused"); b.update("playing");
  expect(moving.currentTime).toBe(9000); expect(clip.currentTime).toBe(5);
  expect(moving.plays).toBe(1); expect(clip.plays).toBe(1);
});
test("late DOM content, autoplay, reloads and child frames inherit the current phase", () => {
  const b = browser(); b.update("preparing");
  const moving = animation(), clip = video(); b.animations.push(moving); b.media.push(clip);
  b.observers[0].notify();
  expect(moving.currentTime).toBe(0); expect(clip.paused).toBe(true);
  clip.paused = false; b.events.play(); expect(clip.paused).toBe(true);
  b.update("preview", 20); expect(clip.currentTime).toBe(8);
  b.events.load(); expect(b.messages.at(-1)).toMatchObject({phase: "preview", previewTime: 20});
  b.events.message({source: b.window.parent, data: {type: "legend-slides-playback", phase: "paused", previewTime: 1}});
  expect(b.messages.at(-1).phase).toBe("paused");
  const fresh = browser(); fresh.update("paused");
  expect(fresh.observers).toHaveLength(1);
});

test("removed paused content is released rather than restarted on resume", () => {
  const b = browser(); const moving = animation(), clip = video();
  b.animations.push(moving); b.media.push(clip);
  b.update("paused");
  moving.playState = "idle"; clip.isConnected = false;
  b.animations.length = 0; b.media.length = 0;
  b.observers[0].notify();
  b.update("playing");
  expect(moving.plays).toBe(0); expect(clip.plays).toBe(0);
});
