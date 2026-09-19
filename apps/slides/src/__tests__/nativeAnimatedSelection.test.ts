// @ts-nocheck Test the installed, patched React Native macOS selector.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { transformSync } from "@babel/core";

const require = createRequire(import.meta.url);
const filename = new URL("../../../../shell/node_modules/react-native-macos/Libraries/Animated/shouldUseTurboAnimatedModule.js", import.meta.url).pathname;
const { code } = transformSync(readFileSync(filename, "utf8"), {
  filename, babelrc: false, configFile: false,
  presets: [require.resolve("@react-native/babel-preset")],
});
function select(platform, bridgeless, cxx = false) {
  const module = { exports: {} };
  new Function("require", "module", "exports", "global", code)(name => {
    if (name.endsWith("ReactNativeFeatureFlags")) return { cxxNativeAnimatedEnabled: () => cxx };
    if (name.endsWith("/Platform")) return { OS: platform };
    return require(name);
  }, module, module.exports, { RN$Bridgeless: bridgeless });
  return module.exports.default();
}

test("bridgeless macOS selects the initialized Turbo animation manager", () => {
  expect(select("macos", true)).toBe(true);
  expect(select("ios", true)).toBe(true);
});

test("legacy bridge, Android and C++ animation selection stay unchanged", () => {
  expect(select("macos", false)).toBe(false);
  expect(select("ios", false)).toBe(false);
  expect(select("android", true)).toBe(false);
  expect(select("macos", true, true)).toBe(false);
});
