import "../../../apps/slides/src/__tests__/nativeMock";
import { expect, test } from "bun:test";
import { createRequire } from "node:module";
import path from "node:path";
import React from "react";
import { compileDeck } from "../../presentation/src/compiler";

type Worklet = Function & { __closure?: Record<string, unknown> };

test("compiled motion samplers capture initialized dependencies for the UI runtime", async () => {
  const root = path.resolve(import.meta.dirname, "../../..");
  const compiled = await compileDeck(path.join(root, "packages/slides-effects/tests/fixtures/journey-tour.mdx"), { source: `---
title: Sampler audit
---

import { sampleJourneyUniforms } from "slides:journey/Journey"
export const evaluator = sampleJourneyUniforms

# Sampler audit
`, effectPacksDirectory: path.join(root, "packages/slides-effects/packs") });
  if (!compiled.success) throw new Error(compiled.errors.join("\n"));
  const require = createRequire(import.meta.url), module = { exports: {} as Record<string, Worklet> };
  Function("require", "module", "exports", compiled.code)((name: string) => name === "@legend-apps/presentation"
    ? { PresentationCanvasScaleContext: React.createContext(1) } : require(name), module, module.exports);
  const visited = new Set<Function>(), missing: string[] = [];
  const audit = (fn: unknown, name: string) => {
    if (typeof fn !== "function" || visited.has(fn)) return;
    visited.add(fn);
    for (const [key, value] of Object.entries((fn as Worklet).__closure ?? {})) {
      if (value === undefined) missing.push(`${name}.${key}`);
      if (typeof value === "function") audit(value, `${name}.${key}`);
    }
  };
  expect(module.exports.evaluator.__closure).toBeDefined();
  audit(module.exports.evaluator, "sampleJourneyUniforms");
  expect(missing).toEqual([]);
  expect(visited.size).toBeGreaterThan(10);
});
