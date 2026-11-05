import "../../../apps/slides/src/__tests__/nativeMock";
// @ts-ignore Bun supplies the standalone test API.
import { expect, test } from "bun:test";
import React from "react";
import { Keys, expandScene } from "../packs/world/Authoring";
import { checkPart } from "../packs/world/authoringProps";
import { compileTrack, sampleTrack, sampleWorldUniforms, worldHeaderSize, worldInstanceSize, type Animated } from "../packs/world/scene";
import { prepareWorldSlides } from "../packs/world/World";
import type { Vec3 } from "../packs/world/camera";

const flat = (node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] => React.Children.toArray(node).flatMap(child =>
  React.isValidElement<{ children?: React.ReactNode }>(child) ? [child, ...flat(child.props.children)] : []);
const parts = flat(expandScene(<Keys id="items" at={[0, 0, 0]} keys={["A", "B", "C"]} next={["B", "C", "D"]}
  scroll={1} diff={2} remove={3} insert={4} recycle={5} />));
function sample<T extends number | Vec3>(id: string, prop: string, step: number, elapsed = 2): T {
  const value = parts.find(node => node.props.id === (id ? `items/${id}` : "items"))!.props[prop];
  return sampleTrack(compileTrack(value as Animated<T>), { slideTime: step * 3 + elapsed, stepTime: elapsed, stepIndex: step,
    stepOrigins: Object.fromEntries(Array.from({ length: step + 1 }, (_, i) => [i, i * 3])) });
}

test("scroll, clone, strike and insertion each wait for their authored step", () => {
  expect(sample<Vec3>("", "position", 0)).toEqual([0, 0, 0]);
  expect(sample<Vec3>("", "position", 1)[1]).toBeCloseTo(.57);
  expect(sample<Vec3>("", "position", 1, .45)[1]).toBeGreaterThan(0);
  expect(sample<Vec3>("", "position", 1, .45)[1]).toBeLessThan(.57);
  expect(sample<number>("copy/A/card", "opacity", 1)).toBe(0);
  expect(sample<number>("copy/A/card", "opacity", 2)).toBe(1);
  expect(sample<Vec3>("copy/A", "position", 2, .3)[0]).toBeGreaterThan(0);
  expect(sample<Vec3>("copy/A", "position", 2, .3)[0]).toBeLessThan(3.8);
  expect(sample<Vec3>("copy/A/strike", "scale", 2)[0]).toBe(0);
  expect(sample<Vec3>("copy/A/strike", "scale", 3, .45)[0]).toBeGreaterThan(0);
  expect(sample<Vec3>("copy/A/strike", "scale", 3)[0]).toBeCloseTo(3.4 * .85);
  expect(sample<number>("copy/A/card", "opacity", 3)).toBe(1);
  expect(sample<number>("copy/D/card", "opacity", 3)).toBe(0);
  expect(sample<number>("copy/D/card", "opacity", 4, .2)).toBeGreaterThan(0);
  expect(sample<number>("copy/D/card", "opacity", 4, .2)).toBeLessThan(1);
  expect(sample<number>("copy/D/card", "opacity", 4)).toBe(1);
  expect(sample<number>("copy/A/card", "opacity", 4)).toBe(0);
  expect(sample<Vec3>("copy/D", "position", 4)[1]).toBeCloseTo(-1.9);
  expect(sample<number>("link/B", "draw", 3)).toBe(0);
  expect(sample<number>("link/B", "draw", 4)).toBe(1);
  expect(sample<number>("copy/D/card", "opacity", 5)).toBe(0);
  expect(sample<Vec3>("A", "position", 5, 4)).toEqual([0, -1.9, 0]);
  // Seeking backwards restores the untouched clone and hides future edits.
  expect(sample<Vec3>("copy/A/strike", "scale", 2)[0]).toBe(0);
  expect(sample<number>("copy/A/card", "opacity", 2)).toBe(1);
  expect(sample<number>("copy/D/card", "opacity", 2)).toBe(0);
});

test("key operation controls reject fractional and negative step numbers", () => {
  for (const prop of ["scroll", "diff", "remove", "insert", "recycle"]) {
    for (const value of [-1, 1.5]) expect(() => checkPart("keys", { id: "items", keys: ["A"], [prop]: value })).toThrow(`${prop} must be a step number`);
  }
});

test("prepared GPU uniforms keep unchanged keys visible through insertion", () => {
  const [{ scenePlan }] = prepareWorldSlides([{ children: expandScene(<Keys id="items" keys={["A", "B", "C"]} next={["B", "C", "D"]}
    scroll={1} diff={2} remove={3} insert={4} recycle={5} />) }]);
  const scene = scenePlan!.content.prepared;
  for (const step of [0, 1, 2, 3, 4, 2]) {
    const values = sampleWorldUniforms(scene, { slideTime: step * 3 + 2, stepTime: 2, stepIndex: step,
      stepOrigins: Object.fromEntries(Array.from({ length: step + 1 }, (_, i) => [i, i * 3])) }, null, 1, 1, true);
    for (const name of ["B", "C"]) {
      const index = scene.instances.findIndex(part => part.id === `items/${name}/key0:0`);
      expect(index).toBeGreaterThanOrEqual(0);
      expect(values[worldHeaderSize + index * worldInstanceSize + 23]).toBe(1);
    }
  }
});
