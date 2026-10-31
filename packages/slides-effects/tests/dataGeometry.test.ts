import { expect, test } from "bun:test";
import { compactNumber, createAxis, formatNumber, layoutTree, niceMaximum, renderCounts } from "../packs/charts/DataGeometry";

test("numbers group thousands and keep fixed decimals", () => {
  expect(formatNumber(20160)).toBe("20,160");
  expect(formatNumber(1234567.891, { decimals: 2, suffix: " ms" })).toBe("1,234,567.89 ms");
  expect(formatNumber(-40, { prefix: "$" })).toBe("-$40");
  expect(formatNumber(-0.004)).toBe("0");
  expect(compactNumber(48000)).toBe("48k");
  expect(compactNumber(1e6)).toBe("1M");
});

const nodes = ["root", "a", "b", "a1", "a2", "b1"].map(id => ({ id }));
const edges = [["root", "a"], ["root", "b"], ["a", "a1"], ["a", "a2"], ["b", "b1"]] as const;

test("tree layout centers parents over their leaves", () => {
  const { nodes: placed, columns, depth } = layoutTree(nodes, edges);
  const x = Object.fromEntries(placed.map(node => [node.id, node.x]));
  expect([columns, depth]).toEqual([3, 3]);
  expect(x).toEqual({ root: 1.25, a: 0.5, b: 2, a1: 0, a2: 1, b1: 2 });
  expect(() => layoutTree(nodes, [...edges, ["b", "a1"]])).toThrow("two parents");
  expect(() => layoutTree([{ id: "x" }, { id: "y" }], [["x", "y"], ["y", "x"]])).toThrow("no root");
});

test("render counts accumulate per node across all, subtree and single-node steps", () => {
  const { nodes: placed } = layoutTree(nodes, edges);
  const flashes = [undefined, "all", { subtree: "a" }, ["b1"]] as const;
  expect(renderCounts(flashes, 0, placed).total).toBe(0);
  const second = renderCounts(flashes, 2, placed);
  expect([...second.current].sort()).toEqual(["a", "a1", "a2"]);
  expect(second.counts).toEqual({ root: 1, a: 2, b: 1, a1: 2, a2: 2, b1: 1 });
  const last = renderCounts(flashes, 3, placed);
  expect([last.total, [...last.current]]).toEqual([10, ["b1"]]);
  expect(renderCounts(flashes, 9, placed).current.size).toBe(0);
});

test("axes map extreme ranges into readable positions", () => {
  expect(niceMaximum(48000)).toBe(50000);
  expect(niceMaximum(3)).toBe(5);
  const log = createAxis("log", 100000, 1);
  expect(log.ticks).toEqual([1, 10, 100, 1000, 10000, 100000]);
  expect(log.position(1000)).toBeCloseTo(0.6);
  expect(log.position(0)).toBe(0);
  const broken = createAxis({ break: [200, 9000] }, 10000);
  expect(broken.gap).toEqual([0.47, 0.53]);
  expect(broken.position(100)).toBeCloseTo(0.235);
  expect(broken.position(9000)).toBeCloseTo(0.53);
  expect(broken.position(10000)).toBeCloseTo(1);
  expect(() => createAxis({ break: [9000, 200] }, 10000)).toThrow();
});
