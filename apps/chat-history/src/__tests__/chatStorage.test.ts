jest.mock("@legend-apps/storage", () => { const storage = { read: jest.fn(), write: jest.fn() }; return { createStorage: () => storage, __storage: storage }; });
const { read: mockRead, write: mockWrite } = jest.requireMock("@legend-apps/storage").__storage;
import { flushSelectedChatWrite, readSavedChatSelection, writeSelectedChat } from "../chatStorage";


const summary = {
  id: "codex:one",
  path: "/one.jsonl",
  provider: "codex",
  title: "One",
  updatedAt: 42,
};

describe("chatStorage", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
  });
  afterEach(() => {
    flushSelectedChatWrite();
    jest.useRealTimers();
  });

  it("restores a valid selected chat", () => {
    mockRead.mockReturnValue({ selectedChat: summary, selectedId: summary.id });
    expect(readSavedChatSelection()).toEqual({ selectedChat: summary, selectedId: summary.id });
  });

  it("keeps a legacy selected id and ignores malformed summaries", () => {
    mockRead.mockReturnValue({ selectedChat: { id: "broken" }, selectedId: "legacy" });
    expect(readSavedChatSelection()).toEqual({ selectedChat: undefined, selectedId: "legacy" });
  });

  it("persists enough metadata to open before catalog discovery", () => {
    writeSelectedChat(summary);
    expect(mockWrite).not.toHaveBeenCalled();
    jest.advanceTimersByTime(100);
    expect(mockWrite).toHaveBeenCalledWith("chat-history/settings.json", {
      selectedChat: summary,
      selectedId: summary.id,
    }, { format: "json" });
  });
  it("coalesces selections and flushes the latest full summary on shutdown", () => {
    writeSelectedChat(summary);
    const latest = { ...summary, id: "codex:two", path: "/two.jsonl" };
    writeSelectedChat(latest);
    flushSelectedChatWrite();
    expect(mockWrite).toHaveBeenCalledTimes(1);
    expect(mockWrite).toHaveBeenCalledWith("chat-history/settings.json", {
      selectedChat: latest,
      selectedId: latest.id,
    }, { format: "json" });
    jest.runAllTimers();
    expect(mockWrite).toHaveBeenCalledTimes(1);
  });
});
