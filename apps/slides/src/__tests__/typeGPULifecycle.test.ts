// @ts-nocheck Bun globals are scoped to this test suite.
import { expect, mock, test } from "bun:test";
import { TypeGPU } from "../TypeGPU";

test("retired TypeGPU scenes fail with migration guidance without executing user callbacks", () => {
  const scene = mock(() => { throw new Error("must not run"); });
  expect(() => TypeGPU({ scene })).toThrow("Use TypeGPUShader");
  expect(scene).not.toHaveBeenCalled();
});
