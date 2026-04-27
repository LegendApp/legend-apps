import { Platform } from "react-native";
import NativeAutoUpdater from "./NativeAutoUpdater";

function unsupportedBoolean() {
  return Promise.resolve(false);
}

function unsupportedNumber() {
  return Promise.resolve(0);
}

export const AutoUpdater = {
  isAvailable: () => Platform.OS === "macos" && NativeAutoUpdater.isAvailable(),
  checkForUpdates: () => (Platform.OS === "macos" ? NativeAutoUpdater.checkForUpdates() : unsupportedBoolean()),
  checkForUpdatesInBackground: () =>
    Platform.OS === "macos" ? NativeAutoUpdater.checkForUpdatesInBackground() : unsupportedBoolean(),
  getAutomaticallyChecksForUpdates: () =>
    Platform.OS === "macos" ? NativeAutoUpdater.getAutomaticallyChecksForUpdates() : unsupportedBoolean(),
  setAutomaticallyChecksForUpdates: (value: boolean) =>
    Platform.OS === "macos" ? NativeAutoUpdater.setAutomaticallyChecksForUpdates(value) : unsupportedBoolean(),
  getUpdateCheckInterval: () =>
    Platform.OS === "macos" ? NativeAutoUpdater.getUpdateCheckInterval() : unsupportedNumber(),
  setUpdateCheckInterval: (interval: number) =>
    Platform.OS === "macos" ? NativeAutoUpdater.setUpdateCheckInterval(interval) : unsupportedBoolean(),
};

export { default as NativeAutoUpdater } from "./NativeAutoUpdater";
