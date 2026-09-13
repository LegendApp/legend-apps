import { readFileSync } from "node:fs";
import path from "node:path";
import { observable, ObservableHint } from "@legendapp/state";
import { useValue } from "@legendapp/state/react";
import { act, render } from "@testing-library/react-native";
import React from "react";
import { Text } from "react-native";
import { createDiffInlineMergeItemIndexAllocator } from "../diffInlineMergeModel";

// Compile the actual row boundary in isolation so native window setup is unnecessary.
function loadCompiledRow(onRender: (file: string) => void) {
  const { transformSync } = require("@babel/core");
  const filename = path.resolve(__dirname, "../../DiffViewerWindow.tsx");
  const { code: isolated } = transformSync(readFileSync(filename, "utf8"), {
    filename, babelrc: false, configFile: false,
    parserOpts: { plugins: ["typescript", "jsx"] },
    plugins: [() => ({ visitor: { Program(program: { node: { body: Array<{ type: string; id?: { name: string } }> } }) {
      program.node.body = program.node.body.filter((node) => node.type === "FunctionDeclaration" && node.id?.name === "DiffMergeObservableLineRow");
    } } })],
  });
  const { code } = transformSync(isolated, {
    filename, babelrc: false, configFile: false,
    presets: [require.resolve("@react-native/babel-preset")],
    plugins: [[require.resolve("babel-plugin-react-compiler"), { panicThreshold: "all_errors", target: "19" }]],
  });
  return new Function("require", "exports", "useValue", "DiffMergeLineRow", "DiffMergePlaceholderRow", code + "\nreturn DiffMergeObservableLineRow;")(
    require, {}, useValue,
    ({ file, row }: { file: { path: string }; row: { leftText: string } }) => {
      onRender(file.path);
      return <Text>{row.leftText}</Text>;
    },
    () => <Text>missing</Text>,
  ) as React.ComponentType<Record<string, unknown>>;
}

it("compiled merge rows observe file replacements and removals without updating other files", async () => {
  const counts: Record<string, number> = {};
  const Row = loadCompiledRow((file) => { counts[file] = (counts[file] ?? 0) + 1; });
  const model = (filePath: string, text: string) => ObservableHint.opaque({
    file: { path: filePath },
    horizontalConfigId: "layout",
    controlRowByBlockKey: new Map(),
    model: { rows: [{ leftText: text }] },
  });
  const mergeFileRenderByPath$ = observable({ "a.ts": model("a.ts", "first"), "b.ts": model("b.ts", "other") });
  const allocator = createDiffInlineMergeItemIndexAllocator();
  const firstIndex = allocator.getItemIndex("a.ts", 0);
  const secondIndex = allocator.getItemIndex("b.ts", 0);
  let ownerRenders = 0;
  function Owner() {
    ownerRenders++;
    return <>
      <Row itemIndex={firstIndex} mergeFileRenderByPath$={mergeFileRenderByPath$} mergeItemIndexAllocator={allocator} />
      <Row itemIndex={secondIndex} mergeFileRenderByPath$={mergeFileRenderByPath$} mergeItemIndexAllocator={allocator} />
    </>;
  }
  const screen = await render(<Owner />);
  const initial = { ...counts };
  await act(() => mergeFileRenderByPath$["a.ts"].set(model("a.ts", "edited")));
  expect(screen.getByText("edited")).toBeTruthy();
  expect(counts["a.ts"]).toBe(initial["a.ts"] + 1);
  expect(counts["b.ts"]).toBe(initial["b.ts"]);
  expect(ownerRenders).toBe(1);
  await act(() => mergeFileRenderByPath$["a.ts"].delete());
  expect(screen.getByText("missing")).toBeTruthy();
  expect(screen.getByText("other")).toBeTruthy();
  expect(counts["b.ts"]).toBe(initial["b.ts"]);
  await screen.unmount();
});
