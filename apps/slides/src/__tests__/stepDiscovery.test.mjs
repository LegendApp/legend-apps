import assert from "node:assert/strict";
import { test } from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(new URL("../../../../packages/presentation/package.json", import.meta.url));
const React = require("react");
const { transformSync } = require("esbuild");
let clones = 0, traversals = 0;
const module = { exports: {} };
const code = transformSync(readFileSync(new URL("../steps.tsx", import.meta.url), "utf8"), { loader: "tsx", format: "cjs", jsx: "automatic" }).code;
Function("require", "module", "exports", code)((name) => {
  if (name === "react") return { ...React, Children: { ...React.Children, forEach(...args) { traversals++; return React.Children.forEach(...args); } }, cloneElement(...args) { clones++; return React.cloneElement(...args); } };
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

test("static array trees are counted without React child-key traversal", () => {
  const tree = h(React.Fragment, null, Array.from({ length: 200 }, (_, i) => h("group", { key: i },
    Array.from({ length: 20 }, (_, k) => h("part", { key: k }, "static")))));
  traversals = 0;
  assert.equal(countSteps(tree), 1);
  assert.equal(traversals, 0);
});
test("discovery preserves iterator, nested array and empty child semantics", () => {
  const tree = [null, false, "", 12, [h(Step, { at: 2 })], new Set([h(Step, { at: 4 }), h(Step, { until: 7 })])];
  assert.equal(countSteps(tree), resolveSteps(tree).steps);
  assert.throws(() => countSteps({ invalid: true }), /Objects are not valid/);
});
