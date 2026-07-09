import TestRenderer, { act, type ReactTestRenderer } from "react-test-renderer";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type KeyboardEvent = {
  keyCode: number;
  modifiers: number;
};

type KeyboardListener = (event: KeyboardEvent) => boolean | void;

jest.mock("@legend-apps/keyboard-manager", () => {
  const keyDownListeners: KeyboardListener[] = [];
  const keyUpListeners: KeyboardListener[] = [];
  const addKeyDownListener = jest.fn((listener: KeyboardListener) => {
    keyDownListeners.push(listener);
    return () => {
      const index = keyDownListeners.indexOf(listener);
      if (index >= 0) {
        keyDownListeners.splice(index, 1);
      }
    };
  });
  const addKeyUpListener = jest.fn((listener: KeyboardListener) => {
    keyUpListeners.push(listener);
    return () => {
      const index = keyUpListeners.indexOf(listener);
      if (index >= 0) {
        keyUpListeners.splice(index, 1);
      }
    };
  });

  return {
    __mockAddKeyDownListener: addKeyDownListener,
    __mockAddKeyUpListener: addKeyUpListener,
    __mockKeyDownListeners: keyDownListeners,
    __mockKeyUpListeners: keyUpListeners,
    addKeyDownListener,
    addKeyUpListener,
    createModifierMask: (...modifiers: number[]) => modifiers.reduce((mask, modifier) => mask | modifier, 0),
    hasModifier: (event: KeyboardEvent, modifier: number) => (event.modifiers & modifier) === modifier,
    KeyCodes: {
      KEY_A: 0,
      KEY_K: 40,
      KEY_RETURN: 36,
      KEY_TAB: 48,
      KEY_SPACE: 49,
      KEY_DELETE: 51,
      KEY_BACKSPACE: 51,
      KEY_ESCAPE: 53,
      KEY_LEFT: 123,
      KEY_RIGHT: 124,
      KEY_DOWN: 125,
      KEY_UP: 126,
      KEY_MINUS: 27,
      KEY_EQUALS: 24,
      KEY_COMMA: 43,
      KEY_PERIOD: 47,
      KEY_SLASH: 44,
      KEY_MEDIA_PLAY_PAUSE: 10001,
      KEY_MEDIA_NEXT: 10002,
      KEY_MEDIA_PREVIOUS: 10003,
      MODIFIER_CAPS_LOCK: 1 << 16,
      MODIFIER_SHIFT: 1 << 17,
      MODIFIER_CONTROL: 1 << 18,
      MODIFIER_OPTION: 1 << 19,
      MODIFIER_COMMAND: 1 << 20,
      MODIFIER_FUNCTION: 1 << 23,
    },
  };
});

jest.mock("react-native", () => {
  const React = require("react");

  return {
    Pressable: ({ children, ...props }: any) => React.createElement("Pressable", props, children),
    ScrollView: ({ children, ...props }: any) => React.createElement("ScrollView", props, children),
    StyleSheet: {
      create: (styles: object) => styles,
    },
    Text: ({ children, ...props }: any) => React.createElement("Text", props, children),
    View: ({ children, ...props }: any) => React.createElement("View", props, children),
  };
});

import { HotkeyCapture, KeyCodes } from "@legend-apps/hotkeys";

const keyboardManagerMock = jest.requireMock("@legend-apps/keyboard-manager") as {
  __mockAddKeyDownListener: jest.Mock;
  __mockAddKeyUpListener: jest.Mock;
  __mockKeyDownListeners: KeyboardListener[];
  __mockKeyUpListeners: KeyboardListener[];
};
const reactNativeMock = jest.requireMock("react-native") as {
  Pressable: React.ElementType;
};

