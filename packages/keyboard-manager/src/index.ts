import { NativeEventEmitter, Platform } from "react-native";
import NativeKeyboardManager from "./NativeKeyboardManager";

export type KeyboardEvent = Readonly<{
  eventId?: string;
  keyCode: number;
  modifiers: number;
}>;

export type KeyboardEventListener = (event: KeyboardEvent) => boolean | void;

export const KeyCodes = {
  KEY_A: 0,
  KEY_S: 1,
  KEY_D: 2,
  KEY_F: 3,
  KEY_H: 4,
  KEY_G: 5,
  KEY_Z: 6,
  KEY_X: 7,
  KEY_C: 8,
  KEY_V: 9,
  KEY_B: 11,
  KEY_Q: 12,
  KEY_W: 13,
  KEY_E: 14,
  KEY_R: 15,
  KEY_Y: 16,
  KEY_T: 17,
  KEY_1: 18,
  KEY_2: 19,
  KEY_3: 20,
  KEY_4: 21,
  KEY_6: 22,
  KEY_5: 23,
  KEY_EQUALS: 24,
  KEY_9: 25,
  KEY_7: 26,
  KEY_MINUS: 27,
  KEY_8: 28,
  KEY_0: 29,
  KEY_RIGHT_BRACKET: 30,
  KEY_O: 31,
  KEY_U: 32,
  KEY_LEFT_BRACKET: 33,
  KEY_I: 34,
  KEY_P: 35,
  KEY_RETURN: 36,
  KEY_L: 37,
  KEY_J: 38,
  KEY_K: 40,
  KEY_COMMA: 43,
  KEY_SLASH: 44,
  KEY_N: 45,
  KEY_M: 46,
  KEY_PERIOD: 47,
  KEY_TAB: 48,
  KEY_SPACE: 49,
  KEY_DELETE: 51,
  KEY_BACKSPACE: 51,
  KEY_ESCAPE: 53,
  KEY_F17: 64,
  KEY_F18: 79,
  KEY_F19: 80,
  KEY_F20: 90,
  KEY_F5: 96,
  KEY_F6: 97,
  KEY_F7: 98,
  KEY_F3: 99,
  KEY_F8: 100,
  KEY_F9: 101,
  KEY_F11: 103,
  KEY_F16: 106,
  KEY_F14: 107,
  KEY_F10: 109,
  KEY_F12: 111,
  KEY_F15: 113,
  KEY_HELP: 114,
  KEY_HOME: 115,
  KEY_PAGE_UP: 116,
  KEY_FORWARD_DELETE: 117,
  KEY_F4: 118,
  KEY_END: 119,
  KEY_F2: 120,
  KEY_PAGE_DOWN: 121,
  KEY_F1: 122,
  KEY_LEFT: 123,
  KEY_RIGHT: 124,
  KEY_DOWN: 125,
  KEY_UP: 126,
  KEY_MEDIA_PLAY_PAUSE: 10001,
  KEY_MEDIA_NEXT: 10002,
  KEY_MEDIA_PREVIOUS: 10003,
  MODIFIER_CAPS_LOCK: 1 << 16,
  MODIFIER_SHIFT: 1 << 17,
  MODIFIER_CONTROL: 1 << 18,
  MODIFIER_OPTION: 1 << 19,
  MODIFIER_COMMAND: 1 << 20,
  MODIFIER_FUNCTION: 1 << 23,
} as const;

export const KeyText: Record<number, string> = {
  [KeyCodes.KEY_RETURN]: "Return",
  [KeyCodes.KEY_TAB]: "Tab",
  [KeyCodes.KEY_SPACE]: "Space",
  [KeyCodes.KEY_DELETE]: "Delete",
  [KeyCodes.KEY_FORWARD_DELETE]: "Forward Delete",
  [KeyCodes.KEY_ESCAPE]: "Esc",
  [KeyCodes.KEY_LEFT_BRACKET]: "[",
  [KeyCodes.KEY_RIGHT_BRACKET]: "]",
  [KeyCodes.KEY_LEFT]: "Left",
  [KeyCodes.KEY_RIGHT]: "Right",
  [KeyCodes.KEY_DOWN]: "Down",
  [KeyCodes.KEY_UP]: "Up",
  [KeyCodes.KEY_MEDIA_PLAY_PAUSE]: "Play/Pause",
  [KeyCodes.KEY_MEDIA_NEXT]: "Next Track",
  [KeyCodes.KEY_MEDIA_PREVIOUS]: "Previous Track",
};

