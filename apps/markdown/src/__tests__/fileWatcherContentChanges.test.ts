import { watchDirectories, watchFiles } from "@legend-apps/file-system-watcher";

jest.unmock("@legend-apps/file-system-watcher");

let mockNativeListener: (event: { path: string; filePath: string; type: string; contentChanged?: boolean }) => void;
jest.mock("react-native", () => ({
  Platform: { OS: "macos" },
  TurboModuleRegistry: { getEnforcing: () => ({ setWatchedDirectories: jest.fn() }) },
  NativeEventEmitter: class {
    addListener(_name: string, listener: typeof mockNativeListener) {
      mockNativeListener = listener;
      return { remove: jest.fn() };
    }
  },
}));

describe("document file watching", () => {
  it("ignores metadata-only events for files while retaining directory notifications", () => {
    const fileListener = jest.fn();
    const directoryListener = jest.fn();
    const file = watchFiles(["/tmp/note.md"], fileListener);
    const directory = watchDirectories(["/tmp"], directoryListener);
    const event = { path: "/tmp", filePath: "/tmp/note.md", type: "change" };
    mockNativeListener({ ...event, contentChanged: false });
    expect(fileListener).not.toHaveBeenCalled();
    expect(directoryListener).toHaveBeenCalledTimes(1);
    mockNativeListener({ ...event, contentChanged: true });
    mockNativeListener(event); // Older native binaries omit the new field.
    mockNativeListener({ ...event, filePath: "/tmp/other.md", contentChanged: true });
    expect(fileListener).toHaveBeenCalledTimes(2);
    file.remove();
    directory.remove();
  });
});
