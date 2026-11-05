import "../../../apps/slides/src/__tests__/nativeMock";
import { expect, test } from "bun:test";
import React from "react";
import { highlightedFence } from "./highlightedFence";
import { Layers, expandScene } from "../packs/world/Authoring";
import { prepareWorldSlides } from "../packs/world/World";
import { instanceOpacity, sampleTrack } from "../packs/world/scene";

for (const first of [0, 2]) test(`word layer meter jumps on each reveal and resets on replay, starting at step ${first}`, async () => {
  const children = expandScene(<Layers id="line" words={["state", "user", "name", "get()"]} step={first}
    meter={[.25, .5, .75, 1]}>{await highlightedFence("state.user.name.get()")}</Layers>, "layers");
  const prepared = prepareWorldSlides([{ children }])[0].scenePlan!.content.prepared;
  const cards = Array.from({ length: 4 }, (_, k) => prepared.instances.find(i => i.id === `line/${k}`)!);
  const fill = prepared.instances.find(i => i.id === "line/fill")!;
  const track = prepared.instances.find(i => i.id === "line/track")!;
  const sample = (stepIndex: number, time: number) => ({ slideTime: time, stepTime: time, stepIndex, stepOrigins: { [stepIndex]: 0 } });
  const length = sampleTrack(track.scale, sample(0, 0))[0];
  for (let cycle = 0; cycle < 3; cycle++) {
    if (first) expect(sampleTrack(fill.scale, sample(first - 1, 4))[0]).toBeCloseTo(.001);
    for (let k = 0; k < 4; k++) {
      const arrival = sample(first + k, .001), fraction = (k + 1) / 4;
      expect(cards.map(card => instanceOpacity(card, arrival) > 0)).toEqual(cards.map((_, n) => n <= k));
      for (const time of [0, .001, .3, 1.6, 8]) {
        const clock = sample(first + k, time), width = sampleTrack(fill.scale, clock)[0], x = sampleTrack(fill.position, clock)[0];
        expect(width / length).toBeCloseTo(fraction);
        expect(x - width / 2).toBeCloseTo(-length / 2);
        expect(sampleTrack(fill.color, clock)).toEqual(sampleTrack(cards[k].color, clock));
        if (k === 3) expect(x + width / 2).toBeCloseTo(length / 2);
      }
    }
    for (const k of [2, 1, 0]) expect(sampleTrack(fill.scale, sample(first + k, 0))[0] / length).toBeCloseTo((k + 1) / 4);
  }
});
