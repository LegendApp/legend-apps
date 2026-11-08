import "../../../apps/slides/src/__tests__/nativeMock";
// @ts-ignore Bun supplies the standalone test API.
import { expect, test } from "bun:test";
import React from "react";
import { Form, expandScene } from "../packs/world/Authoring";
import { prepareWorldSlides } from "../packs/world/World";
import { instanceOpacity, instancePosition, sampleTrack } from "../packs/world/scene";

for (const ancestors of [false, true]) test(`form typing mirrors prefixes with ancestor counters ${ancestors ? "enabled" : "disabled"}`, () => {
  const text = "Ada Lovelace", delay = .6, interval = .2;
  const step = ancestors ? 0 : 1;
  const children = expandScene(<Form id="form" parent={ancestors ? { title: "Root", renders: true } : undefined} typing={{ step, bind: "name", text, delay, interval, repeat: "infinite" }} panels={[
    { title: "Form", renders: ancestors, fields: [{ value: "", bind: "name" }, { value: "email" }] },
    { title: "Profile", renders: ancestors, fields: [{ value: "", bind: "name", big: true }, { value: "email" }] },
  ]} />);
  const scene = prepareWorldSlides([{ children }])[0].scenePlan!.content.prepared;
  expect(scene.instances.some(part => part.id?.startsWith("form/parent/title"))).toBe(ancestors);
  if (ancestors) for (const panel of [0, 1]) expect(scene.instances.some(part => part.id?.startsWith(`form/parent/link/${panel}`))).toBe(true);
  const period = delay + (text.length - 1) * interval + 1.5;
  const check = (time: number, count: number, stepIndex = step) => {
    const clock = { slideTime: time, stepTime: time, stepIndex, stepOrigins: { [stepIndex]: 0 } };
    const visible = (prefix: string) => scene.instances.filter(part => part.id?.startsWith(prefix) && instanceOpacity(part, clock) > .5);
    const countAt = (offset: number) => time % period >= period - .1 ? 0 : Math.max(0, Math.min(text.length, Math.floor((time % period - delay - offset) / interval) + 1));
    const propagated = ancestors ? countAt(.72) : count;
    for (const panel of [0, 1]) {
      const fieldCount = panel === 0 ? count : propagated;
      const field = `form/${panel}/0`;
      const glyphs = visible(`${field}/v`);
      expect(glyphs).toHaveLength(text.slice(0, fieldCount).replaceAll(" ", "").length);
      expect(glyphs.every(part => part.id!.startsWith(`${field}/v${fieldCount}:`))).toBe(true);
      const badge = visible(`${field}/badge/n`);
      expect(badge).toHaveLength(String(propagated + 1).length);
      expect(badge.every(part => part.id!.startsWith(`${field}/badge/n${propagated}:`))).toBe(true);
      const panelBadge = visible(`form/${panel}/badge/n`);
      const n = ancestors ? propagated : 0;
      expect(panelBadge).toHaveLength(String(n + 1).length);
      expect(panelBadge.every(part => part.id!.startsWith(`form/${panel}/badge/n${n}:`))).toBe(true);
      for (const part of scene.instances.filter(part => part.id?.startsWith(`form/${panel}/1/`))) expect(instanceOpacity(part, clock)).toBe(1);
    }
    if (ancestors) {
      const n = countAt(.36);
      const badge = visible("form/parent/badge/n");
      expect(badge).toHaveLength(String(n + 1).length);
      expect(badge.every(part => part.id!.startsWith(`form/parent/badge/n${n}:`))).toBe(true);
    }
  };
  if (!ancestors) check(20, 0, 0);
  check(delay - .01, 0);
  for (const cycle of [0, 1000]) {
    for (let count = 1; count <= text.length; count++) check(cycle * period + delay + (count - 1) * interval + .01, count);
    check((cycle + 1) * period - .05, 0);
  }
  check(0, 0);
});

test("form panel badges sit in the header row, clear of the field rows", () => {
  const flat = (node: React.ReactNode): React.ReactElement<Record<string, unknown>>[] => React.Children.toArray(node).flatMap(child =>
    React.isValidElement<{ children?: React.ReactNode }>(child) ? [child, ...flat(child.props.children)] : []);
  const nodes = flat(expandScene(<Form id="form" panels={[{ title: "Form", renders: true, fields: [{ value: "a" }] }]} />));
  const at = (id: string) => nodes.find(node => node.props.id === id)!.props.position as number[];
  const badge = at("form/0/badge"), title = at("form/0/title"), field = at("form/0/0"), fieldBadge = at("form/0/0/badge");
  expect(badge[1]).toBe(title[1]);
  expect(badge[0]).toBe(fieldBadge[0]);
  expect(badge[1] - .33).toBeGreaterThan(field[1] + .5);
});

