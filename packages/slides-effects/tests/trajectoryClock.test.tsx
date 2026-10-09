// @ts-nocheck Exercise the host keyframe sampler with a controlled shared clock.
import { expect, mock, test } from "bun:test";
import React, { Profiler } from "react";
import { act, create } from "react-test-renderer";
import { createPlaybackState, advancePlayback, transitionPlayback } from "../../presentation/src/playbackState";
import { samplePlayback } from "../../presentation/src/playback";
const input = { phase: "playing", slideKey: "a", stepKey: "0", stepIndex: 0 };
const playback = { value: createPlaybackState(input) };
mock.module("../../presentation/src/playback", () => ({ usePlayback: () => playback, samplePlayback }));
mock.module("react-native-reanimated", () => ({
  __esModule: true, default: { View: "animated-view" },
  useDerivedValue: read => ({ get value() { return read(); } }),
  useAnimatedStyle: read => ({ get value() { return read(); } }),
}));
const { PlaybackKeyframeView } = await import("../../presentation/src/PlaybackKeyframeView");
mock.module("@legend-apps/presentation", () => ({ PlaybackKeyframeView }));
const { TrajectoryEmitter } = await import("../packs/particles/TrajectoryEmitter");
const path = [{ time: 0, x: 10, y: 20, opacity: 1 }, { time: 1000, x: 110, y: 220, opacity: 0 }];

test("native emissions repeat, retain paused/outgoing poses and restart on a step without ticking React", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let commits = 0, tree;
  try {
    await act(() => { tree = create(<Profiler id="emitter" onRender={() => commits++}>
      <TrajectoryEmitter trajectories={[path, path]} interval={1000} start={500} previewTime={1}
        initialEmissions={[{ trajectory: 1, delay: 0 }]} renderParticle={(index, initial) => <particle index={index} initial={initial} />} />
    </Profiler>); });
    const styles = () => tree.root.findAllByType("animated-view").map(view => view.props.style[1].value);
    const initialCommits = commits;
    expect(styles().map(style => style.opacity)).toEqual([0, 0, 1]);
    playback.value = advancePlayback(advancePlayback(playback.value, 0), 1000);
    expect(styles().map(style => style.opacity)).toEqual([0.5, 0, 0]);
    expect(styles()[0].transform).toEqual([{ translateX: 60 }, { translateY: 120 }]);
    const paused = styles();
    playback.value = transitionPlayback(playback.value, { ...input, phase: "paused" });
    playback.value = advancePlayback(playback.value, 9000);
    expect(styles()).toEqual(paused);
    playback.value = transitionPlayback(playback.value, { ...input, phase: "outgoing" });
    playback.value = advancePlayback(playback.value, 15000);
    expect(styles()).toEqual(paused);
    playback.value = transitionPlayback(playback.value, { ...input, phase: "preview" });
    expect(styles()[0].opacity).toBe(0.5);
    playback.value = transitionPlayback(playback.value, { ...input, stepKey: "1", stepIndex: 1 });
    expect(styles().map(style => style.opacity)).toEqual([0, 0, 1]);
    playback.value = advancePlayback(advancePlayback(playback.value, 20000), 23000);
    expect(styles()[0].opacity).toBe(0.5);
    expect(commits).toBe(initialCommits);
  } finally { await act(() => tree?.unmount()); }
});

test("invalid paths fail before entering the host keyframe sampler", () => {
  const base = { trajectories: [path], renderParticle: () => null };
  for (const props of [{ interval: 0 }, { start: -1 }, { trajectories: [[]] },
    { trajectories: [[path[1], path[0]]] }, { initialEmissions: [{ trajectory: 3, delay: 0 }] },
    { initialEmissions: [{ trajectory: 0, delay: NaN }] }]) {
    expect(() => TrajectoryEmitter({ ...base, ...props })).toThrow();
  }
});
