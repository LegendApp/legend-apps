// @ts-nocheck Native surfaces are represented by their submitted generation.
import "./nativeMock";
import { expect, spyOn, test } from "bun:test";
import React, { useEffect } from "react";
import { act, create } from "react-test-renderer";
import { RetainedSurface, useSurfaceSuspension } from "../../../../packages/presentation/src/RetainedSurface";
import { usePreparationTask } from "../../../../packages/presentation/src/PreparationBoundary";

test("a drawn generation freezes until its replacement is ready; interrupted preparation is discarded", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const log = spyOn(console, "error").mockImplementation(() => {});
  const mounts = [], unmounts = [];
  function Surface({ name, waiting }) {
    usePreparationTask(waiting);
    const suspension = useSurfaceSuspension();
    useEffect(() => { mounts.push(name); return () => unmounts.push(name); }, []);
    return <surface name={name} suspended={suspension?.suspended} signal={suspension?.signal} />;
  }
  const render = (name, waiting = false) => <RetainedSurface identity={name}><Surface name={name} waiting={waiting} /></RetainedSurface>;
  let tree;
  const surfaces = () => tree.root.findAllByType("surface").map(v => [v.props.name, v.props.suspended]);
  try {
    await act(() => { tree = create(render("a")); });
    expect(surfaces()).toEqual([["a", false]]);
    await act(() => tree.update(render("b", true)));
    expect(surfaces()).toEqual([["a", true], ["b", false]]);
    expect(unmounts).toEqual([]);
    expect(tree.root.findAllByType("surface").map(node => node.props.signal.get())).toEqual([true, false]);
    await act(() => tree.update(render("c", true)));
    expect(surfaces()).toEqual([["a", true], ["c", false]]);
    expect(unmounts).toEqual(["b"]);
    await act(() => tree.update(render("c")));
    expect(surfaces()).toEqual([["c", false]]);
    expect(unmounts).toEqual(["b", "a"]);
    expect(mounts).toEqual(["a", "b", "c"]);
  } finally { await act(() => tree?.unmount()); log.mockRestore(); }
});

test("reversing to the retained generation reuses its surface", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const log = spyOn(console, "error").mockImplementation(() => {});
  let mounts = 0, tree;
  function Surface({ waiting }) {
    usePreparationTask(waiting);
    useEffect(() => { mounts++; }, []);
    return <surface suspended={useSurfaceSuspension()?.suspended} />;
  }
  const render = (id, waiting = false) => <RetainedSurface identity={id}><Surface waiting={waiting} /></RetainedSurface>;
  try {
    await act(() => { tree = create(render("a")); });
    await act(() => tree.update(render("b", true)));
    await act(() => tree.update(render("a")));
    expect(tree.root.findAllByType("surface")).toHaveLength(1);
    expect(tree.root.findByType("surface").props.suspended).toBe(false);
    expect(mounts).toBe(2);
  } finally { await act(() => tree?.unmount()); log.mockRestore(); }
});