const pulseForm = (out?: number) => expandScene(<Form id="form" sequence={out === undefined ? undefined : { out, duration: .01 }} parent={{ title: "App", renders: true }} typing={{ step: 1, bind: "name", text: "AB", delay: .6, interval: 1.3, repeat: "infinite" }} panels={[
  { title: "Form", renders: true, fields: [{ value: "", bind: "name" }] },
  { title: "Profile", renders: true, fields: [{ value: "", bind: "name", big: true }] },
]} />);
const pulseScene = () => prepareWorldSlides([{ children: pulseForm() }])[0].scenePlan!.content.prepared;
const clock = (time: number, stepIndex = 1) => ({ slideTime: time, stepTime: time, stepIndex, stepOrigins: { [stepIndex]: 0 } });

test("caret follows the focused input's text end, including repeat and reverse", () => {
  const s = pulseScene(), carets = s.instances.filter(i => i.id?.includes("/caret"));
  expect(carets).toHaveLength(1);
  const caret = carets[0], base = instancePosition(caret, clock(0))[0];
  expect(sampleTrack(caret.scale, clock(0, 0))).toEqual([0, 0, 0]);
  expect(sampleTrack(caret.scale, clock(.7))[0]).toBeGreaterThan(0);
  for (const cycle of [0, 10]) for (const [time, count] of [[.5, 0], [.61, 1], [1.91, 2]] as const)
    expect(instancePosition(caret, clock(cycle * 3.4 + time))[0] - base).toBeCloseTo(count * .26 * 100 / 72 * .6, 4);
  expect(instancePosition(caret, clock(0))[0]).toBe(base);
});

test("each key travels upward into parent, then down both links and flashes on arrival", () => {
  const s = pulseScene(), up = s.instances.find(i => i.id === "form/input/up:pulse:0:0")!;
  expect(up).toBeDefined();
  const down = [0, 1].map(p => s.instances.find(i => i.id === `form/parent/link/${p}:pulse:0:0`)!);
  const midUp = clock(.78), midDown = clock(1.14);
  expect(instanceOpacity(up, midUp)).toBe(1);
  expect(instancePosition(up, clock(.88))[1]).toBeGreaterThan(instancePosition(up, clock(.68))[1]);
  for (const pulse of down) {
    expect(instanceOpacity(pulse, midUp)).toBe(0);
    expect(instanceOpacity(pulse, midDown)).toBe(1);
    expect(instancePosition(pulse, clock(1.24))[1]).toBeLessThan(instancePosition(pulse, clock(1.04))[1]);
  }
  const parent = s.instances.find(i => i.id === "form/parent/card")!;
  const boxes = [0, 1].map(p => s.instances.find(i => i.id === `form/${p}/card`)!);
  for (const time of [.6, 1.9]) {
    expect(sampleTrack(parent.emissive, clock(time + .42))).toBeGreaterThan(3);
    for (const box of boxes) {
      expect(sampleTrack(box.emissive, clock(time + .5))).toBeCloseTo(.6);
      expect(sampleTrack(box.emissive, clock(time + .78))).toBeGreaterThan(3);
      expect(sampleTrack(box.emissive, clock(time + 1.15))).toBeCloseTo(.6);
    }
  }
  // The full travel and flash envelope must settle before the next character.
  let last = 0;
  for (let dt = 0; dt < 1.3; dt += .01) {
    const c = clock(.6 + dt);
    if ([up, ...down].some(i => instanceOpacity(i, c) > 0) || [parent, ...boxes].some(i => sampleTrack(i.emissive, c) > .61)) last = dt;
  }
  expect(last).toBeLessThan(1.2);
  for (const pulse of [up, ...down]) expect(instanceOpacity(pulse, clock(1.85))).toBe(0);
});

test("form caret leaves with its form and resets on re-entry; no idle form pulse", () => {
  const s = prepareWorldSlides([{ children: pulseForm(2) }])[0].scenePlan!.content.prepared;
  const caret = s.instances.find(i => i.id?.endsWith("/caret"))!;
  const start = instancePosition(caret, clock(0));
  const leaving = { ...clock(.02, 2), stepOrigins: { 1: -.8, 2: 0 } };
  expect(instancePosition(caret, leaving)[0]).toBeLessThan(start[0] - 10);
  expect(instancePosition(caret, clock(0))).toEqual(start);
  expect(instancePosition(caret, { ...clock(0, 2), stepOrigins: { 1: -.8, 2: 0 } })[0]).toBeCloseTo(start[0] + .26 * 100 / 72 * .6);
  const idle = prepareWorldSlides([{ children: expandScene(<Form id="idle" parent={{ title: "App", renders: true }} panels={[{ title: "Form", fields: [{ value: "a" }] }]} />) }])[0].scenePlan!.content.prepared;
  expect(idle.instances.some(i => i.id?.includes("/caret") || i.route?.pulse || i.id?.includes("/input/up"))).toBe(false);
});

