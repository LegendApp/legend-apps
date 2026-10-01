import { useOnHotkeys } from "./Keyboard";
import { state$ } from "../State";
export function HookKeyboard() {
  useOnHotkeys({Settings: () => state$.showSettings.set(true)});
  return null;
}
