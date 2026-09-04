import { writeApplicationSupportJson } from "@legend-apps/storage/src/applicationSupport";
import { getReactNativeStartupTiming } from "@legend-apps/window-manager";
import { emitChatBenchmarkEvent, type ChatBenchmarkConfig } from "../chatBenchmark";

jest.mock("@legend-apps/storage/src/applicationSupport", () => ({ writeApplicationSupportJson: jest.fn() }));
jest.mock("@legend-apps/window-manager", () => ({ getReactNativeStartupTiming: jest.fn() }));

describe("benchmark window timestamp", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(10_000);
    jest.clearAllMocks();
  });
  afterEach(() => jest.useRealTimers());

  it("reports native presentation rather than React layout, with all diagnostics deferred", () => {
    jest.mocked(getReactNativeStartupTiming).mockReturnValue({ mainWindowFirstVisibleTime: 250, clockOffsetMs: 9_000 });
    const config = { eventFileName: "native-window-test.json" } as ChatBenchmarkConfig;
    emitChatBenchmarkEvent(config, { name: "windowShown" });
    expect(getReactNativeStartupTiming).not.toHaveBeenCalled();
    expect(writeApplicationSupportJson).not.toHaveBeenCalled();
    jest.runAllTimers();
    expect(writeApplicationSupportJson).toHaveBeenCalledWith(
      "chat-history-benchmark/native-window-test.json",
      [expect.objectContaining({ name: "windowShown", timestampMs: 9_250 })],
    );
  });

  it("falls back to the captured layout time if native timing is unavailable", () => {
    jest.mocked(getReactNativeStartupTiming).mockReturnValue({});
    emitChatBenchmarkEvent({ eventFileName: "missing-window-test.json" } as ChatBenchmarkConfig, { name: "windowShown" });
    jest.setSystemTime(11_000);
    jest.runAllTimers();
    expect(writeApplicationSupportJson).toHaveBeenCalledWith(
      "chat-history-benchmark/missing-window-test.json",
      [expect.objectContaining({ timestampMs: 10_000 })],
    );
  });
});
