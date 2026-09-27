import { useHookKeyboard, useOnHotkeys } from "./Keyboard";
import { state$ } from "../State";
export function HookKeyboard() {
  useHookKeyboard();
  useOnHotkeys({Settings: () => state$.showSettings.set(true)});
  return null;
}
export function HiddenTextInput() { return null; }
