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

test("grouping changes only the transform and exposes logical destination geometry", () => {
  const position = { value: 55 };
  let updateStyle;
  let appliedStyle;
  const module = { exports: {} };
  const mocks = {
    react: { useLayoutEffect() {}, useContext: () => 0 },
    "react-native-reanimated": {
      __esModule: true, default: { View: "view" },
      useSharedValue: () => position,
      useAnimatedStyle: callback => {
        updateStyle = callback;
        appliedStyle ??= callback();
        return appliedStyle;
      },
    },
    "./focus": { FocusLayoutOffsetContext: { Provider: "logical-offset" } },
    "./runtime": { usePresentationValue: key => key === "isActive" },
  };
  new Function("require", "module", "exports", code)(name => mocks[name] ?? require(name), module, module.exports);
  const render = y => module.exports.ScenePositionView({ y, children: null });
  render(55);
  const next = render(400);
  // React commits while the UI thread still has the previous animated style.
  const committed = Object.assign({}, ...next.props.style);
  expect(committed.top + committed.transform[0].translateY).toBe(55);
  // Native layout stays fixed; only the transform moves, on the UI thread.
  const firstFrame = updateStyle();
  expect(committed.top).toBe(0);
  expect(firstFrame.top).toBeUndefined();
  expect(next.props.children.props.value).toBe(400);
  expect(firstFrame.transform[0].translateY).toBe(55);
  position.value = 200;
  const middle = updateStyle();
  expect(middle.transform[0].translateY).toBe(200);
  position.value = 400;
  expect(updateStyle().transform[0].translateY).toBe(400);
});
