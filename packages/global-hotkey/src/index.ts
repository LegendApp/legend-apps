import { NativeEventEmitter, Platform } from "react-native";
import NativeGlobalHotkey from "./NativeGlobalHotkey";

export type GlobalHotkeyResult = {
  success: boolean;
  message?: string;
};

function parseResult(value: string): GlobalHotkeyResult {
  try {
    const parsed = JSON.parse(value) as GlobalHotkeyResult;
    return typeof parsed.success === "boolean" ? parsed : { success: false, message: "Invalid native response." };
  } catch {
    return { success: false, message: "Invalid native response." };
  }
}

function unsupportedResult(): GlobalHotkeyResult {
  return { success: true };
}

export async function registerGlobalHotkey(keyCode: number, modifiers = 0): Promise<GlobalHotkeyResult> {
  if (Platform.OS !== "macos") {
    return unsupportedResult();
  }

  return parseResult(await NativeGlobalHotkey.registerHotkey(keyCode, modifiers));
}

export async function unregisterGlobalHotkey(): Promise<GlobalHotkeyResult> {
  if (Platform.OS !== "macos") {
    return unsupportedResult();
  }

  return parseResult(await NativeGlobalHotkey.unregisterHotkey());
}

export function addGlobalHotkeyListener(listener: () => void) {
  if (Platform.OS !== "macos") {
    return { remove() {} };
  }

  const emitter = new NativeEventEmitter(NativeGlobalHotkey as never);
  return emitter.addListener("onHotkeyPressed", listener);
}

export { default as NativeGlobalHotkey } from "./NativeGlobalHotkey";
