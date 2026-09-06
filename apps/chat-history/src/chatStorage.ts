import {
  readApplicationSupportJson,
  writeApplicationSupportJson,
} from "@legend-apps/storage/src/applicationSupport";
import type { ChatSummary } from "@legend-apps/chat-history";

const settingsPath = "chat-history/settings.json";
const selectedChatWriteDelayMs = 100;
let pendingSelectedChat: ChatSummary | undefined;
let selectedChatWriteTimer: ReturnType<typeof setTimeout> | undefined;

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

function persistSelectedChat() {
  const selectedChat = pendingSelectedChat;
  pendingSelectedChat = undefined;
  selectedChatWriteTimer = undefined;
  if (selectedChat) {
    try {
      writeApplicationSupportJson(settingsPath, {
        selectedChat,
        selectedId: selectedChat.id,
      });
    } catch (error) {
      console.error(`[ChatHistoryStorage] ${error instanceof Error ? error.message : String(error)}`);
    }
  }
}

export function writeSelectedChat(selectedChat: ChatSummary) {
  pendingSelectedChat = selectedChat;
  if (selectedChatWriteTimer !== undefined) {
    clearTimeout(selectedChatWriteTimer);
  }
  selectedChatWriteTimer = setTimeout(persistSelectedChat, selectedChatWriteDelayMs);
}

export function flushSelectedChatWrite() {
  if (selectedChatWriteTimer !== undefined) {
    clearTimeout(selectedChatWriteTimer);
    persistSelectedChat();
  }
}