describe("HotkeyCapture", () => {
  let consoleErrorSpy: jest.SpyInstance;

  beforeEach(() => {
    consoleErrorSpy = jest.spyOn(console, "error").mockImplementation((...args: unknown[]) => {
      const [message] = args;
      if (typeof message === "string" && message.includes("react-test-renderer is deprecated")) {
        return;
      }
      process.stderr.write(`${args.join(" ")}\n`);
    });
    keyboardManagerMock.__mockAddKeyDownListener.mockClear();
    keyboardManagerMock.__mockAddKeyUpListener.mockClear();
    keyboardManagerMock.__mockKeyDownListeners.length = 0;
    keyboardManagerMock.__mockKeyUpListeners.length = 0;
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  it("warms keyboard listeners before the first click", () => {
    let renderer: ReactTestRenderer | undefined;

    act(() => {
      renderer = TestRenderer.create(<HotkeyCapture onChange={jest.fn()} value={null} />);
    });

    expect(keyboardManagerMock.__mockAddKeyDownListener).toHaveBeenCalledTimes(1);
    expect(keyboardManagerMock.__mockAddKeyUpListener).toHaveBeenCalledTimes(1);
    expect(keyboardManagerMock.__mockKeyDownListeners).toHaveLength(1);
    expect(keyboardManagerMock.__mockKeyUpListeners).toHaveLength(1);
    expect(keyboardManagerMock.__mockKeyDownListeners[0]({ keyCode: KeyCodes.KEY_K, modifiers: 0 })).toBe(false);

    act(() => {
      renderer?.unmount();
    });
  });

  it("captures the first key pressed after the first click", () => {
    const onChange = jest.fn();
    let renderer: ReactTestRenderer | undefined;

    act(() => {
      renderer = TestRenderer.create(<HotkeyCapture onChange={onChange} value={null} />);
    });

    const pressable = renderer!.root.findByType(reactNativeMock.Pressable);
    act(() => {
      pressable.props.onPress();
    });
    act(() => {
      keyboardManagerMock.__mockKeyDownListeners[0]({ keyCode: KeyCodes.KEY_K, modifiers: 0 });
    });
    act(() => {
      keyboardManagerMock.__mockKeyUpListeners[0]({ keyCode: KeyCodes.KEY_K, modifiers: 0 });
    });

    expect(onChange).toHaveBeenCalledWith(`${KeyCodes.KEY_K}`);

    act(() => {
      renderer?.unmount();
    });
  });

  it("starts capture on press-in so focus-only clicks can still activate", () => {
    const onChange = jest.fn();
    let renderer: ReactTestRenderer | undefined;

    act(() => {
      renderer = TestRenderer.create(<HotkeyCapture onChange={onChange} value={null} />);
    });

    const pressable = renderer!.root.findByType(reactNativeMock.Pressable);
    act(() => {
      pressable.props.onPressIn();
    });
    act(() => {
      keyboardManagerMock.__mockKeyDownListeners[0]({ keyCode: KeyCodes.KEY_K, modifiers: 0 });
    });
    act(() => {
      keyboardManagerMock.__mockKeyUpListeners[0]({ keyCode: KeyCodes.KEY_K, modifiers: 0 });
    });

    expect(onChange).toHaveBeenCalledWith(`${KeyCodes.KEY_K}`);

    act(() => {
      renderer?.unmount();
    });
  });

  it("keeps capture active if the focused input blurs during its activation click", () => {
    const onChange = jest.fn();
    let renderer: ReactTestRenderer | undefined;

    act(() => {
      renderer = TestRenderer.create(<HotkeyCapture onChange={onChange} value={null} />);
    });

    const pressable = renderer!.root.findByType(reactNativeMock.Pressable);
    act(() => {
      pressable.props.onPressIn();
      pressable.props.onBlur();
    });

    let handled: boolean | void = false;
    act(() => {
      handled = keyboardManagerMock.__mockKeyDownListeners[0]({ keyCode: KeyCodes.KEY_K, modifiers: 0 });
    });
    expect(handled).toBe(true);

    act(() => {
      renderer?.unmount();
    });
  });

  it("cancels capture on escape without committing a hotkey", () => {
    const onCaptureChange = jest.fn();
    const onChange = jest.fn();
    let renderer: ReactTestRenderer | undefined;

    act(() => {
      renderer = TestRenderer.create(
        <HotkeyCapture onCaptureChange={onCaptureChange} onChange={onChange} value={null} />,
      );
    });

    const pressable = renderer!.root.findByType(reactNativeMock.Pressable);
    act(() => {
      pressable.props.onPressIn();
    });
    let escapeHandled: boolean | void = false;
    act(() => {
      escapeHandled = keyboardManagerMock.__mockKeyDownListeners[0]({ keyCode: KeyCodes.KEY_ESCAPE, modifiers: 0 });
    });

    expect(escapeHandled).toBe(true);
    expect(onChange).not.toHaveBeenCalled();
    expect(onCaptureChange.mock.calls).toEqual([[true], [false]]);
    expect(keyboardManagerMock.__mockKeyDownListeners[0]({ keyCode: KeyCodes.KEY_K, modifiers: 0 })).toBe(false);

    act(() => {
      renderer?.unmount();
    });
  });

  it("cancels the first capture when a second one starts", async () => {
    const firstCaptureChange = jest.fn();
    const secondCaptureChange = jest.fn();
    let renderer: ReactTestRenderer | undefined;

    act(() => {
      renderer = TestRenderer.create(
        <>
          <HotkeyCapture onCaptureChange={firstCaptureChange} onChange={jest.fn()} value={null} />
          <HotkeyCapture onCaptureChange={secondCaptureChange} onChange={jest.fn()} value={null} />
        </>,
      );
    });

    const pressables = renderer!.root.findAllByType(reactNativeMock.Pressable);
    expect(pressables).toHaveLength(2);

    act(() => {
      pressables[0].props.onPress();
    });
    expect(firstCaptureChange).toHaveBeenCalledWith(true);

    const [, secondPressable] = renderer!.root.findAllByType(reactNativeMock.Pressable);
    await act(async () => {
      secondPressable.props.onPress();
    });

    expect(firstCaptureChange).toHaveBeenLastCalledWith(false);
    expect(secondCaptureChange).toHaveBeenCalledWith(true);
    expect(keyboardManagerMock.__mockKeyDownListeners[0]({ keyCode: KeyCodes.KEY_K, modifiers: 0 })).toBe(false);
    let secondHandled: boolean | void = false;
    act(() => {
      secondHandled = keyboardManagerMock.__mockKeyDownListeners[1]({ keyCode: KeyCodes.KEY_K, modifiers: 0 });
    });
    expect(secondHandled).toBe(true);

    act(() => {
      renderer?.unmount();
    });
  });

  it("leaves a shared capture state active when switching inputs", async () => {
    const captureChange = jest.fn();
    let renderer: ReactTestRenderer | undefined;

    act(() => {
      renderer = TestRenderer.create(
        <>
          <HotkeyCapture onCaptureChange={captureChange} onChange={jest.fn()} value={null} />
          <HotkeyCapture onCaptureChange={captureChange} onChange={jest.fn()} value={null} />
        </>,
      );
    });

    const pressables = renderer!.root.findAllByType(reactNativeMock.Pressable);

    act(() => {
      pressables[0].props.onPress();
    });
    const [, secondPressable] = renderer!.root.findAllByType(reactNativeMock.Pressable);
    await act(async () => {
      secondPressable.props.onPress();
    });

    expect(captureChange.mock.calls).toEqual([[true], [false], [true]]);

    act(() => {
      renderer?.unmount();
    });
  });
});
