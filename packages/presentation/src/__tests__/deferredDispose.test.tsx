// @ts-nocheck Exercises the hook through real StrictMode effect replays.
import { expect, mock, test } from "bun:test";
import { StrictMode } from "react";
import { act, create } from "react-test-renderer";
import { useDeferredDispose } from "../useDeferredDispose";

test("deferred disposal survives StrictMode replays and frees replaced resources after two frames", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const frames = new Map();
  let id = 0;
  globalThis.requestAnimationFrame = callback => { frames.set(++id, callback); return id; };
  globalThis.cancelAnimationFrame = key => frames.delete(key);
  const flush = () => { const pending = [...frames.values()]; frames.clear(); pending.forEach(callback => callback()); };
  const Owner = ({ resource }) => { useDeferredDispose(resource); return null; };
  const first = { dispose: mock() }, second = { dispose: mock() };
  let renderer;
  await act(() => { renderer = create(<StrictMode><Owner resource={first} /></StrictMode>); });
  flush(); flush();
  expect(first.dispose).not.toHaveBeenCalled();
  await act(() => renderer.update(<StrictMode><Owner resource={second} /></StrictMode>));
  flush();
  expect(first.dispose).not.toHaveBeenCalled();
  flush();
  expect(first.dispose).toHaveBeenCalledTimes(1);
  await act(() => renderer.unmount());
  flush(); flush();
  expect(second.dispose).toHaveBeenCalledTimes(1);
});
