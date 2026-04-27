import { NativeEventEmitter, Platform } from "react-native";
import NativeAppExit from "./NativeAppExit";

export type AppExitEvent = {
  reason: "requested" | "willTerminate";
};

export function isAppExitSupported() {
  return Platform.OS === "macos" && NativeAppExit.isSupported();
}

export function requestAppExit() {
  if (Platform.OS === "macos") {
    NativeAppExit.requestExit();
  }
}

export function completeAppExit(allow = true) {
  if (Platform.OS === "macos") {
    NativeAppExit.completeExit(allow);
  }
}

export function addAppExitListener(listener: (event: AppExitEvent) => void) {
  if (Platform.OS !== "macos") {
    return { remove() {} };
  }

  const emitter = new NativeEventEmitter(NativeAppExit as never);
  return emitter.addListener("AppExitRequested", listener);
}

export { default as NativeAppExit } from "./NativeAppExit";
