// @ts-nocheck The host supplies the native Lottie player; progress stays on the UI clock.
import { expect, mock, test } from "bun:test";
import React, { Profiler } from "react";
import { act, create } from "react-test-renderer";
import { createPlaybackState, advancePlayback, transitionPlayback } from "../../presentation/src/playbackState";
import { samplePlayback } from "../../presentation/src/playback";
const input = { phase: "playing", slideKey: "a", stepKey: "0", stepIndex: 0 };
const playback = { value: createPlaybackState(input) };
mock.module("@legend-apps/presentation", () => ({ usePlayback: () => playback, samplePlayback }));
mock.module("lottie-react-native", () => ({ __esModule: true, default: "lottie" }));
mock.module("react-native-reanimated", () => ({
  __esModule: true, default: { createAnimatedComponent: component => component },
  useDerivedValue: read => ({ get value() { return read(); } }),
  useAnimatedProps: read => ({ get value() { return read(); } }),
}));
const { LottiePlayer } = await import("../packs/animation/LottiePlayer");
test("external Lottie sources use static previews, retain outgoing progress and do not render on ticks", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let commits = 0, tree;
  const source = { v: "5.9.0", layers: [] };
  try {
    await act(() => { tree = create(<Profiler id="lottie" onRender={() => commits++}><LottiePlayer source={source} durationSeconds={4} previewProgress={0.5} /></Profiler>); });
    const player = tree.root.findByType("lottie");
    const progress = () => player.props.animatedProps.value.progress;
    expect(player.props.source).toBe(source);
    expect(progress()).toBe(0);
    const initialCommits = commits;
    playback.value = advancePlayback(advancePlayback(playback.value, 0), 1000);
    expect(progress()).toBe(0.25);
    playback.value = transitionPlayback(playback.value, { ...input, phase: "outgoing" });
    playback.value = advancePlayback(playback.value, 9000);
    expect(progress()).toBe(0.25);
    playback.value = transitionPlayback(playback.value, { ...input, phase: "preview" });
    expect(progress()).toBe(0.5);
    playback.value = transitionPlayback(playback.value, { ...input, phase: "preparing", slideKey: "b" });
    expect(progress()).toBe(0);
    expect(commits).toBe(initialCommits);
  } finally { await act(() => tree?.unmount()); }
});
