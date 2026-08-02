import { NitroModules } from "react-native-nitro-modules";
import type { ChatHistory } from "./ChatHistory.nitro";

let chatHistory: ChatHistory | undefined;

function getChatHistory() {
  chatHistory ??= NitroModules.createHybridObject<ChatHistory>("ChatHistory");
  return chatHistory;
}

export function getRecentChats(limit = 20) {
  return getChatHistory().getRecentChats(limit);
}

export function openChat(provider: ChatProvider, path: string) {
  return getChatHistory().openChat(provider, path);
}

export function cancelPendingOpen() {
  return getChatHistory().cancelPendingOpen();
}

export type ChatProvider = "codex" | "claude";
export type ChatRowKind = "user" | "assistant" | "tool" | "files";
export type ChatToolStatus = "completed" | "failed" | "unknown";
export type {
  ChatDocument,
  ChatDocumentTiming,
  ChatFileChange,
  ChatRowMetadata,
  ChatSummary,
} from "./ChatHistory.nitro";
