import { readApplicationSupportJson, writeApplicationSupportJson } from "@legend-apps/storage/src/applicationSupport";
import {
  readCachedChatCatalog,
  readSavedChatSelection,
  writeCachedChatCatalog,
  writeSelectedChat,
} from "../chatStorage";

jest.mock("@legend-apps/storage/src/applicationSupport", () => ({
  readApplicationSupportJson: jest.fn(),
  writeApplicationSupportJson: jest.fn(),
}));

const summary = {
  id: "codex:one",
  path: "/one.jsonl",
  provider: "codex",
  title: "One",
  updatedAt: 42,
};

describe("chatStorage", () => {
  beforeEach(() => jest.clearAllMocks());

  it("restores a valid selected chat", () => {
    jest.mocked(readApplicationSupportJson).mockReturnValue({ selectedChat: summary, selectedId: summary.id });
    expect(readSavedChatSelection()).toEqual({ selectedChat: summary, selectedId: summary.id });
  });

  it("keeps a legacy selected id and ignores malformed summaries", () => {
    jest.mocked(readApplicationSupportJson).mockReturnValue({ selectedChat: { id: "broken" }, selectedId: "legacy" });
    expect(readSavedChatSelection()).toEqual({ selectedChat: undefined, selectedId: "legacy" });
  });

  it("persists enough metadata to open before catalog discovery", () => {
    writeSelectedChat(summary);
    expect(writeApplicationSupportJson).toHaveBeenCalledWith("chat-history/settings.json", {
      selectedChat: summary,
      selectedId: summary.id,
    });
  });

  it("filters invalid cached catalog entries", () => {
    jest.mocked(readApplicationSupportJson).mockReturnValue([summary, { id: "broken" }, null]);
    expect(readCachedChatCatalog()).toEqual([summary]);
  });

  it("persists the latest catalog", () => {
    writeCachedChatCatalog([summary]);
    expect(writeApplicationSupportJson).toHaveBeenCalledWith("chat-history/catalog.json", [summary]);
  });
});
