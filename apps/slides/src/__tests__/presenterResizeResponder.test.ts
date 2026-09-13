// @ts-nocheck This suite uses Bun test globals and a Babel native-module harness.
import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { transformSync } from "@babel/core";
import type { PanResponderCallbacks } from "react-native";
import type { createPresenterResizeResponder } from "../presenterResizeResponder";

function loadResponder() {
  const filename = fileURLToPath(new URL("../presenterResizeResponder.ts", import.meta.url));
  const require = createRequire(filename);
  let handlers!: PanResponderCallbacks;
  const panHandlers = {};
  const { code } = transformSync(readFileSync(filename, "utf8"), {
    filename, babelrc: false, configFile: false,
    presets: [require.resolve("@react-native/babel-preset")],
  })!;
  const module = { exports: {} as { createPresenterResizeResponder: typeof createPresenterResizeResponder } };
  new Function("require", "module", "exports", code!)(
    (name: string) => name === "react-native"
      ? { PanResponder: { create(callbacks: PanResponderCallbacks) { handlers = callbacks; return { panHandlers }; } } }
      : require(name),
    module, module.exports,
  );
  return {
    create: module.exports.createPresenterResizeResponder,
    grant: () => handlers.onPanResponderGrant!({} as never, {} as never),
    move: (dx: number, dy = 0) => handlers.onPanResponderMove!({} as never, { dx, dy } as never),
    release: () => handlers.onPanResponderRelease!({} as never, {} as never),
    terminate: () => handlers.onPanResponderTerminate!({} as never, {} as never),
  };
}

test("resize gestures keep incremental deltas and use updated callbacks without replacing native handlers", () => {
  const native = loadResponder();
  const firstDeltas: number[] = [];
  const nextDeltas: number[] = [];
  let firstEnds = 0;
  let nextEnds = 0;
  const responder = native.create({
    direction: "horizontal",
    onResize: (delta) => firstDeltas.push(delta),
    onResizeEnd: () => { firstEnds++; },
  });
  const handlers = responder.panHandlers;
  native.grant();
  native.move(10);
  native.move(10);
  native.move(16);
  expect(firstDeltas).toEqual([10, 6]);
  responder.updateCallbacks({
    direction: "horizontal",
    onResize: (delta) => nextDeltas.push(delta),
    onResizeEnd: () => { nextEnds++; },
  });
  expect(responder.panHandlers).toBe(handlers);
  native.move(21);
  native.release();
  expect(nextDeltas).toEqual([5]);
  expect(firstEnds).toBe(0);
  expect(nextEnds).toBe(1);
  native.grant();
  native.move(-3);
  native.terminate();
  native.grant();
  native.move(4);
  expect(nextDeltas).toEqual([5, -3, 4]);
  expect(nextEnds).toBe(2);
});

test("a changed resize direction uses the new axis and clears the old axis delta", () => {
  const native = loadResponder();
  const deltas: number[] = [];
  const callbacks = { onResize: (delta: number) => deltas.push(delta), onResizeEnd() {} };
  const responder = native.create({ ...callbacks, direction: "horizontal" });
  native.grant();
  native.move(30, 2);
  responder.updateCallbacks({ ...callbacks, direction: "vertical" });
  native.move(30, 8);
  native.move(40, 11);
  expect(deltas).toEqual([30, 8, 3]);
});
