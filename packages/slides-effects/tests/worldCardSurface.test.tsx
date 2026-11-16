import "../../../apps/slides/src/__tests__/nativeMock";
// @ts-ignore Bun supplies the standalone test API.
import { expect, test } from "bun:test";
import React from "react";
import { CodePanel, Form, Grid, expandScene } from "../packs/world/Authoring";
import { prepareWorldSlides } from "../packs/world/World";
import { advancePlayback, createPlaybackState, transitionPlayback, type PlaybackState } from "../../presentation/src/playbackState";
import { createTrackFrame, retainTrackScene, sampleTrackFrame, trackIds, type TrackFrame } from "../packs/world/track";
import { buildWorldGraph } from "../packs/world/render";
import { cardInstances, prepareWorldScene, sampleWorldUniforms, worldHeaderSize, worldInstanceSize, instanceField } from "../packs/world/scene";

const fence = <pre>{React.createElement("code", { children: "const value = 1;", highlighted: { tokens: [{ content: "const value = 1;", offset: 0, color: "#ffffff" }] } })}</pre>;

test("default code, grid and form surfaces cover scenery without broad exterior glow", () => {
  const children = expandScene(<>
    <CodePanel id="code">{fence}</CodePanel>
    <Grid id="grid" count={4} columns={2} />
    <Form id="form" parent={{ title: "Root" }} panels={[{ title: "Editor", fields: [{ value: "value" }] }]} />
  </>);
  const prepared = prepareWorldSlides([{ children }])[0].scenePlan!.content.prepared;
  const cards = prepared.instances.filter(i => i.card);
  expect(cards.length).toBeGreaterThan(6);
  for (const card of cards) {
    expect(card.card!.fill, card.id).toBe(1);
    expect(card.card!.glow, card.id).toBe(0);
    expect(card.card!.line, card.id).toBeGreaterThan(0);
  }
  expect(new Set(cards.map(i => JSON.stringify(i.card, ["fill", "glow", "line", "edge"]))).size).toBe(1);
  const values = sampleWorldUniforms(prepared, { slideTime: 1, stepTime: 1, stepIndex: 0, stepOrigins: { 0: 0 } });
  for (const card of cards) {
    const at = worldHeaderSize + prepared.instances.indexOf(card) * worldInstanceSize;
    expect(values[at + instanceField.thickness]).toBe(1);
    expect(values[at + instanceField.opacity]).toBe(1);
  }
});

