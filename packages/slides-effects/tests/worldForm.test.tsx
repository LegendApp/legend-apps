import "../../../apps/slides/src/__tests__/nativeMock";
// @ts-ignore Bun supplies the standalone test API.
import { expect, test } from "bun:test";
import React from "react";
import { Form, expandScene } from "../packs/world/Authoring";
import { prepareWorldSlides } from "../packs/world/World";
import { instanceOpacity } from "../packs/world/scene";

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
    for (const panel of [0, 1]) {
      const field = `form/${panel}/0`;
      const glyphs = visible(`${field}/v`);
      expect(glyphs).toHaveLength(text.slice(0, count).replaceAll(" ", "").length);
      expect(glyphs.every(part => part.id!.startsWith(`${field}/v${count}:`))).toBe(true);
      const badge = visible(`${field}/badge/n`);
      expect(badge).toHaveLength(String(count + 1).length);
      expect(badge.every(part => part.id!.startsWith(`${field}/badge/n${count}:`))).toBe(true);
      const panelBadge = visible(`form/${panel}/badge/n`);
      const n = ancestors ? count : 0;
      expect(panelBadge).toHaveLength(String(n + 1).length);
      expect(panelBadge.every(part => part.id!.startsWith(`form/${panel}/badge/n${n}:`))).toBe(true);
      for (const part of scene.instances.filter(part => part.id?.startsWith(`form/${panel}/1/`))) expect(instanceOpacity(part, clock)).toBe(1);
    }
    if (ancestors) {
      const badge = visible("form/parent/badge/n");
      expect(badge).toHaveLength(String(count + 1).length);
      expect(badge.every(part => part.id!.startsWith(`form/parent/badge/n${count}:`))).toBe(true);
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
