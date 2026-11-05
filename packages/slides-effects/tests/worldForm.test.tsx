import "../../../apps/slides/src/__tests__/nativeMock";
// @ts-ignore Bun supplies the standalone test API.
import { expect, test } from "bun:test";
import React from "react";
import { Form, expandScene } from "../packs/world/Authoring";
import { prepareWorldSlides } from "../packs/world/World";
import { instanceOpacity } from "../packs/world/scene";

test("form typing starts empty, mirrors every prefix and counts only bound field renders", () => {
  const text = "Ada Lovelace", delay = .6, interval = .2;
  const children = expandScene(<Form id="form" typing={{ step: 1, bind: "name", text, delay, interval, repeat: "infinite" }} panels={[
    { title: "Form", fields: [{ value: "", bind: "name" }, { value: "email" }] },
    { title: "Profile", fields: [{ value: "", bind: "name", big: true }, { value: "email" }] },
  ]} />);
  const scene = prepareWorldSlides([{ children }])[0].scenePlan!.content.prepared;
  const period = delay + (text.length - 1) * interval + 1.5;
  const check = (time: number, count: number, stepIndex = 1) => {
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
      for (const prefix of [`form/${panel}/badge/`, `form/${panel}/1/`]) {
        for (const part of scene.instances.filter(part => part.id?.startsWith(prefix))) expect(instanceOpacity(part, clock)).toBe(1);
      }
    }
  };
  check(20, 0, 0);
  check(delay - .01, 0);
  for (const cycle of [0, 1000]) {
    for (let count = 1; count <= text.length; count++) check(cycle * period + delay + (count - 1) * interval + .01, count);
    check((cycle + 1) * period - .05, 0);
  }
  check(0, 0);
});
