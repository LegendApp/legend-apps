import "../../../apps/slides/src/__tests__/nativeMock";
// @ts-ignore Bun supplies the standalone test API.
import { expect, test } from "bun:test";
import React from "react";
import { Grid, expandScene } from "../packs/world/Authoring";
import { colorVector, compileTrack, sampleTrack, type Animated } from "../packs/world/scene";

const flat = (node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] => React.Children.toArray(node).flatMap(child =>
  React.isValidElement<{ children?: React.ReactNode }>(child) ? [child, ...flat(child.props.children)] : []);

test("resize flashes pulse every cell together, including new rows, and rest whenever the window holds", () => {
  for (const repeat of [undefined, "infinite"] as const) {
    const parts = flat(expandScene(<Grid id="g" count={24} columns={6} label="MyText" resize="height" anchor="top" grow={2}
      flash={{ step: 1, rate: 8, delay: .6, duration: 3.4, repeat, while: "resizing", color: "#ff0000" }} />));
    const sample = (id: string, prop: string, time: number, stepIndex = 1) => {
      const value = parts.find(n => n.props.id === id)!.props[prop];
      const track = prop === "color" ? compileTrack(value as Animated<string>, colorVector) : compileTrack(value as Animated<number>);
      return sampleTrack<number | [number, number, number]>(track,
        { slideTime: time, stepTime: time, stepIndex, stepOrigins: { [stepIndex]: 0 } });
    };
    for (const cycle of repeat ? [0, 1, 1000] : [0]) {
      const offset = .6 + cycle * 3.4;
      for (let i = 0; i < 36; i++) {
        const id = `g/${i}`, rest = sample(id, "emissive", .3) as number;
        for (const drag of [0, 1.7]) for (const beat of [0, .125, .75, 1.125]) {
          const peak = offset + drag + beat + .018;
          expect(sample(id, "emissive", peak)).toBeGreaterThan(rest);
          expect(sample(id, "color", peak)).toEqual(colorVector("#ff0000"));
          expect(sample(`${id}/label`, "emissive", peak)).toBeGreaterThan(.8);
          expect(sample(id, "emissive", offset + drag + beat + .12)).toBeCloseTo(rest);
          expect(sample(id, "color", offset + drag + beat + .12)).toEqual(sample(id, "color", .3));
        }
        for (const hold of [1.2, 1.35, 1.69, 2.9, 3.1, 3.39]) {
          expect(sample(id, "emissive", offset + hold)).toBeCloseTo(rest);
          expect(sample(id, "color", offset + hold)).toEqual(sample(id, "color", .3));
          expect(sample(`${id}/label`, "emissive", offset + hold)).toBeCloseTo(.8);
        }
        expect(sample(id, "emissive", 1, 0)).toBeCloseTo(rest);
      }
      expect(sample("g/35", "opacity", offset + 1.15)).toBe(1);
      expect(sample("g/35", "opacity", offset + 3.3)).toBe(0);
    }
    if (!repeat) expect(sample("g/0", "emissive", 1000)).toBeCloseTo(sample("g/0", "emissive", .3));
  }
});