test("generated card output fades premultiplied color and coverage together through departure and reversal", () => {
  const prepared = prepareWorldScene({ instances: cardInstances({ id: "panel" }) });
  const graph = buildWorldGraph(prepared);
  const code = graph.passes.find(p => p.id === "sharp-cards")!.code;
  const expression = code.match(/return CardResult\((vec4f\([^;]+),depth\);/)![1];
  const output = new Function("color", "alpha", "fade", "distanceFade", "pair", "return " + expression.replaceAll("depthFade(world)", "distanceFade").replace("vec4f(", "pair("));
  for (const alpha of [1, .5, .05]) for (const fade of [1, .5, .01, 0, .01, .5, 1]) {
    const [rgb, coverage] = output(.4 * alpha, alpha, fade, fade, (r: number, a: number) => [r, a]);
    expect(rgb).toBeGreaterThanOrEqual(0);
    expect(coverage).toBeCloseTo(alpha * fade);
    expect(rgb + .2 * (1 - coverage)).toBeCloseTo(.4 * alpha * fade + .2 * (1 - alpha * fade));
  }
});

test("exterior fog compensation follows the fogged route and the sheen stays inside coverage", () => {
  const code = buildWorldGraph(prepareWorldScene({ instances: cardInstances({ id: "panel" }) })).passes.find(p => p.id === "sharp-cards")!.code;
  const condition = code.slice(0, code.indexOf("let z=max(dot(at-eye()")).match(/if\(([^\n]+)\) \{[^{]*$/)![1];
  const compensates = new Function("outside", "sharp", "return " + condition.replace("!onFace", "outside").replace("partSharp(base)", "sharp"));
  expect(compensates(true, true)).toBe(false);
  expect(compensates(true, false)).toBe(true);
  expect(compensates(false, false)).toBe(false);
  expect(code).toContain("if(uniforms[base+16u]>0.) { layer=over(layer,accent");
  expect(code).toContain("layer=over(layer,accent,coverage*");
});

test("the generated face gradient lifts resting surfaces while flat semantic colors stay exact", () => {
  const prepared = prepareWorldSlides([{ children: expandScene(<Form id="form" parent={{ title: "Root" }} panels={[{ title: "Editor", fields: [{ value: "value" }] }]} />) }])[0].scenePlan!.content.prepared;
  const code = buildWorldGraph(prepared).passes.find(p => p.id === "sharp-cards")!.code;
  const expression = code.match(/let fill=([^;]+);/)![1]
    .replaceAll("vec3f", "vector").replace(/([.\d]+)\+accent\*([.\d]+)/g, "tint($1,$2)").replace("uniforms[base+31u]>.5", "flat");
  const shade = (accent: number[], h: number, v: number, flat: boolean) => new Function("accent", "h", "v", "flat", "vector", "tint", "mix", "select", "return " + expression)(
    accent, h, v, flat, (...x: number[]) => x, (a: number, b: number) => accent.map(x => a + x * b),
    (a: number[], b: number[], t: number) => a.map((x, i) => x + (b[i] - x) * t), (a: number[], b: number[], pick: boolean) => pick ? b : a);
  const clock = { slideTime: 0, stepTime: 0, stepIndex: 0, stepOrigins: { 0: 0 } };
  const values = sampleWorldUniforms(prepared, clock);
  for (const card of prepared.instances.filter(i => i.card)) {
    const at = worldHeaderSize + prepared.instances.indexOf(card) * worldInstanceSize;
    const accent = Array.from(values.slice(at + instanceField.color, at + instanceField.color + 3)).map(x => x <= .0031308 ? x * 12.92 : 1.055 * x ** (1 / 2.4) - .055);
    const h = Math.max(0, Math.min(1, (values[at + instanceField.emissive] - .03) / .06));
    for (const v of [0, .5, 1]) {
      for (const channel of shade(accent, h, v, false)) { expect(channel).toBeGreaterThan(.1); expect(channel).toBeLessThan(.3); }
      expect(shade(accent, h, v, true)).toEqual(accent);
    }
  }
});

test("expanded surfaces retain their material through departure, reverse and interrupted return", () => {
  const outgoing = prepareWorldSlides([{ children: expandScene(<>
    <CodePanel id="code">{fence}</CodePanel><Grid id="grid" count={4} columns={2} />
    <Form id="form" panels={[{ title: "Editor", fields: [{ value: "value" }] }]} />
  </>) }])[0].scenePlan!.content.prepared;
  const incoming = prepareWorldScene({ instances: cardInstances({ id: "next", position: [0, 0, -55] }) });
  const retained = retainTrackScene(incoming, outgoing), oldIds = trackIds(outgoing), nextIds = trackIds(incoming);
  const sample = (frame: TrackFrame, state: PlaybackState, scene = outgoing, declared = oldIds) => sampleTrackFrame(frame,
    sampleWorldUniforms(scene, state) as number[], trackIds(scene), state, { frame: "world", duration: 1 }, declared);
  let state = createPlaybackState({ phase: "playing", slideKey: "0:first", stepKey: "0:first", stepIndex: 0 });
  state = advancePlayback(advancePlayback(state, 1000), 2000);
  let frame = sample(createTrackFrame(), state);
  const check = () => {
    expect(Array.from(frame.values).every(Number.isFinite)).toBe(true);
    for (const part of outgoing.instances.filter(i => i.card)) {
      const slot = frame.ids.indexOf(`card:${part.id}`);
      expect(slot, part.id).toBeGreaterThanOrEqual(0);
      const at = worldHeaderSize + slot * worldInstanceSize;
      expect(frame.values[at + 16]).toBe(0);
      expect(frame.values[at + instanceField.thickness]).toBe(1);
      expect(frame.values[at + instanceField.opacity]).toBeGreaterThanOrEqual(0);
      expect(frame.values[at + instanceField.opacity]).toBeLessThanOrEqual(1);
      for (let axis = 0; axis < 3; axis++) expect(frame.values[at + instanceField.color + axis]).toBeGreaterThanOrEqual(0);
    }
  };
  check();
  for (const duration of [350, 1000]) {
    state = transitionPlayback(state, { phase: "playing", slideKey: "1:next", stepKey: "0:next", stepIndex: 0 });
    const start = state.lastTimestamp!;
    for (const dt of [0, duration / 2, duration]) { state = advancePlayback(state, start + dt); frame = sample(frame, state, retained, nextIds); check(); }
    if (duration === 1000) for (const part of outgoing.instances.filter(i => i.card)) {
      const at = worldHeaderSize + frame.ids.indexOf(`card:${part.id}`) * worldInstanceSize;
      expect(frame.values[at + instanceField.opacity]).toBe(0);
    }
    state = transitionPlayback(state, { phase: "playing", slideKey: "0:back", stepKey: "0:back", stepIndex: 0 });
    const back = retainTrackScene(outgoing, retained, incoming, false, frame.visible), reverse = state.lastTimestamp!;
    for (const dt of [0, 150, duration]) { state = advancePlayback(state, reverse + dt); frame = sample(frame, state, back); check(); }
  }
});
