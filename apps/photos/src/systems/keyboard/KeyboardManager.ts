import { KeyCodes, KeyText as SparkKeyText } from "@legendapp/spark/shortcuts/keyboard";
import { createKeyText } from "./keyText";
export { keyboardManager as default, KeyCodes } from "@legendapp/spark/shortcuts/keyboard";
export type { KeyboardEvent } from "@legendapp/spark/shortcuts/keyboard";
export const KeyText = createKeyText(KeyCodes);
export function keyCodeFromText(text: string) {
  return Object.entries(KeyText).find(([, label]) => label === text)?.[0] ??
    Object.entries(SparkKeyText).find(([, label]) => label === text)?.[0] ?? text;
}
