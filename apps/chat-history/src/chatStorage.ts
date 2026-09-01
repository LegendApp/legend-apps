import {
  readApplicationSupportJson,
  writeApplicationSupportJson,
} from "@legend-apps/storage/src/applicationSupport";

const settingsPath = "chat-history/settings.json";

type ChatHistorySettings = {
  selectedId?: string;
};

export function readSelectedChatId() {
  return readApplicationSupportJson<ChatHistorySettings>(settingsPath)?.selectedId;
}

export function writeSelectedChatId(selectedId: string) {
  writeApplicationSupportJson(settingsPath, { selectedId });
}
