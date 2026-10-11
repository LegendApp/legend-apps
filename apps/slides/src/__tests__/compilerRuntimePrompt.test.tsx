// @ts-nocheck Native dialog and runtime I/O are replaced; render the actual prompt.
import "./nativeMock";
import { expect, mock, test } from "bun:test";
import { observable } from "@legendapp/state";
import React from "react";
import { act, create } from "react-test-renderer";

const compilerRuntime$ = observable({ status: "missing", retryDeck: "/deck.mdx", arch: "x64", progress: 0, error: "" });
let changes = 0, detections = 0;
mock.module("../compilerRuntime", () => ({
  compilerRuntime$, changeCompilerRuntime: async operation => { changes++; await operation(); },
  resolveCompilerRuntime: async options => { if (options.refresh) detections++; },
  downloadCompilerRuntime() {}, prefetchCompilerRuntime() {}, setCustomCompilerRuntime() {},
}));
mock.module("@legendapp/spark/dialogs", () => ({ openFileDialog() {} }));
const { CompilerRuntimePrompt, runtimeStatusText } = await import("../CompilerRuntimePrompt");

test("missing runtime prompt offers Detect Again through the shared retry operation", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let renderer;
  try {
    await act(() => { renderer = create(<CompilerRuntimePrompt />); });
    const detect = renderer.root.findAllByType("pressable").find(button => button.props.accessibilityLabel === "Detect Again");
    expect(detect.props.disabled).toBe(false);
    await act(() => detect.props.onPress());
    expect(detections).toBe(1);
    expect(changes).toBe(1);
  } finally { if (renderer) await act(() => renderer.unmount()); }
});

test("download wording uses the architecture and acknowledges a running background download", () => {
  expect(runtimeStatusText("missing", 0, "", "arm64")).toContain("24 MB");
  expect(runtimeStatusText("missing", 0, "", "x64")).toContain("27 MB");
  expect(runtimeStatusText("missing", 0, "", null)).not.toContain("MB");
  expect(runtimeStatusText("downloading", 0.5, "", "x64")).toContain("in the background");
  expect(runtimeStatusText("downloading", 0.5, "", "x64")).toContain("50%");
});
