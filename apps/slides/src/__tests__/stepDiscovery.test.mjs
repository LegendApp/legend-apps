import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../../../packages/presentation/package.json", import.meta.url));
const React = require("react");
const { transformSync } = require("esbuild");
let clones = 0;
const module = { exports: {} };
const code = transformSync(readFileSync(new URL("../steps.tsx", import.meta.url), "utf8"), { loader: "tsx", format: "cjs", jsx: "automatic" }).code;
Function("require", "module", "exports", code)((name) => {
  if (name === "react") return { ...React, cloneElement(...args) { clones++; return React.cloneElement(...args); } };
  if (name === "react/jsx-runtime") return require(name);
  return {};
}, module, module.exports);
const { Step, Steps, countSteps, resolveSteps } = module.exports;
const h = React.createElement;
test("allocation-free discovery matches rendering for nested, explicit, list and function steps", () => {
  const cases = [
    h("div", null, "static"),
    h(Step, null, h(Step, null, "nested")),
    h("div", null, h(Step, { at: 4, until: 7 }), h(Step, { states: { 2: {}, 9: {} } })),
    h(Steps, { count: 8 }, h("ul", null, h("li", null, "one"), h("li", null, h(Step, null, "two")))),
    h(Steps, null, " ", h("div", null, "one"), h(Steps, null, h("div", null, "two"))),
    h(Steps, { count: 4 }, () => { throw new Error("must not evaluate render callback"); }),
  ];
  for (const content of cases) {
    const expected = resolveSteps(content).steps;
    clones = 0;
    assert.equal(countSteps(content), expected);
    assert.equal(clones, 0);
  }
  assert.throws(() => countSteps(h(Steps, { count: 0 }, () => null)), /positive integer/);
});
test("fresh content and changed step counts are discovered without retaining prior trees", () => {
  const first = h("div", null, h(Step, { at: 1 }, "before"));
  const next = h("div", null, h(Step, { at: 3 }, "after"));
  assert.equal(countSteps(first), 2);
  assert.equal(countSteps(next), 4);
  const resolved = resolveSteps(next);
  assert.equal(resolved.content[0].props.children[0].props.children[0], "after");
});
