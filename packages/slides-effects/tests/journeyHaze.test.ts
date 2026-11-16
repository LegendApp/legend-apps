import { expect, test } from "bun:test";
import { hazeEffect } from "../packs/journey/post";

test("haze horizon is finite, continuous and ordered across both shoulders", () => {
  const graph = hazeEffect.definition.build({ input: "hdr", id: () => "haze", options: {}, quality: "high", scale: 1, samples: 8, levels: 4 });
  const code = graph.passes[0].wgsl;
  const expression = code.match(/mix\(p.tint,p.horizon,(.*)\),amount\)/)![1];
  const smoothstep = (low: number, high: number, y: number) => {
    expect(low).toBeLessThan(high);
    const t = Math.max(0, Math.min(1, (y - low) / (high - low)));
    return t * t * (3 - 2 * t);
  };
  const horizon = (y: number) => Function("smoothstep", "uv", `return ${expression}`)(smoothstep, { y });
  expect(horizon(0)).toBe(1);
  expect(horizon(1)).toBe(0);
  let previous = horizon(0);
  for (let i = 1; i <= 1000; i++) {
    const value = horizon(i / 1000);
    expect(Number.isFinite(value)).toBe(true);
    expect(value).toBeLessThanOrEqual(previous);
    expect(previous - value).toBeLessThan(.004);
    previous = value;
  }
  for (const edge of [.4, .85]) expect(Math.abs(horizon(edge - 1e-6) - horizon(edge + 1e-6))).toBeLessThan(1e-9);
});
