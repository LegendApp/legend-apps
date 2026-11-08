// @ts-nocheck Run the real Deck registration with native render boundaries stubbed.
import { expect, test } from "bun:test";
import React from "react";
import { act, create } from "react-test-renderer";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { useValue } from "@legendapp/state/react";
import { getSlidesState, setSlidesState, slidesState$, normalizeStepCount } from "../slidesStore";
import { resolveSlideTemplate } from "../slideTemplates";

const pass = ({ children }) => children;
const presentation = {
  normalizeTransition: value => value,
  renderNativeChildren: children => children,
  DeckContentContext: React.createContext([]),
  PresentationCanvasScaleContext: React.createContext(1),
  PresentationObservableProvider: pass,
  useRuntimeProjection: () => ({ peek: () => ({}), onChange: () => () => {} }),
};
const dependencies = {
  react: React,
  "@legendapp/state/react": { useValue },
  "@legend-apps/presentation": presentation,
  "react-native": { View: "view", Text: "text", StyleSheet: { create: value => value } },
  "./slidesStore": { getSlidesState, setSlidesState, slidesState$, normalizeStepCount },
  "./steps": { countSteps: () => 0, resolveSteps: content => ({ content }) },
  "./slideTemplates": { resolveSlideTemplate },
  "./ContentErrorBoundary": { ContentErrorBoundary: pass },
  "./SlideCaptureContext": { SlideCaptureContext: React.createContext(false) },
};
const require = createRequire(new URL("../../../../packages/presentation/package.json", import.meta.url));
const { transformSync } = require("esbuild"), module = { exports: {} };
const source = readFileSync(new URL("../DeckRenderer.tsx", import.meta.url), "utf8") + "\nexport { Deck, Slide };";
const code = transformSync(source, { loader: "tsx", format: "cjs" }).code;
Function("require", "module", "exports", code)(name => dependencies[name] ?? {}, module, module.exports);
const { Deck, Slide } = module.exports;

test("mounting a new preview preserves notes updated without replacing its compiled component", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  setSlidesState({ slides: [], config: {}, sourceNotes: ["updated without compiling"] });
  const compiled = <Deck configJson="{}"><Slide metadataJson="{}" notes="old compiled notes" /></Deck>;
  let audience, preview;
  try {
    await act(() => { audience = create(compiled); });
    expect(getSlidesState().slides[0].notes).toBe("updated without compiling");
    await act(() => { preview = create(compiled); });
    expect(getSlidesState().slides[0].notes).toBe("updated without compiling");
    setSlidesState({ sourceNotes: undefined });
    await act(() => { preview.unmount(); preview = create(compiled); });
    expect(getSlidesState().slides[0].notes).toBe("old compiled notes");
  } finally { await act(() => { audience?.unmount(); preview?.unmount(); }); }
});
