import { test, expect } from "bun:test";
import { readFileSync } from "node:fs";
import { transformSync } from "esbuild";

// Exercise the real uniform hooks with UI-thread reactions stepped explicitly.
test("title reads the background clock without becoming a second writer", () => {
  const motion = { value: { time: 20, raw: 10, burst: 3.5, slideIndex: 0, owner: "background" } };
  const clock = { value: { phase: "playing", slideKey: "background", slideTime: 10, stepTime: 4, stepIndex: 2 } };
  const reactions = [];
  let index = 0;
  const modules = {
    "./background": { useBackgroundMotion: () => motion, useBackgroundBrightnessScale: () => ({ value: 1 }) },
    "./runtime": { usePresentationValue: () => index },
    "./playback": { usePlayback: () => clock, samplePlayback: state => state.slideTime },
    "react-native-reanimated": {
      useSharedValue: value => ({ value }),
      useDerivedValue: read => ({ get value() { return read(); } }),
      useAnimatedReaction: (read, react) => reactions.push(() => react(read())),
    },
  };
  const code = transformSync(readFileSync(new URL("../useAnimatedShaderUniforms.ts", import.meta.url), "utf8"), { loader: "ts", format: "cjs" }).code;
  const module = { exports: {} };
  Function("require", "module", "exports", code)(name => modules[name], module, module.exports);
  const { useAnimatedShaderUniforms, useBackgroundInteractionUniforms } = module.exports;
  const title = useAnimatedShaderUniforms({ resolution: [1920, 1080] }, 8, { persistentBackground: "read" });
  const background = useAnimatedShaderUniforms({ resolution: [2560, 1600], brightness: 0.7, drops: [] }, 8, { persistentBackground: true, speed: 0.096 });
  clock.value = { ...clock.value, slideTime: 11 };
  reactions.forEach(tick => tick());
  expect(motion.value.time).toBeCloseTo(20.096);
  expect(title.value.time).toBe(background.value.time);
  const interaction = { value: { titleFeed: 1, drops: [1, 2, 3, 0], resolution: [1920, 1080], backgroundTime: 0 } };
  const fed = useBackgroundInteractionUniforms(background, interaction);
  expect(fed.value.resolution).toEqual([2560, 1600]);
  expect(fed.value.backgroundTime).toBe(title.value.time);
  expect(fed.value.drops).toEqual(interaction.value.drops);
  // Removing the title interaction changes only the geometry, not ambient time.
  const next = useBackgroundInteractionUniforms(background);
  expect(next.value.titleFeed).toBe(0);
  expect(next.value.backgroundTime).toBe(fed.value.backgroundTime);
  index = 1;
  clock.value = { ...clock.value, slideTime: 12, stepIndex: 0 };
  reactions.forEach(tick => tick());
  expect(next.value.backgroundTime).toBeCloseTo(20.192);
});