const keyDownListeners = new Set<KeyboardEventListener>();
const keyUpListeners = new Set<KeyboardEventListener>();
const emitter = new NativeEventEmitter(NativeKeyboardManager);
let nativeSubscriptions: { remove: () => void }[] = [];
let isMonitoring = false;
let startMonitoringPromise: Promise<boolean> | null = null;

function notifyListeners(listeners: Set<KeyboardEventListener>, event: KeyboardEvent) {
  let handled = false;
  for (const listener of listeners) {
    handled = listener(event) === true || handled;
  }
  if (event.eventId && Platform.OS === "macos") {
    NativeKeyboardManager.respondToKeyEvent(event.eventId, handled);
  }
}

function ensureNativeSubscriptions() {
  if (nativeSubscriptions.length > 0 || Platform.OS !== "macos") {
    return;
  }
  nativeSubscriptions = [
    emitter.addListener("onKeyDown", (event: KeyboardEvent) => notifyListeners(keyDownListeners, event)),
    emitter.addListener("onKeyUp", (event: KeyboardEvent) => notifyListeners(keyUpListeners, event)),
  ];
}

async function startMonitoring() {
  if (Platform.OS !== "macos" || isMonitoring) {
    return false;
  }
  if (startMonitoringPromise) {
    return startMonitoringPromise;
  }
  ensureNativeSubscriptions();
  const nextStart = NativeKeyboardManager.startMonitoringKeyboard().then((result) => {
    if (startMonitoringPromise === nextStart) {
      isMonitoring = result;
      startMonitoringPromise = null;
    }
    return result;
  }, (error) => {
    if (startMonitoringPromise === nextStart) {
      startMonitoringPromise = null;
    }
    throw error;
  });
  startMonitoringPromise = nextStart;
  return startMonitoringPromise;
}

async function stopMonitoringIfIdle() {
  if (Platform.OS !== "macos" || keyDownListeners.size > 0 || keyUpListeners.size > 0) {
    return false;
  }
  if (startMonitoringPromise) {
    await startMonitoringPromise;
  }
  if (keyDownListeners.size > 0 || keyUpListeners.size > 0) {
    return false;
  }
  if (!isMonitoring) {
    return false;
  }
  isMonitoring = false;
  return NativeKeyboardManager.stopMonitoringKeyboard();
}

export function addKeyDownListener(listener: KeyboardEventListener) {
  keyDownListeners.add(listener);
  void startMonitoring();
  return () => {
    keyDownListeners.delete(listener);
    void stopMonitoringIfIdle();
  };
}

export function addKeyUpListener(listener: KeyboardEventListener) {
  keyUpListeners.add(listener);
  void startMonitoring();
  return () => {
    keyUpListeners.delete(listener);
    void stopMonitoringIfIdle();
  };
}

export function hasModifier(event: KeyboardEvent, modifier: number) {
  return (event.modifiers & modifier) === modifier;
}

export function createModifierMask(...modifiers: number[]) {
  return modifiers.reduce((mask, modifier) => mask | modifier, 0);
}

export function stopKeyboardMonitoring() {
  for (const subscription of nativeSubscriptions) {
    subscription.remove();
  }
  nativeSubscriptions = [];
  keyDownListeners.clear();
  keyUpListeners.clear();
  isMonitoring = false;
  startMonitoringPromise = null;
  if (Platform.OS === "macos") {
    return NativeKeyboardManager.stopMonitoringKeyboard();
  }
  return Promise.resolve(false);
}

export const keyboardManager = {
  addKeyDownListener,
  addKeyUpListener,
  createModifierMask,
  hasModifier,
  stopMonitoring: stopKeyboardMonitoring,
};

export { NativeKeyboardManager };
