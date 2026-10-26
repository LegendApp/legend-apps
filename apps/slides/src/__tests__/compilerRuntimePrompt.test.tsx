// @ts-nocheck Native dialog and runtime I/O are replaced; render the actual prompt.
import "./nativeMock";
import { expect, mock, test } from "bun:test";
import { observable } from "@legendapp/state";
import React from "react";
import { act, create } from "react-test-renderer";

const compilerRuntime$ = observable({ status: "missing", retryDeck: "/deck.mdx", arch: "x64", runtime: null, progress: null, error: "" });
let changes = 0, detections = 0;
mock.module("../compilerRuntime", () => ({
  runtimeHost() {}, compilerRuntime$, changeCompilerRuntime: async operation => { changes++; await operation(); },
  resolveCompilerRuntime: async options => { if (options.refresh) detections++; },
  downloadCompilerRuntime() {}, setCustomCompilerRuntime() {},
}));
mock.module("@legendapp/spark/dialogs", () => ({ openFileDialog() {} }));
mock.module("@legendapp/spark/settings/window", () => ({
  SettingsSection: "section", SettingsRow: ({ control }) => control,
}));
mock.module("../slidesSettings", () => ({ useCompilerRuntimePathSetting: () => "" }));
const { CompilerSettingsPage } = await import("../CompilerSettingsPage");
const { CompilerRuntimePrompt, CompilerDownloadPrompt, runtimeStatusText } = await import("../CompilerRuntimePrompt");

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

test("missing runtime wording uses the architecture", () => {
  expect(runtimeStatusText("missing", "", "arm64")).toContain("24 MB");
  expect(runtimeStatusText("missing", "", "x64")).toContain("27 MB");
  expect(runtimeStatusText("missing", "", null)).not.toContain("MB");
});

test("deck prompt and Settings share bytes, percent, verifying and installing progress", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  compilerRuntime$.assign({ status: "downloading", progress: null });
  let renderer;
  try {
    await act(() => { renderer = create(<CompilerRuntimePrompt />); });
    expect(renderer.root.findByProps({ accessibilityRole: "progressbar" }).props.accessibilityLabel).toBe("Preparing Bun download…");
    await act(() => compilerRuntime$.progress.set({ phase: "downloading", fraction: 0.5, totalBytes: 100 }));
    // Opening Settings during the download must immediately show the same state.
    await act(() => renderer.update(<><CompilerRuntimePrompt /><CompilerSettingsPage /></>));
    const bars = () => renderer.root.findAllByProps({ accessibilityRole: "progressbar" });
    expect(bars()).toHaveLength(2);
    for (const bar of bars()) {
      expect(bar.props.accessibilityLabel).toContain("50 / 100 bytes (50%)");
      expect(bar.props.accessibilityValue.now).toBe(50);
      expect(bar.children[0].props.style.width).toBe("50%");
    }
    for (const phase of ["verifying", "installing"]) {
      await act(() => compilerRuntime$.progress.set({ phase, fraction: 1, totalBytes: 100 }));
      for (const bar of bars()) {
        expect(bar.props.accessibilityLabel).toBe(phase === "verifying" ? "Verifying Bun download…" : "Installing Bun…");
        expect(bar.props.accessibilityValue.now).toBe(100);
      }
      for (const button of renderer.root.findAllByType("pressable")) expect(button.props.disabled).toBe(true);
    }
    await act(() => compilerRuntime$.assign({ status: "ready", runtime: { kind: "bun", version: "1.3.14", source: "downloaded", path: "/runtime/bun" } }));
    expect(bars()).toHaveLength(0);
    expect(renderer.root.findByProps({ accessibilityLabel: "Reinstall" }).props.disabled).toBe(false);
    await act(() => compilerRuntime$.assign({ status: "error", error: "offline" }));
    expect(renderer.root.findAllByProps({ accessibilityLabel: "Try Again" }).length).toBeGreaterThan(0);
  } finally { if (renderer) await act(() => renderer.unmount()); }
});

test("compiler download shows progress and an actionable retry for the pending deck", async () => {
  const { compilerHelper$ } = await import("../compilerHelper");
  let retries = [];
  mock.module("../deckLoader", () => ({ retryCompilerDownload: async () => { retries.push("retry"); } }));
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  let renderer;
  try {
    await act(() => { renderer = create(<CompilerDownloadPrompt />); });
    expect(renderer.toJSON()).toBeNull();
    await act(() => compilerHelper$.assign({ busy: true, message: "Downloading deck compiler…" }));
    expect(JSON.stringify(renderer.toJSON())).toContain("Downloading deck compiler");
    expect(renderer.root.findAllByType("pressable")).toHaveLength(0);
    await act(() => compilerHelper$.assign({ busy: false, error: "Connect to the internet and retry.", retryDeck: "/pending.mdx" }));
    expect(JSON.stringify(renderer.toJSON())).toContain("Connect to the internet");
    await act(() => renderer.root.findByProps({ accessibilityLabel: "Retry Compiler Download" }).props.onPress());
    await new Promise(done => setTimeout(done, 0));
    expect(retries).toEqual(["retry"]);
    await act(() => compilerHelper$.assign({ error: "", retryDeck: null }));
    expect(renderer.toJSON()).toBeNull();
  } finally { if (renderer) await act(() => renderer.unmount()); }
});
