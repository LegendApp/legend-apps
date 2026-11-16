import "../../../apps/slides/src/__tests__/nativeMock";
import { expect, test } from "bun:test";
import React from "react";
import { defineSceneComponent, Instances, Floor, Stage, prepareWorldSlides, primitive } from "../packs/world/World";
import { buildWorldGraph, worldGraphTopology } from "../packs/world/render";
import { sampleWorldUniforms, worldHeaderSize, instanceField } from "../packs/world/scene";

test("local declaration macros preserve instance tracks and nested Stage transforms without changing caller data", () => {
  const items = [primitive("sphere", { id: "sculpture", position: { 0: [1, 0, 0], 1: [3, 0, 0] } })];
  const Sculpture = defineSceneComponent(({ offset }: { offset: number }) => <Stage id="inner" position={[offset, 0, 0]}><Instances items={items} /></Stage>);
  const Nested = defineSceneComponent(() => <Sculpture offset={2} />);
  const plans = prepareWorldSlides([{ children: <Stage id="outer" position={[4, 0, 0]}><Nested /></Stage> }, { children: <Instances items={items} /> }]);
  expect(items[0].stages).toBeUndefined();
  const sample = (i: number, stepIndex: number) => sampleWorldUniforms(plans[i].scenePlan!.content.prepared,
    { stepIndex, stepTime: 10, slideTime: 10, stepOrigins: { [stepIndex]: 0 } });
  expect(sample(0, 0)[worldHeaderSize + instanceField.position]).toBe(7);
  expect(sample(0, 1)[worldHeaderSize + instanceField.position]).toBe(9);
  expect(sample(1, 0)[worldHeaderSize + instanceField.position]).toBe(1);
});

test("a local floor shader changes topology and composes with generic lighting and grid", () => {
  const a = prepareWorldSlides([{ children: <Floor grid={{ spacing: 3 }} shader="color*=vec3f(.5,1.,1.); mask=1.;" /> }])[0].scenePlan!.content.prepared;
  const b = prepareWorldSlides([{ children: <Floor grid={{ spacing: 3 }} shader="color*=vec3f(1.,.5,1.);" /> }])[0].scenePlan!.content.prepared;
  const floor = buildWorldGraph(a).passes.find(pass => pass.id === "floor")!;
  expect(floor.code).toContain("world.xz/3.");
  expect(floor.code).toContain("color*=vec3f(.5,1.,1.); mask=1.;");
  expect(worldGraphTopology(a)).not.toEqual(worldGraphTopology(b));
});
