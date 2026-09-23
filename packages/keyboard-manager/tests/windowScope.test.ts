// @ts-ignore Bun provides the test module at runtime.
import { expect, mock, test } from "bun:test";
const handlers = new Map<string, (event: unknown) => void>();
const native = { startMonitoringKeyboard: async () => true, stopMonitoringKeyboard: async () => true, respondToKeyEvent: mock(() => {}) };
mock.module("react-native", () => ({
  Platform: { OS: "macos" },
  TurboModuleRegistry: { getEnforcing: () => native },
  NativeEventEmitter: class {
    addListener(name: string, handler: (event: unknown) => void) {
      handlers.set(name, handler);
      return { remove: () => handlers.delete(name) };
    }
  },
}));
const { addKeyDownListener, stopKeyboardMonitoring } = await import("../src/index");
test("window-scoped shortcuts ignore settings and unidentified events", () => {
  const listener = mock(() => true);
  const remove = addKeyDownListener(listener, { windowIdentifiers: ["slides-presenter", "slides-audience"] });
  const emit = (windowIdentifier?: string) => handlers.get("onKeyDown")?.({ eventId: "key", keyCode: 18, modifiers: 0, windowIdentifier });
  emit("slides-settings");
  emit();
  expect(listener).not.toHaveBeenCalled();
  expect(native.respondToKeyEvent).toHaveBeenLastCalledWith("key", false);
  emit("slides-presenter");
  emit("slides-audience");
  expect(listener).toHaveBeenCalledTimes(2);
  expect(native.respondToKeyEvent).toHaveBeenLastCalledWith("key", true);
  remove();
  emit("slides-presenter");
  expect(listener).toHaveBeenCalledTimes(2);
  void stopKeyboardMonitoring();
});
