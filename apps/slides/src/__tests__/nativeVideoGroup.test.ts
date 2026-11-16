import { expect, test } from "bun:test";
import { createVideoGroupState, updateVideoGroup, type SynchronizedVideo, type VideoGroupInput } from "../../../../packages/presentation/src/videoGroup";
function fixture(restartHoldMs = 0) {
  const players = [1320, 2770, 11380].map(duration => ({
    duration: () => duration, prepared: false, ended: false, prepares: [] as number[], starts: [] as number[][],
    prepareSync(time: number) { this.prepared = false; this.ended = false; this.prepares.push(time); },
    syncStatus(): number { return this.prepared ? (this.ended ? 2 : 1) : 0; },
    playSync(time: number, host: number) { this.starts.push([time, host]); },
  }));
  let state = createVideoGroupState();
  const input: VideoGroupInput = { restartHoldMs, active: true, playing: true, resetKey: "slide:step1", seek: null as null | { id: number; position: number } };
  const tick = (now: number) => { state = updateVideoGroup(state, players as unknown as SynchronizedVideo[], input, now); return state; };
  const ready = () => players.forEach(player => player.prepared = true);
  return { players, input, tick, ready };
}
test("all visible clips wait for decoded seek acknowledgement and share one future native start", () => {
  const f = fixture();
  expect(f.tick(100).phase).toBe("preparing");
  f.players[0].prepared = f.players[1].prepared = true;
  expect(f.tick(200).phase).toBe("preparing");
  expect(f.players.every(p => p.starts.length === 0)).toBe(true);
  f.ready();
  expect(f.tick(300).phase).toBe("playing");
  expect(f.players.map(p => p.starts)).toEqual([[[0, 400]], [[0, 400]], [[0, 400]]]);
  expect(f.tick(350).position).toBe(0);
  expect(f.tick(1000).position).toBe(600);
});
test("short clips hold and only the longest ending triggers another group preparation barrier", () => {
  const f = fixture(); f.tick(0); f.ready(); f.tick(10);
  expect(f.tick(3000).cycle).toBe(0);
  expect(f.players.map(p => p.prepares.length)).toEqual([1, 1, 1]);
  expect(f.tick(11490).cycle).toBe(0); // Clock alone cannot acknowledge native end.
  f.players[2].ended = true;
  const state = f.tick(11500);
  expect(state.cycle).toBe(1); expect(state.phase).toBe("preparing"); expect(state.position).toBe(0);
  expect(f.players.map(p => p.prepares)).toEqual([[0, 0], [0, 0], [0, 0]]);
  expect(f.tick(12000).phase).toBe("preparing");
  f.ready(); f.tick(12010);
  expect(f.players.map(p => p.starts.at(-1))).toEqual([[0, 12110], [0, 12110], [0, 12110]]);
});
test("pause freezes the group; resume re-primes every player at a shared position", () => {
  const f = fixture(); f.tick(0); f.ready(); f.tick(10); f.tick(1110);
  f.input.playing = false;
  expect(f.tick(1210).position).toBe(1100);
  f.ready(); expect(f.tick(2000).phase).toBe("paused");
  expect(f.tick(5000).position).toBe(1100);
  f.input.playing = true; expect(f.tick(6000).phase).toBe("preparing");
  f.ready(); f.tick(6100);
  expect(f.players.map(p => p.starts.at(-1))).toEqual([[1100, 6200], [1100, 6200], [1100, 6200]]);
});
test("seek clamps shorter players to their final frame and acknowledges while paused", () => {
  const f = fixture(); f.input.playing = false; f.tick(0); f.ready(); f.tick(10);
  f.input.seek = { id: 1, position: 5000 };
  expect(f.tick(20).phase).toBe("preparing");
  expect(f.players.map(p => p.prepares.at(-1))).toEqual([1319, 2769, 5000]);
  f.ready(); expect(f.tick(30).phase).toBe("paused"); expect(f.tick(100).position).toBe(5000);
  f.input.playing = true; f.tick(110); f.ready(); f.tick(120);
  expect(f.players.map(p => p.starts.length)).toEqual([0, 0, 1]);
});
test("slide exit resets immediately and hidden clips never start; entry and reveal restart at zero", () => {
  const f = fixture(); f.tick(0); f.ready(); f.tick(10); f.tick(1000);
  f.input.active = false;
  expect(f.tick(1100).phase).toBe("inactive"); expect(f.tick(9000).position).toBe(0);
  expect(f.players.map(p => p.starts.length)).toEqual([1, 1, 1]);
  f.input.active = true; expect(f.tick(10000).phase).toBe("preparing");
  f.ready(); f.tick(10010); f.tick(11000);
  f.input.resetKey = "slide:step2";
  expect(f.tick(11100).position).toBe(0);
  expect(f.players.map(p => p.prepares.at(-1))).toEqual([0, 0, 0]);
});
test("a newer seek invalidates an unfinished barrier and failed decoders cannot start", () => {
  const f = fixture(); f.tick(0);
  f.input.seek = { id: 2, position: 2000 }; f.tick(10);
  f.input.seek = { id: 3, position: 1000 }; f.tick(20);
  expect(f.players.map(p => p.prepares.at(-1))).toEqual([1000, 1000, 1000]);
  f.players[0].syncStatus = () => -1;
  expect(f.tick(30).phase).toBe("error");
  expect(f.players.every(p => p.starts.length === 0)).toBe(true);
});
test("an unready decoder has a bounded barrier and never starts the group", () => {
  const f = fixture(); f.tick(0);
  expect(f.tick(15001).phase).toBe("error");
  expect(f.players.every(p => p.starts.length === 0)).toBe(true);
});
test("seeking to group end holds the final frames paused and resumes with a fresh cycle", () => {
  const f = fixture(); f.input.playing = false; f.tick(0); f.ready(); f.tick(10);
  f.input.seek = { id: 1, position: 999999 };
  expect(f.tick(20).position).toBe(11380);
  expect(f.players.map(p => p.prepares.at(-1))).toEqual([1319, 2769, 11379]);
  f.ready(); expect(f.tick(30).phase).toBe("paused");
  f.input.playing = true;
  expect(f.tick(40).position).toBe(0);
  expect(f.players.map(p => p.prepares.at(-1))).toEqual([0, 0, 0]);
});
test("a playing seek to the end acknowledges final frames before preparing the next cycle", () => {
  const f = fixture(); f.tick(0); f.ready(); f.tick(10);
  f.input.seek = { id: 1, position: 11380 };
  f.tick(20); f.ready();
  expect(f.tick(30).phase).toBe("preparing");
  expect(f.tick(40).position).toBe(0);
  expect(f.players.map(p => p.prepares.at(-1))).toEqual([0, 0, 0]);
});
test("clearing a seek request does not issue another seek or move a paused group", () => {
  const f = fixture(); f.input.playing = false; f.tick(0); f.ready(); f.tick(10);
  f.input.seek = { id: 10, position: 800 }; f.tick(20); f.ready(); f.tick(30);
  f.input.seek = null;
  expect(f.tick(40).position).toBe(800);
  expect(f.players.map(p => p.prepares.length)).toEqual([2, 2, 2]);
});

