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

test("grouping keeps layout fixed and sends the logical destination to shared playback and measurement", () => {
  const module = { exports: {} };
  const mocks = {
    react: { useContext: () => 20 },
    "./SceneMotionView": { SceneMotionView: "scene-motion" },
    "./focus": { FocusLayoutOffsetContext: { Provider: "logical-offset" } },
  };
  new Function("require", "module", "exports", code)(name => mocks[name] ?? require(name), module, module.exports);
  for (const y of [55, 400, 100]) {
    const rendered = module.exports.ScenePositionView({ y, children: null });
    expect(rendered.type).toBe("scene-motion");
    expect(Object.assign({}, ...rendered.props.style).top).toBe(0);
    expect(rendered.props.pose).toEqual({ y });
    expect(rendered.props.children.props.value).toBe(y + 20);
  }
});
