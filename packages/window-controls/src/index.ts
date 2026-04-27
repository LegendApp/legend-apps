import { NativeEventEmitter, Platform } from "react-native";
import NativeWindowControls from "./NativeWindowControls";

export type FullscreenChangeEvent = {
  isFullscreen: boolean;
};

export function hideWindowControls() {
  if (Platform.OS === "macos") {
    NativeWindowControls.hideWindowControls();
  }
}

export function showWindowControls() {
  if (Platform.OS === "macos") {
    NativeWindowControls.showWindowControls();
  }
}

export function isWindowFullScreen() {
  if (Platform.OS !== "macos") {
    return Promise.resolve(false);
  }

  return NativeWindowControls.isWindowFullScreen();
}

export function addFullscreenChangeListener(listener: (event: FullscreenChangeEvent) => void) {
  if (Platform.OS !== "macos") {
    return { remove() {} };
  }

  const emitter = new NativeEventEmitter(NativeWindowControls as never);
  return emitter.addListener("fullscreenChange", listener);
}

export { default as NativeWindowControls } from "./NativeWindowControls";
