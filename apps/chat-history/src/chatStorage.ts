import { createStorage } from "@legend-apps/storage";

const storage = createStorage({ subfolder: "chat-history" });
const settingsPath = "settings.json";

type ChatHistorySettings = {
  selectedId?: string;
};

export function readSelectedChatId() {
  return storage.read<ChatHistorySettings>(settingsPath, { format: "json" })?.selectedId;
}

export function writeSelectedChatId(selectedId: string) {
  storage.write(settingsPath, { selectedId }, { format: "json" });
}
