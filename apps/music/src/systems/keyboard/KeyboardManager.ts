import {
    keyboardManager,
    KeyCodes,
    type KeyboardEvent,
    type KeyboardEventListener,
} from "@legend-desktop/keyboard-manager";
import { KeyText } from "@legend-desktop/hotkeys";

export type { KeyboardEvent, KeyboardEventListener };
export { KeyCodes, KeyText };

export default keyboardManager;
