import {
    keyboardManager,
    KeyCodes,
    type KeyboardEvent,
    type KeyboardEventListener,
} from "@legendapp/spark/shortcuts/keyboard";
import { KeyText } from "@legendapp/spark/shortcuts/commands";

export type { KeyboardEvent, KeyboardEventListener };
export { KeyCodes, KeyText };

export default keyboardManager;
