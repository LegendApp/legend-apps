import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Platform } from "react-native";
import { audioPlayer, NativeAudioPlayer, setProgressUpdateInterval } from "..";

jest.mock("react-native", () => ({
  NativeEventEmitter: jest.fn(),
  Platform: { OS: "macos" },
  TurboModuleRegistry: {
    getEnforcing: jest.fn(() => ({ setProgressUpdateInterval: jest.fn() })),
  },
}));

it("uses a one-second visible interval before any setter call", () => {
  const nativeSource = readFileSync(resolve(__dirname, "../../ios/RNAudioPlayer.mm"), "utf8");
  expect(nativeSource).toMatch(/RNAudioPlayerProgressIntervalVisibleSeconds = 1\.0;/);
  expect(nativeSource).toContain("_visibleProgressUpdateInterval = RNAudioPlayerProgressIntervalVisibleSeconds;");
  expect(nativeSource).toContain("RNAudioPlayerProgressIntervalOccludedSeconds : self.visibleProgressUpdateInterval");
  expect(NativeAudioPlayer.setProgressUpdateInterval).not.toHaveBeenCalled();
});

it.each(["macos", "ios"] as const)("forwards the requested seconds on %s", (platform) => {
  jest.clearAllMocks();
  jest.replaceProperty(Platform, "OS", platform);
  expect(audioPlayer.setProgressUpdateInterval).toBe(setProgressUpdateInterval);
  audioPlayer.setProgressUpdateInterval(5);
  expect(NativeAudioPlayer.setProgressUpdateInterval).toHaveBeenCalledWith(5);
  jest.restoreAllMocks();
});
