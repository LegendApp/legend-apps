import {
  readApplicationSupportJson,
  writeApplicationSupportJson,
} from "@legend-apps/storage/src/applicationSupport";
import type { ChatSummary } from "@legend-apps/chat-history";

const settingsPath = "chat-history/settings.json";

type ChatHistorySettings = {
  selectedChat?: ChatSummary;
  selectedId?: string;
};

export type SavedChatSelection = {
  selectedChat?: ChatSummary;
  selectedId?: string;
};

function isChatSummary(value: unknown): value is ChatSummary {
  if (!value || typeof value !== "object") {
    return false;
  }
  const summary = value as Partial<ChatSummary>;
  return typeof summary.id === "string"
    && typeof summary.path === "string"
    && typeof summary.provider === "string"
    && typeof summary.title === "string"
    && typeof summary.updatedAt === "number";
}

export function readSavedChatSelection(): SavedChatSelection {
  const settings = readApplicationSupportJson<ChatHistorySettings>(settingsPath);
  const selectedChat = isChatSummary(settings?.selectedChat) ? settings.selectedChat : undefined;
  const selectedId = typeof settings?.selectedId === "string" ? settings.selectedId : selectedChat?.id;
  return { selectedChat, selectedId };
}

export function writeSelectedChat(selectedChat: ChatSummary) {
  writeApplicationSupportJson(settingsPath, {
    selectedChat,
    selectedId: selectedChat.id,
  });
}
