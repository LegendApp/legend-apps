// @ts-nocheck Bun's test globals are intentionally scoped to this standalone test suite.
import { describe, expect, test, spyOn } from "bun:test";
import React from "react";
import { act, create } from "react-test-renderer";
import { ContentErrorBoundary } from "../ContentErrorBoundary";
import { releaseGPUResources } from "../gpuCleanup";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

describe("slide runtime containment", () => {
  test("keeps controls mounted when a slide throws and recovers on retry", async () => {
    const errors = [];
    let broken = true;
    function Content() { if (broken) throw new Error("bad slide"); return <content />; }
    function App({ revision }) {
      return <root><controls /><ContentErrorBoundary key={revision} fallback={<fallback />} onError={(error) => errors.push(error.message)}><Content /></ContentErrorBoundary></root>;
    }
    const log = spyOn(console, "error").mockImplementation(() => {});
    let renderer;
    try {
      await act(() => { renderer = create(<App revision={0} />); });
      expect(renderer.root.findAllByType("controls").length).toBe(1);
      expect(renderer.root.findAllByType("fallback").length).toBe(1);
      expect(errors).toEqual(["bad slide"]);
      broken = false;
      await act(() => renderer.update(<App revision={1} />));
      expect(renderer.root.findAllByType("content").length).toBe(1);
      expect(renderer.root.findAllByType("fallback").length).toBe(0);
    } finally {
      if (renderer) await act(() => renderer.unmount());
      log.mockRestore();
    }
  });

  test("releases the device even if user cleanup throws or rejects", async () => {
    const errors = [];
    let releases = 0;
    const destroy = () => { releases++; };
    releaseGPUResources(() => { throw new Error("sync cleanup"); }, destroy, (e) => errors.push(e.message));
    releaseGPUResources(async () => { throw new Error("async cleanup"); }, destroy, (e) => errors.push(e.message));
    await Promise.resolve();
    expect(releases).toBe(2);
    expect(errors).toEqual(["sync cleanup", "async cleanup"]);
  });
});
