// @ts-nocheck Simulate separate React commits and UI-thread style updates.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { transformSync } from "@babel/core";

const require = createRequire(import.meta.url);
const filename = new URL("../../../../packages/presentation/src/ScenePositionView.tsx", import.meta.url).pathname;
const { code } = transformSync(readFileSync(filename, "utf8"), {
  filename, babelrc: false, configFile: false,
  presets: [require.resolve("@react-native/babel-preset")],
  plugins: [require.resolve("react-native-worklets/plugin")],
});

test("a grouping commit cannot move layout before its compensating transform", () => {
  const position = { value: 55 };
  let updateStyle;
  let appliedStyle;
  const module = { exports: {} };
  const mocks = {
    react: { useLayoutEffect() {} },
    "react-native-reanimated": {
      __esModule: true, default: { View: "view" },
      useSharedValue: () => position,
      useAnimatedStyle: callback => {
        updateStyle = callback;
        appliedStyle ??= callback();
        return appliedStyle;
      },
    },
    "./runtime": { usePresentationValue: key => key === "isActive" },
  };
  new Function("require", "module", "exports", code)(name => mocks[name] ?? require(name), module, module.exports);
  const render = y => module.exports.ScenePositionView({ y, children: null });
  render(55);
  const next = render(400);
  // React commits while the UI thread still has the previous animated style.
  const committed = Object.assign({}, ...next.props.style);
  expect(committed.top + committed.transform[0].translateY).toBe(55);
  // When the UI worklet runs, both destination top and compensation change.
  const firstFrame = updateStyle();
  expect(firstFrame.top).toBe(400);
  expect(firstFrame.top + firstFrame.transform[0].translateY).toBe(55);
  position.value = 200;
  const middle = updateStyle();
  expect(middle.top + middle.transform[0].translateY).toBe(200);
  position.value = 400;
  expect(updateStyle().transform[0].translateY).toBe(0);
});
