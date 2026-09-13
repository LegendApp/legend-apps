import { Profiler } from "react";
import { observable } from "@legendapp/state";
import { useValue } from "@legendapp/state/react";
import { act, fireEvent, render } from "@testing-library/react-native";

const mockKeyDownListeners = new Set<(event: { keyCode: number; modifiers: number }) => boolean | void>();
const mockKeyUpListeners = new Set<(event: { keyCode: number; modifiers: number }) => boolean | void>();

jest.mock("@legend-apps/keyboard-manager", () => {
  const actual = jest.requireActual("@legend-apps/keyboard-manager");
  return {
    ...actual,
    addKeyDownListener: (
      listener: (event: { keyCode: number; modifiers: number }) => boolean | void,
    ) => {
      mockKeyDownListeners.add(listener);
      return () => mockKeyDownListeners.delete(listener);
    },
    addKeyUpListener: (
      listener: (event: { keyCode: number; modifiers: number }) => boolean | void,
    ) => {
      mockKeyUpListeners.add(listener);
      return () => mockKeyUpListeners.delete(listener);
    },
  };
});

import {
  HotkeyCapture,
  HotkeyBindingsSettingsContent,
  KeyCodes,
  serializeHotkey,
  type HotkeyDefinition,
  type HotkeyValue,
} from "@legend-apps/hotkeys";
import {
  diffHotkeys$,
  setDiffHotkeyBindings,
  useDiffHotkeyBindingsSnapshot,
} from "../diffHotkeys";

const definitions = [
  {
    defaultBindings: [KeyCodes.KEY_R],
    defaultValue: KeyCodes.KEY_R,
    id: "reload",
    title: "Reload",
  },
] as const satisfies readonly HotkeyDefinition<string>[];

describe("Diff hotkey settings", () => {
  afterEach(() => {
    mockKeyDownListeners.clear();
    mockKeyUpListeners.clear();
  });

  it("only updates the previous and next capture controls when switching capture", async () => {
    const renders = [0, 0, 0];
    const transitions: string[] = [];
    const view = await render(<>
      {[KeyCodes.KEY_R, KeyCodes.KEY_S, KeyCodes.KEY_T].map((key, index) => (
        <Profiler key={key} id={String(index)} onRender={() => { renders[index]! += 1; }}>
          <HotkeyCapture value={key} onChange={() => {}} onCaptureChange={(active) => transitions.push(`${index}:${active}`)} />
        </Profiler>
      ))}
    </>);
    const initial = [...renders];
    await fireEvent.press(view.getByText("R"));
    expect(renders[0]).toBeGreaterThan(initial[0]!);
    expect(renders.slice(1)).toEqual(initial.slice(1));
    const first = [...renders];
    await fireEvent.press(view.getByText("S"));
    expect(renders[0]).toBeGreaterThan(first[0]!);
    expect(renders[1]).toBeGreaterThan(first[1]!);
    expect(renders[2]).toBe(first[2]);
    expect(transitions).toEqual(["0:true", "0:false", "1:true"]);
    await act(() => {
      for (const listener of mockKeyDownListeners) {
        listener({ keyCode: KeyCodes.KEY_ESCAPE, modifiers: 0 });
      }
    });
    expect(transitions.at(-1)).toBe("1:false");
    await view.unmount();
  });

  it("commits a modified shortcut when its non-modifier key is released", async () => {
    const previousBindings = diffHotkeys$.bindings.reload.peek();

    function Harness() {
      const bindings = useDiffHotkeyBindingsSnapshot();
      return (
        <HotkeyCapture
          onChange={(nextValue) => {
            if (nextValue !== null) {
              setDiffHotkeyBindings("reload", [nextValue]);
            }
          }}
          value={bindings.reload[0] ?? null}
        />
      );
    }

    const view = await render(<Harness />);
    try {
      await fireEvent.press(view.getByText("⌘ + R"));
      await act(() => {
        for (const listener of mockKeyDownListeners) {
          listener({
            keyCode: KeyCodes.KEY_K,
            modifiers: KeyCodes.MODIFIER_COMMAND,
          });
        }
      });
      await act(() => {
        for (const listener of mockKeyUpListeners) {
          listener({
            keyCode: KeyCodes.KEY_K,
            modifiers: KeyCodes.MODIFIER_COMMAND,
          });
        }
      });

      const expectedValue = serializeHotkey([KeyCodes.MODIFIER_COMMAND, KeyCodes.KEY_K]);
      expect(diffHotkeys$.bindings.reload.peek()).toEqual([expectedValue]);
      expect(view.getByText("⌘ + K")).toBeTruthy();
    } finally {
      await view.unmount();
      setDiffHotkeyBindings("reload", previousBindings);
    }
  });

  it("clears the single configured shortcut", async () => {
    const bindings$ = observable<Record<"reload", readonly HotkeyValue[]>>({
      reload: [KeyCodes.KEY_R],
    });

    function Harness() {
      const values = useValue(bindings$);
      return (
        <HotkeyBindingsSettingsContent
          definitions={definitions}
          maxBindingsPerCommand={1}
          onChange={(id, bindings) => bindings$[id].set(bindings)}
          values={values}
        />
      );
    }

    const view = await render(<Harness />);
    await fireEvent.press(view.getByLabelText("Clear Reload shortcut R"));

    expect(bindings$.reload.peek()).toEqual([]);
    expect(view.queryByLabelText("Clear Reload shortcut R")).toBeNull();
    expect(view.getByText("Click to record")).toBeTruthy();
    await fireEvent.press(view.getByLabelText("Restore Reload default shortcut"));
    expect(bindings$.reload.peek()).toEqual([KeyCodes.KEY_R]);
    expect(view.getByLabelText("Clear Reload shortcut R")).toBeTruthy();
    expect(view.queryByLabelText("Restore Reload default shortcut")).toBeNull();
    await view.unmount();
  });
});
