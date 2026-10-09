// @ts-nocheck Guard host, optional packs, decks and examples, including local web assets.
import { expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { transformSync } from "@babel/core";
const root = path.resolve(import.meta.dir, "../../../..");
const require = createRequire(import.meta.url);
function sources(directory) {
  return readdirSync(directory, {withFileTypes: true}).flatMap(entry => {
    if (["node_modules", "__tests__", ".build", "dist"].includes(entry.name)) return [];
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? sources(file) : /\.[jt]sx?$/.test(file) ? [file] : [];
  });
}
const files = [...sources(path.join(root, "apps/slides")), ...sources(path.join(root, "packages/presentation/src")),
  ...sources(path.join(root, "packages/slides-effects/packs"))];
test("Slides, optional packs, decks and examples never use React Native Animated or JS animation schedulers", () => {
  for (const file of files) {
    const source = readFileSync(file, "utf8");
    expect(source, file).not.toMatch(/\bdisableWorklets\b|\buseFrame\s*\(/);
    expect(source, file).not.toMatch(/\bAnimated\b[^;]*from\s*["']react-native["']/);
    if (file.endsWith("/snapshotCaptureQueue.ts")) continue; // Bounded capture scheduling, never animation.
    expect(source, file).not.toMatch(/\b(?:requestAnimationFrame|cancelAnimationFrame)\s*\(/);
  }
});
test("gallery frame callbacks and transition worklets compile with the shipped compiler", () => {
  const candidates = files;
  for (const filename of candidates) {
    const source = readFileSync(filename, "utf8");
    if (!source.includes('"worklet"') && !source.includes("useEffectTime") && !/useAnimated(?:Style|Props|Reaction)/.test(source)) continue;
    const result = transformSync(source, { filename, babelrc: false, configFile: false,
      presets: [require.resolve("@react-native/babel-preset")],
      plugins: [[require.resolve("babel-plugin-react-compiler"), {panicThreshold: /\/(decks|examples)\//.test(filename) ? "all_errors" : "none", target: "19"}], require.resolve("react-native-worklets/plugin")],
    });
    expect(result?.code, filename).toBeTruthy();
  }
});
