// @ts-nocheck Native browser injection is recorded at the component boundary.
import { expect, test } from "bun:test";
import React from "react";
import { act, create } from "react-test-renderer";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { transformSync } from "@babel/core";
import { webviewPlaybackScript } from "../webviewPlayback";
test("navigation sends playback commands without replacing the document and preserves user hooks", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const filename = `${import.meta.dir}/../Webview.tsx`;
  const require = createRequire(filename);
  const {code} = transformSync(readFileSync(filename, "utf8"), {filename, babelrc: false, configFile: false, presets: [require.resolve("@react-native/babel-preset")]});
  let phase = "preview", loads = 0;
  const commands = [];
  const mocks = {react: React, "react-native": {StyleSheet: {create: x => x}}, "react-native-webview": {WebView: "browser"},
    "@legend-apps/presentation": {usePresentationValue: name => name === "playbackPhase" ? phase : false},
    "./webviewPlayback": {webviewPlaybackScript}};
  const Component = new Function("require", "exports", code + ";return Webview;")(name => mocks[name] ?? require(name), {});
  const render = () => <Component html="<div>content</div>" injectedJavaScriptBeforeContentLoaded="window.custom=true;" onLoadEnd={() => loads++} />;
  let tree;
  try {
    await act(() => { tree = create(render(), {createNodeMock: () => ({injectJavaScript: script => commands.push(script)})}); });
    const browser = () => tree.root.findByType("browser");
    const initial = browser().props.source;
    expect(browser().props.injectedJavaScriptBeforeContentLoaded).toContain("window.custom=true;");
    expect(browser().props.injectedJavaScriptBeforeContentLoadedForMainFrameOnly).toBe(true);
    phase = "playing"; await act(() => tree.update(render()));
    expect(browser().props.source).toEqual(initial);
    expect(commands.at(-1)).toBe(webviewPlaybackScript("playing", 1.25));
    phase = "outgoing"; await act(() => tree.update(render()));
    await act(() => browser().props.onLoadEnd({}));
    expect(commands.at(-1)).toBe(webviewPlaybackScript("outgoing", 1.25));
    expect(loads).toBe(1);
    await act(() => tree.update(<Component html="<div>content</div>" />));
    expect(browser().props.injectedJavaScriptBeforeContentLoadedForMainFrameOnly).toBe(false);
  } finally { if (tree) await act(() => tree.unmount()); }
});
