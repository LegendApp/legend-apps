// @ts-nocheck Exercise compiler output with controlled drag state and native views.
import { expect, spyOn, test } from "bun:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { transformSync } from "@babel/core";
import React from "react";
import { observable } from "@legendapp/state";
import * as stateReact from "@legendapp/state/react";
import { act, create } from "react-test-renderer";

test("moving a drag rerenders only the previous and next drop zones", async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const filename = fileURLToPath(new URL("../DroppableZone.tsx", import.meta.url));
    const require = createRequire(filename);
    const { code } = transformSync(readFileSync(filename, "utf8"), {
        filename, babelrc: false, configFile: false,
        presets: [require.resolve("@react-native/babel-preset")],
        plugins: [[require.resolve("babel-plugin-react-compiler"), { panicThreshold: "all_errors", target: "19" }]],
    });
    expect(code).toContain("react/compiler-runtime");
    let renders = 0, measurements = 0;
    const registrations = new Set();
    const model = {
        draggedItem$: observable({ id: "track", data: {}, sourceZoneId: "queue" }),
        activeDropZone$: observable("z0"),
        registerDropZone: (id) => registrations.add(id),
        unregisterDropZone: (id) => registrations.delete(id),
        updateDropZoneRect: () => { measurements++; },
    };
    const module = { exports: {} };
    new Function("require", "module", "exports", code)((name) => ({
        "@legendapp/state/react": stateReact,
        "react-native": { View: "view" },
        "@legend-apps/classnames": { cn: (...parts) => parts.filter(Boolean).join(" ") },
        "./DragDropContext": { useDragDrop: () => { renders++; return model; } },
    }[name] ?? require(name)), module, module.exports);
    const { DroppableZone } = module.exports;
    const originalFrame = globalThis.requestAnimationFrame;
    const originalCancel = globalThis.cancelAnimationFrame;
    const frames = [];
    globalThis.requestAnimationFrame = (callback) => { frames.push(callback); return frames.length; };
    globalThis.cancelAnimationFrame = () => {};
    const log = spyOn(console, "error").mockImplementation(() => {});
    let tree;
    try {
        await act(() => { tree = create(<>{Array.from({ length: 20 }, (_, i) => (
            <DroppableZone key={i} id={`z${i}`} allowDrop={() => true} onDrop={() => {}}>
                {(active) => <indicator id={`z${i}`} active={active} />}
            </DroppableZone>
        ))}</>, { createNodeMock: () => ({ measureInWindow: (callback) => callback(0, 0, 100, 50) }) }); });
        expect(registrations.size).toBe(20);
        await act(() => { frames.splice(0).forEach((callback) => callback()); });
        expect(measurements).toBe(20);
        renders = 0;
        for (let i = 1; i <= 5; i++) {
            await act(() => model.activeDropZone$.set(`z${i}`));
            expect(tree.root.findAllByType("indicator").filter((node) => node.props.active).map((node) => node.props.id)).toEqual([`z${i}`]);
        }
        expect(renders).toBe(10);
        expect(measurements).toBe(20);
        await act(() => model.draggedItem$.set(null));
        expect(tree.root.findAllByType("indicator").some((node) => node.props.active)).toBe(false);
    } finally {
        if (tree) await act(() => tree.unmount());
        globalThis.requestAnimationFrame = originalFrame;
        globalThis.cancelAnimationFrame = originalCancel;
        log.mockRestore();
    }
    expect(registrations.size).toBe(0);
});
