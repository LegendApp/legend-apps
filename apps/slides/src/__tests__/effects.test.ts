// @ts-nocheck Bun's test globals are intentionally scoped to this standalone test suite.
import { describe, expect, test } from "bun:test";
import { effectPresets, resolveEffectSource } from "../effects";

describe("slide effects", () => {
  test("provides the built-in effect library", () => {
    expect(Object.keys(effectPresets)).toEqual(["liquid", "ripple", "glitch", "pixelate"]);
    expect(resolveEffectSource("liquid")).toContain("uniform shader image");
  });

  test("lets a deck supply a custom shader", () => {
    const shader = "uniform shader image; half4 main(float2 p) { return image.eval(p); }";
    expect(resolveEffectSource("unknown", shader)).toBe(shader);
    expect(resolveEffectSource("unknown")).toBeUndefined();
  });
});
