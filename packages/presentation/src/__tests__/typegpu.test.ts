// @ts-nocheck Bun's test globals are intentionally scoped to this standalone test suite.
import { describe, expect, test } from "bun:test";
import { defineTypeGPUScene } from "../typegpu";

describe("defineTypeGPUScene", () => {
  test("preserves the scene factory for the runtime host", () => {
    const scene = (() => ({ render() {} })) as any;
    expect(defineTypeGPUScene(scene)).toBe(scene);
  });
});
