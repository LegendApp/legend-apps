import {
    keyboardManager,
    KeyCodes,
    type KeyboardEvent,
    type KeyboardEventListener,
} from "@legend-apps/keyboard-manager";
import { KeyText } from "@legend-apps/hotkeys";

export type { KeyboardEvent, KeyboardEventListener };
export { KeyCodes, KeyText };

export default keyboardManager;
