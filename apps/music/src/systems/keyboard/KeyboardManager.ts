import {
    keyboardManager,
    KeyCodes,
    type KeyboardEvent,
    type KeyboardEventListener,
} from "@legend-desktop/keyboard-manager";

export type { KeyboardEvent, KeyboardEventListener };
export { KeyCodes };

export const KeyText: Record<number, string> = (() => {
    const keyText: Record<number, string> = {};

    for (const [key, value] of Object.entries(KeyCodes)) {
        if (typeof value === "number" && !key.startsWith("MODIFIER_")) {
            const name = key.startsWith("KEY_") ? key.substring(4) : key;
            keyText[value] = name.length === 1 ? name : name.charAt(0) + name.slice(1).toLowerCase();
        }
    }

    return {
        ...keyText,
        [KeyCodes.KEY_RETURN]: "↩",
        [KeyCodes.KEY_TAB]: "⇥",
        [KeyCodes.KEY_SPACE]: "Space",
        [KeyCodes.KEY_DELETE]: "⌫",
        [KeyCodes.KEY_FORWARD_DELETE]: "⌦",
        [KeyCodes.KEY_ESCAPE]: "Esc",
        [KeyCodes.KEY_LEFT]: "←",
        [KeyCodes.KEY_RIGHT]: "→",
        [KeyCodes.KEY_DOWN]: "↓",
        [KeyCodes.KEY_UP]: "↑",
        [KeyCodes.KEY_MINUS]: "-",
        [KeyCodes.KEY_EQUALS]: "=",
        [KeyCodes.KEY_COMMA]: ",",
        [KeyCodes.KEY_PERIOD]: ".",
        [KeyCodes.KEY_SLASH]: "/",
        [KeyCodes.KEY_MEDIA_PLAY_PAUSE]: "Play/Pause",
        [KeyCodes.KEY_MEDIA_NEXT]: "Next Track",
        [KeyCodes.KEY_MEDIA_PREVIOUS]: "Previous Track",
        [KeyCodes.MODIFIER_COMMAND]: "⌘",
        [KeyCodes.MODIFIER_SHIFT]: "⇧",
        [KeyCodes.MODIFIER_OPTION]: "⌥",
        [KeyCodes.MODIFIER_CONTROL]: "⌃",
        [KeyCodes.MODIFIER_CAPS_LOCK]: "⇪",
    };
})();

export default keyboardManager;