test("restart holds decoded first frames for 500ms from the whole cohort becoming ready", () => {
  const f = fixture(500); f.tick(0);
  f.players[0].prepared = true; f.tick(100);
  expect(f.players.every(p => p.starts.length === 0)).toBe(true);
  f.ready(); f.tick(300);
  expect(f.players.map(p => p.starts.at(-1))).toEqual([[0, 800], [0, 800], [0, 800]]);
  expect(f.tick(799).position).toBe(0);
  expect(f.tick(801).position).toBe(1);
});
test("every loop and reveal gets a fresh first-frame hold", () => {
  const f = fixture(500); f.tick(0); f.ready(); f.tick(10);
  f.players[2].ended = true; f.tick(11900); f.ready(); f.tick(11910);
  expect(f.players.map(p => p.starts.at(-1))).toEqual([[0, 12410], [0, 12410], [0, 12410]]);
  f.input.resetKey = "next-reveal"; f.tick(13000); f.ready(); f.tick(13010);
  expect(f.players.map(p => p.starts.at(-1))).toEqual([[0, 13510], [0, 13510], [0, 13510]]);
});
test("resuming mid-clip uses the normal native dispatch lead rather than a restart hold", () => {
  const f = fixture(500); f.tick(0); f.ready(); f.tick(10); f.tick(1510);
  f.input.playing = false; f.tick(1610); f.ready(); f.tick(1700);
  f.input.playing = true; f.tick(2000); f.ready(); f.tick(2100);
  expect(f.players.map(p => p.starts.at(-1))).toEqual([[1100, 2200], [1100, 2200], [1100, 2200]]);
});
