import { normalizeHotkeyBindings } from "@legendapp/spark/shortcuts/commands";

// Legacy Photos bindings used macOS virtual key codes, not character codes.
const legacyKeys: Record<number, string> = {
  0: "A", 1: "S", 2: "D", 3: "F", 4: "H", 5: "G", 6: "Z", 7: "X", 8: "C", 9: "V",
  11: "B", 12: "Q", 13: "W", 14: "E", 15: "R", 16: "Y", 17: "T",
  18: "1", 19: "2", 20: "3", 21: "4", 22: "6", 23: "5", 24: "=", 25: "9",
  26: "7", 27: "-", 28: "8", 29: "0", 30: "]", 31: "O", 32: "U", 33: "[",
  34: "I", 35: "P", 36: "Enter", 37: "L", 38: "J", 40: "K", 43: ",", 44: "/",
  45: "N", 46: "M", 47: ".", 48: "Tab", 49: "Space", 51: "Backspace", 53: "Escape",
  64: "F17", 79: "F18", 80: "F19", 90: "F20", 96: "F5", 97: "F6", 98: "F7",
  99: "F3", 100: "F8", 101: "F9", 103: "F11", 105: "F13", 106: "F16", 107: "F14",
  109: "F10", 111: "F12", 113: "F15", 115: "Home", 116: "PageUp", 117: "Delete",
  118: "F4", 119: "End", 120: "F2", 121: "PageDown", 122: "F1",
  123: "Left", 124: "Right", 125: "Down", 126: "Up",
  10001: "MediaPlayPause", 10002: "MediaNext", 10003: "MediaPrevious",
};

// Labels written by the original app and the intermediate Spark keyboard manager.
const legacyLabels: Record<string, string> = {
  "←": "Left", "→": "Right", "↑": "Up", "↓": "Down",
  "↩": "Enter", "⇥": "Tab", "⌫": "Backspace", Esc: "Escape",
  "⌘": "Cmd", "⇧": "Shift", "⌥": "Alt", "⌃": "Ctrl", "⇪": "CapsLock",
  1048576: "Cmd", 131072: "Shift", 524288: "Alt", 262144: "Ctrl",
  65536: "CapsLock", 8388608: "Fn",
  Page_up: "PageUp", Page_down: "PageDown", Left_bracket: "[", Right_bracket: "]",
  Forward_delete: "Delete", "Forward Delete": "Delete",
  Media_play_pause: "MediaPlayPause", "Play/Pause": "MediaPlayPause",
  Media_next: "MediaNext", "Next Track": "MediaNext",
  Media_previous: "MediaPrevious", "Previous Track": "MediaPrevious",
};

export function loadHotkeys(value: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(value).flatMap(([name, binding]) => {
    const key = typeof binding === "number" ? legacyKeys[binding] :
      typeof binding === "string" ? binding.split("+").map(part => legacyLabels[part.trim()] ?? part).join("+") : undefined;
    if (key === undefined) return [];
    try {
      normalizeHotkeyBindings([key]);
      return [[name, key]];
    } catch {
      // Omit invalid bindings so built-in and plugin defaults can apply.
      return [];
    }
  }));
}
