// @ts-nocheck Exercise the compiled renderer with native leaf views replaced.
import { expect, spyOn, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { transformSync } from "@babel/core";
import React from "react";
import { act, create } from "react-test-renderer";
import { usePresentation } from "@legend-apps/presentation";
import { getSlidesState, setCurrentSlide, setSlidesState } from "../slidesStore";

function compiledRenderer() {
  const filename = fileURLToPath(new URL("../DeckRenderer.tsx", import.meta.url));
  const require = createRequire(filename);
  const { code } = transformSync(readFileSync(filename, "utf8"), {
    filename, babelrc: false, configFile: false,
    presets: [require.resolve("@react-native/babel-preset")],
    plugins: [[require.resolve("babel-plugin-react-compiler"), { target: "19" }]],
  });
  const nativeLeaves = {
    "@legend-apps/scaled-view": { ScaledView: "scaled-view" },
    "react-native": {
      View: "view", Text: "text", Image: "image", Pressable: "pressable", Linking: {},
      StyleSheet: { create: (styles) => styles, absoluteFillObject: {} },
    },
    "./CodeBlock": { CodeBlock: "code" },
    "./Effect": { Effect: "effect" },
    "./TypeGPU": { TypeGPU: "gpu" },
    "./Webview": { Webview: "webview" },
  };
  const module = { exports: {} };
  new Function("require", "module", "exports", code)(
    (name) => nativeLeaves[name] ?? require(name), module, module.exports,
  );
  return module.exports.DeckRenderer;
}

test("compiled slide runtime deactivates on exit and reactivates on return", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const initial = getSlidesState();
  const DeckRenderer = compiledRenderer();
  function Probe() { return <runtime value={usePresentation()} />; }
  function Document({ components: { Deck, Slide } }) {
    return <Deck configJson="{}">{[0, 1].map((index) => (
      <Slide key={index} metadataJson="{}" notes=""><Probe /></Slide>
    ))}</Deck>;
  }
  const log = spyOn(console, "error").mockImplementation(() => {});
  let renderer;
  try {
    setSlidesState({ component: Document, currentSlide: 0, slides: [], config: {} });
    await act(() => { renderer = create(<DeckRenderer targetIndex={0} />); });
    // Audience transition layers keep the outgoing slide mounted across navigation.
    for (const current of [1, 0, 1, 0]) {
      await act(() => setCurrentSlide(current));
      const runtime = renderer.root.findByType("runtime").props.value;
      expect(runtime.currentSlide).toBe(current);
      expect(runtime.isActive).toBe(current === 0);
    }
  } finally {
    if (renderer) await act(() => renderer.unmount());
    setSlidesState(initial);
    log.mockRestore();
  }
});
