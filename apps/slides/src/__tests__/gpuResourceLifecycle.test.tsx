// @ts-nocheck The GPU setup boundary is supplied by this test.
import { expect, test } from "bun:test";
import React from "react";
import { act, create } from "react-test-renderer";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { transformSync } from "@babel/core";
import { fileURLToPath } from "node:url";

test.each(["macos", "web"])("persistent backgrounds retain GPU resources across slides and resizing on %s", async platform => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const filename = fileURLToPath(new URL("../TypeGPUShader.tsx", import.meta.url));
  const require = createRequire(filename);
  const { code } = transformSync(readFileSync(filename, "utf8"), {
    filename, babelrc: false, configFile: false, presets: [require.resolve("@react-native/babel-preset")],
  });
  let index = 0, preview = false, setups = 0, cleanups = 0, report, tree;
  const errors = [];
  let size = {width: 100, height: 100};
  const surface = {width: 0, height: 0};
  const scale = React.createContext(1);
  const mocks = {
    react: React, "react-native": { View: "View", Text: "Text", Platform: { OS: platform }, PixelRatio: { get: () => 2 } },
    "react-native-webgpu": { Canvas: "Canvas" }, "react-native-reanimated": {},
    "@legend-apps/presentation": { PresentationCanvasScaleContext: scale, useBackgroundSize: () => size,
      useBackgroundIntensity: () => 1, usePreparationTask: () => {}, usePresentationValue: field => field === "slideIndex" ? index : preview },
    "./slidesStore": { reportSlideError: (...args) => errors.push(args) },
  };
  const Component = new Function("require", "exports", "setup", "navigator", code + "\nstartShaderCanvas = setup; return TypeGPUShader;")(
    name => mocks[name] ?? require(name), {}, options => { setups++; report = options.reportError; return () => { cleanups++; }; },
    { gpu: {} },
  );
  const expectedSize = () => platform === "web" ? { width: size.width * 2, height: size.height * 2 } : size;
  await act(() => { tree = create(<Component code="first" background />, {createNodeMock: () => ({getNativeSurface: () => surface, getContext: () => ({ canvas: surface })})}); });
  expect(surface).toEqual(expectedSize());
  for (let width = 101; width <= 120; width++) {
    size = {width, height: width};
    await act(() => tree.update(<Component code="first" background />));
    expect(surface).toEqual(expectedSize());
  }
  expect(setups).toBe(1); expect(cleanups).toBe(0);
  index = 3; preview = true;
  await act(() => tree.update(<Component code="first" background />));
  expect(setups).toBe(1); expect(cleanups).toBe(0);
  report("failed");
  expect(errors).toEqual([["failed", 3, true]]);
  await act(() => tree.update(<Component code="changed" background />));
  expect(setups).toBe(2); expect(cleanups).toBe(1);
  if (platform === "web") {
    await act(() => tree.update(<scale.Provider value={0.5}><Component code="changed" background /></scale.Provider>));
    const setupsBeforeResize = setups;
    await act(() => tree.update(<scale.Provider value={0.75}><Component code="changed" background /></scale.Provider>));
    expect(surface).toEqual({ width: 180, height: 180 });
    expect(setups).toBe(setupsBeforeResize);
  }
  await act(() => tree.unmount());
  expect(cleanups).toBe(setups);
});
