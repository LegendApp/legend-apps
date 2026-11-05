// @ts-nocheck Exercise workspace scheduling without native window services.
import { expect, test } from "bun:test";
import React from "react";
import { act, create } from "react-test-renderer";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { transformSync } from "@babel/core";

test("rehearsal follows input immediately while hidden capture waits for settlement", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const file = new URL("../PresenterWindow.tsx", import.meta.url).pathname;
  const require = createRequire(file);
  const { code } = transformSync(readFileSync(file, "utf8"), {
    filename: file, babelrc: false, configFile: false,
    presets: [require.resolve("@react-native/babel-preset")],
    plugins: [() => ({ visitor: { Program(program) {
      program.node.body = program.node.body.filter(node => node.type === "FunctionDeclaration" && node.id.name === "PresenterWorkspace");
    } } })],
  });
  let audienceOpen = false, settled = "1:0:1:1";
  const layout = { notesRatio: .3, currentPreviewRatio: .7 };
  const dependencies = {
    useValue: value => value.get(), useObservable: () => ({ get: () => layout, peek: () => layout }),
    useRef: React.useRef, useEffect: React.useEffect, useCallback: React.useCallback,
    slidesState$: { audienceOpen: { get: () => audienceOpen } },
    useAudienceSettled: (navigation, enabled) => enabled ? settled : navigation,
    usePreviewStills: () => ({ stills: {}, targets: [], sweep: { generation: "one" } }),
    stillKey: (index, step) => `${index}:${step}`,
    View: "view", Preview: "preview", PreviewStillSweep: "capture-sweep", ResizeHandle: "resize",
    DeferredPresenterPreview: ({ children }) => children,
    styles: {},
  };
  const Workspace = Function(...Object.keys(dependencies), "require", "exports", code + "\nreturn PresenterWorkspace;")(
    ...Object.values(dependencies), require, {},
  );
  const content = <Workspace currentIndex={2} currentStep={1} nextIndex={2} nextStep={2} resetVersion={0} showNext showNotes={false} />;
  let renderer;
  try {
    await act(() => { renderer = create(content); });
    expect(renderer.root.findByType("capture-sweep").props.paused).toBe(true);
    expect(renderer.root.findAllByType("preview").map(node => [node.props.index, node.props.stepIndex])).toEqual([[2, 1], [2, 2]]);
    settled = "2:1:2:2";
    await act(() => renderer.update(React.cloneElement(content)));
    expect(renderer.root.findByType("capture-sweep").props.paused).toBe(false);
    audienceOpen = true;
    await act(() => renderer.update(React.cloneElement(content)));
    expect(renderer.root.findByType("capture-sweep").props.paused).toBe(true);
  } finally { await act(() => renderer?.unmount()); }
});
