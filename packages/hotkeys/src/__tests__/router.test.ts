const mockKeyDownListeners = new Set<(event: { keyCode: number; modifiers: number }) => boolean | void>();
const mockKeyUpListeners = new Set<(event: { keyCode: number; modifiers: number }) => boolean | void>();
jest.mock("@legend-apps/keyboard-manager", () => {
  const KeyCodes = {
    KEY_A: 0,
    KEY_S: 1,
    KEY_RETURN: 36,
    KEY_TAB: 48,
    KEY_SPACE: 49,
    KEY_DELETE: 51,
    KEY_BACKSPACE: 51,
    KEY_ESCAPE: 53,
    KEY_HOME: 115,
    KEY_PAGE_UP: 116,
    KEY_FORWARD_DELETE: 117,
    KEY_END: 119,
    KEY_PAGE_DOWN: 121,
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
  };
  return {
    addKeyDownListener: (listener: (event: { keyCode: number; modifiers: number }) => boolean | void) => {
      mockKeyDownListeners.add(listener);
      return () => mockKeyDownListeners.delete(listener);
    },
    addKeyUpListener: (listener: (event: { keyCode: number; modifiers: number }) => boolean | void) => {
      mockKeyUpListeners.add(listener);
      return () => mockKeyUpListeners.delete(listener);
    },
    createModifierMask: (...modifiers: number[]) => modifiers.reduce((mask, modifier) => mask | modifier, 0),
    hasModifier: (event: { modifiers: number }, modifier: number) => (event.modifiers & modifier) === modifier,
    KeyCodes,
  };
});

import {
  KeyCodes,
  createHotkeyRouter,
  type HotkeyDefinition,
} from "../index";

function keyDown(keyCode: number, modifiers = 0) {
  for (const listener of mockKeyDownListeners) {
    listener({ keyCode, modifiers });
  }
}

function keyUp(keyCode: number, modifiers = 0) {
  for (const listener of mockKeyUpListeners) {
    listener({ keyCode, modifiers });
  }
}

function definition(
  id: string,
  defaultValue: number,
  options: Partial<HotkeyDefinition<string>> = {},
): HotkeyDefinition<string> {
  return {
    defaultValue,
    id,
    title: id,
    ...options,
  };
}

describe("createHotkeyRouter", () => {
  it("routes every configured binding for a command", () => {
    const router = createHotkeyRouter();
    const handler = jest.fn();
    const remove = router.register({
      bindings: {
        open: [KeyCodes.KEY_A, KeyCodes.KEY_S],
      },
      definitions: [definition("open", KeyCodes.KEY_A)],
      handlers: { open: handler },
    });

    keyDown(KeyCodes.KEY_A);
    keyUp(KeyCodes.KEY_A);
    keyDown(KeyCodes.KEY_S);
    keyUp(KeyCodes.KEY_S);

    expect(handler).toHaveBeenCalledTimes(2);
    remove();
  });

  it("routes only the active window and honors window suspension", () => {
    const router = createHotkeyRouter();
    const windowHandler = jest.fn();
    const applicationHandler = jest.fn();
    const definitions = [definition("open", KeyCodes.KEY_A)];
    const removeApplication = router.register({
      definitions,
      handlers: { open: applicationHandler },
      scope: { kind: "application" },
    });
    const removeWindow = router.register({
      definitions,
      handlers: { open: windowHandler },
      scope: { kind: "window", windowId: "viewer-a" },
    });

    router.setActiveWindowId("viewer-b");
    keyDown(KeyCodes.KEY_A);
    keyUp(KeyCodes.KEY_A);
    expect(windowHandler).not.toHaveBeenCalled();
    expect(applicationHandler).toHaveBeenCalledTimes(1);

    router.setActiveWindowId("viewer-a");
    const resume = router.suspend({ kind: "window", windowId: "viewer-a" });
    keyDown(KeyCodes.KEY_A);
    keyUp(KeyCodes.KEY_A);
    expect(windowHandler).not.toHaveBeenCalled();
    expect(applicationHandler).toHaveBeenCalledTimes(1);

    resume();
    keyDown(KeyCodes.KEY_A);
    keyUp(KeyCodes.KEY_A);
    expect(windowHandler).toHaveBeenCalledTimes(1);
    expect(applicationHandler).toHaveBeenCalledTimes(1);

    removeWindow();
    removeApplication();
  });

  it("uses priority and handler consumption for overlapping bindings", () => {
    const router = createHotkeyRouter();
    const calls: string[] = [];
    const definitions = [definition("space", KeyCodes.KEY_SPACE)];
    const removeFallback = router.register({
      definitions,
      handlers: {
        space: () => {
          calls.push("fallback");
        },
      },
      priority: 100,
    });
    const removeControl = router.register({
      definitions,
      handlers: {
        space: () => {
          calls.push("control");
          return false;
        },
      },
      priority: 200,
    });

    keyDown(KeyCodes.KEY_SPACE);
    keyUp(KeyCodes.KEY_SPACE);
    expect(calls).toEqual(["control", "fallback"]);

    removeControl();
    const removeConsumingControl = router.register({
      definitions,
      handlers: {
        space: () => {
          calls.push("consumed");
        },
      },
      priority: 200,
    });
    keyDown(KeyCodes.KEY_SPACE);
    keyUp(KeyCodes.KEY_SPACE);
    expect(calls).toEqual(["control", "fallback", "consumed"]);

    removeConsumingControl();
    removeFallback();
  });

  it("dispatches repeated keydown events only for repeatable commands", () => {
    const router = createHotkeyRouter();
    const normalHandler = jest.fn();
    const repeatHandler = jest.fn();
    const removeNormal = router.register({
      definitions: [definition("normal", KeyCodes.KEY_A)],
      handlers: { normal: normalHandler },
      priority: 200,
    });
    const removeRepeat = router.register({
      definitions: [definition("repeat", KeyCodes.KEY_A, { repeat: true })],
      handlers: {
        repeat: (context) => {
          repeatHandler(context.repeated);
          return false;
        },
      },
      priority: 300,
    });

    keyDown(KeyCodes.KEY_A);
    keyDown(KeyCodes.KEY_A);
    keyUp(KeyCodes.KEY_A);

    expect(repeatHandler).toHaveBeenNthCalledWith(1, false);
    expect(repeatHandler).toHaveBeenNthCalledWith(2, true);
    expect(normalHandler).toHaveBeenCalledTimes(1);
    removeRepeat();
    removeNormal();
  });

  it("provides pressed modifier state without accepting extra modifiers by default", () => {
    const router = createHotkeyRouter();
    const exactHandler = jest.fn();
    const selectionHandler = jest.fn();
    const removeExact = router.register({
      definitions: [definition("exact", KeyCodes.KEY_UP)],
      handlers: { exact: exactHandler },
      priority: 100,
    });
    const removeSelection = router.register({
      definitions: [definition("selection", KeyCodes.KEY_UP, { allowExtraModifiers: true })],
      handlers: {
        selection: (context) => {
          selectionHandler(context.pressedKeys.has(KeyCodes.MODIFIER_SHIFT));
        },
      },
      priority: 200,
    });

    keyDown(KeyCodes.KEY_UP, KeyCodes.MODIFIER_SHIFT);
    keyUp(KeyCodes.KEY_UP, KeyCodes.MODIFIER_SHIFT);

    expect(selectionHandler).toHaveBeenCalledWith(true);
    expect(exactHandler).not.toHaveBeenCalled();
    expect(router.getPressedKeys().has(KeyCodes.KEY_UP)).toBe(false);
    removeSelection();
    removeExact();
  });
});