test("form text and counters commit at their pulse phase, including interruption and re-entry", () => {
  const s = pulseScene();
  const check = (c: ReturnType<typeof clock>, local: number, parent: number, child: number) => {
    const version = (prefix: string, n: number, digits = false) => {
      const visible = s.instances.filter(i => i.id?.startsWith(prefix) && instanceOpacity(i, c) > .5);
      expect(visible).toHaveLength(digits ? String(n + 1).length : n);
      expect(visible.every(i => i.id!.startsWith(`${prefix}${n}:`))).toBe(true);
    };
    version("form/0/0/v", local);
    version("form/1/0/v", child);
    version("form/parent/badge/n", parent, true);
    for (const p of [0, 1]) {
      version(`form/${p}/badge/n`, child, true);
      version(`form/${p}/0/badge/n`, child, true);
    }
  };
  for (const cycle of [0, 10]) for (const [keyTime, n] of [[.6, 1], [1.9, 2]]) {
    const t = cycle * 3.4 + keyTime;
    check(clock(t - .001), n - 1, n - 1, n - 1);
    check(clock(t + .001), n, n - 1, n - 1);
    check(clock(t + .359), n, n - 1, n - 1);
    check(clock(t + .361), n, n, n - 1);
    check(clock(t + .719), n, n, n - 1);
    check(clock(t + .721), n, n, n);
    const at = (id: string, time: number) => sampleTrack(s.instances.find(i => i.id === id)!.emissive, clock(time));
    for (const [id, offset, rest] of [["form/parent/badge/disc", .36, .9], ...[0, 1].flatMap(p => [
      [`form/${p}/badge/disc`, .72, .9], [`form/${p}/0/badge/disc`, .72, .9], [`form/${p}/0`, .72, .8],
    ])] as [string, number, number][]) {
      expect(at(id, t + offset - .001)).toBeCloseTo(rest);
      expect(at(id, t + offset + .06)).toBeCloseTo(7);
    }
  }
  // Advancing away preserves the interrupted step's phase; its clock must not restart.
  check({ ...clock(.02, 2), stepOrigins: { 1: -.8, 2: 0 } }, 1, 0, 0);
  check({ ...clock(.02, 2), stepOrigins: { 1: -1.1, 2: 0 } }, 1, 1, 0);
  // Reversing before the typing step and then re-entering discards pending propagation.
  check(clock(20, 0), 0, 0, 0);
  check(clock(0), 0, 0, 0);
  check(clock(.601), 1, 0, 0);
  check(clock(3.35), 0, 0, 0);
});

test("form card decoration can be disabled without changing fills or typing propagation", () => {
  const children = expandScene(<Form id="form" card={{ glow: 0, edge: 0 }} parent={{ title: "Root" }}
    sequence={{ in: 1, out: 2, duration: .2 }}
    typing={{ step: 1, bind: "name", text: "AB", delay: .6, interval: 1.3, repeat: "infinite" }} panels={[
      { title: "Editor", fields: [{ value: "", bind: "name" }] },
      { title: "Preview", fields: [{ value: "", bind: "name" }] },
    ]} />);
  const s = prepareWorldSlides([{ children }])[0].scenePlan!.content.prepared;
  const cards = s.instances.filter(i => i.card);
  expect(cards).toHaveLength(10);
  for (const card of cards) {
    expect(card.card!.glow).toBe(0);
    expect(card.card!.edge).toBe(0);
    expect(card.card!.fill).toBe(card.id!.endsWith("/card") ? .9 : 1);
  }
  const parent = s.instances.find(i => i.id === "form/parent/card")!;
  const parentBadge = s.instances.find(i => i.id === "form/parent/badge/disc")!;
  for (const p of [0, 1]) expect(s.instances.some(i => i.id?.startsWith(`form/parent/link/${p}`))).toBe(true);
  expect(s.instances.some(i => i.route?.pulse)).toBe(false);
  for (const time of [.5, .66, 1.05, 1.96, 3.35, 4.06]) {
    expect(sampleTrack(parent.emissive, clock(time))).toBe(.6);
    expect(instanceOpacity(parent, clock(time))).toBe(1);
    expect(sampleTrack(parentBadge.emissive, clock(time))).toBe(.9);
  }
  for (const p of [0, 1]) {
    const field = s.instances.find(i => i.id === `form/${p}/0`)!;
    expect(sampleTrack(field.emissive, clock(.66))).toBeCloseTo(7);
    const visible = s.instances.filter(i => i.id?.startsWith(`form/${p}/0/v1:`) && instanceOpacity(i, clock(.66)) > .5);
    expect(visible).toHaveLength(1);
  }
  const middle = instancePosition(parent, clock(.5));
  const exiting = { ...clock(.1, 2), stepOrigins: { 1: -1, 2: 0 } };
  expect(instancePosition(parent, exiting)[0]).toBeLessThan(middle[0]);
  expect(instanceOpacity(parent, exiting)).toBe(1);
  expect(instancePosition(parent, clock(0, 0))[0]).toBeGreaterThan(middle[0]);
  expect(instancePosition(parent, clock(.5))[0]).toBeCloseTo(middle[0]);
});
