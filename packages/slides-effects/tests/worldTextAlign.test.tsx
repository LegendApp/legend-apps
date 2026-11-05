import "../../../apps/slides/src/__tests__/nativeMock";
// @ts-ignore Bun supplies the standalone test API.
import { describe, expect, test } from "bun:test";
import React from "react";
import { CodePanel, CodeTrace, Keys, expandScene } from "../packs/world/Authoring";
import { compileTrack, sampleTrack, type Animated } from "../packs/world/scene";
import { text3dBuffer, text3dInstances, type Text3DOptions } from "../packs/world/text3d";
import { font as display } from "../packs/world/text3d-font";
import type { Vec3 } from "../packs/world/camera";

// A 1280×720 frame of a station camera 12.6 units away with the default 42° field of view.
const pixels = 720 / (2 * 12.6 * Math.tan(21 * Math.PI / 180));
const near = (a: number, b: number) => expect(Math.abs(a - b) * pixels).toBeLessThan(1);

/** The text's ink bounds in its parent's space, from the glyph outlines the shader draws. */
function ink(props: Text3DOptions) {
  let bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const instance of text3dInstances(props)) {
    const glyph = instance.glyph!, words = text3dBuffer(glyph.font, "test").init!, integers = new Uint32Array(words.buffer);
    const start = integers[glyph.index * 6], count = integers[glyph.index * 6 + 1], size = props.size ?? 1, at = sampleTrack(instance.position, still);
    for (let i = 0; i < count; i++) {
      const x = at[0] + glyph.home[0] + (words[start + i * 6] - glyph.pivot[0]) * size, y = at[1] + glyph.home[1] + (words[start + i * 6 + 1] - glyph.pivot[1]) * size;
      bounds = [Math.min(bounds[0], x), Math.min(bounds[1], y), Math.max(bounds[2], x), Math.max(bounds[3], y)];
    }
  }
  return { left: bounds[0], bottom: bounds[1], right: bounds[2], top: bounds[3], y: (bounds[1] + bounds[3]) / 2 };
}
const still = { slideTime: 9, stepTime: 9, stepIndex: 0, stepOrigins: { 0: 0 } };
const flat = (node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] => React.Children.toArray(node).flatMap(child =>
  React.isValidElement<{ children?: React.ReactNode }>(child) ? [child, ...flat(child.props.children)] : []);
const value = <T extends number | Vec3>(prop: unknown, step = 0) =>
  sampleTrack(compileTrack(prop as Animated<T>), { slideTime: step * 3 + 2, stepTime: 2, stepIndex: step, stepOrigins: Object.fromEntries(Array.from({ length: step + 1 }, (_, i) => [i, i * 3])) });

describe("world text alignment at 1280 wide", () => {
  test("Text3D centers its first line's cap height on its position", () => {
    for (const props of [{ text: "SETTINGS", size: 1.2 }, { text: "42", mono: true, size: .36 }, { text: "Abc", mono: true, size: .29, align: "left" as const },
      { text: "HOOKS", font: display, size: .6, align: "right" as const }]) {
      const box = ink({ ...props, position: [1, 2, 0] });
      near(box.y, 2);
    }
  });
  test("code marks and panels center on their lines", () => {
    const parts = flat(expandScene(<CodePanel id="code" at={[0, 0, 0]} marks={[{ text: "Name", step: 0 }]}>{"const a = 1\nreturn <Name />\n"}</CodePanel>));
    const code = parts.find(p => p.props.id === "code/code")!.props as Text3DOptions, card = parts.find(p => p.props.id === "code/card")!.props;
    const mark = parts.find(p => String(p.props.id).startsWith("code/mark0/1/"))!.props;
    const step = Number(code.lineHeight) * Number(code.size), [, y] = card.position as Vec3;
    const first = ink({ ...code, text: "const a = 1" }), last = ink({ ...code, text: "return <Name />", position: [0, -step, 0] });
    near(value<Vec3>(mark.position)[1], last.y);
    near(y, (first.y + last.y) / 2);
  });
  test("traced lines' glow bands and panel center on their text", () => {
    const parts = flat(expandScene(<CodeTrace id="t" at={[0, 0, 0]} source={0} reads={[2]} nodes={["a", "b"]}>{"const [a] = useState(0)\nfoo()\nreturn a\n"}</CodeTrace>));
    const text = (n: number) => parts.find(p => p.props.id === `t/${n}`)!.props as Text3DOptions;
    const glow = parts.find(p => p.props.id === "t/2/glow")!.props, card = parts.find(p => p.props.id === "t/card")!.props;
    near(value<Vec3>(glow.position)[1], ink({ ...text(2), position: value<Vec3>(text(2).position) }).y);
    near(value<Vec3>(card.position)[1], (ink({ ...text(0), position: value<Vec3>(text(0).position) }).y + ink({ ...text(2), position: value<Vec3>(text(2).position) }).y) / 2);
  });
  test("keys center in their cards and strikes cross their key", () => {
    const parts = flat(expandScene(<Keys id="k" at={[0, 0, 0]} keys={["A", "B"]} next={["B", "C"]} diff={1} remove={1} insert={2} recycle={3} />));
    const label = parts.find(p => p.props.id === "k/copy/A/key0")!.props as Text3DOptions, strike = parts.find(p => p.props.id === "k/copy/A/strike")!.props;
    const stage = value<Vec3>(parts.find(p => p.props.id === "k/copy/A")!.props.position, 1);
    near(ink({ ...label, position: stage }).y, stage[1]);
    near(value<Vec3>(strike.position, 1)[1], ink({ ...label, position: stage }).y);
  });
});
