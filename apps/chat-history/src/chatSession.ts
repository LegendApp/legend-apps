import type { Observable } from "@legendapp/state";
import type { ChatDocument, ChatSummary } from "@legend-apps/chat-history";
import type { SavedChatSelection } from "./chatStorage";

export type TranscriptState =
  | { status: "idle" }
  | { selectedId: string; status: "loading" }
  | {
    document: ChatDocument;
    openedAt: number;
    path: string;
    phase?: "initial" | "switch";
    selectedId: string;
    status: "ready";
  }
  | { error: string; selectedId: string; status: "error" };

export function createChatSessionState(saved: SavedChatSelection = {}) {
  return {
    summaries: saved.selectedChat ? [saved.selectedChat] : [] as ChatSummary[],
    selectedId: saved.selectedId as string | undefined,
    catalogError: undefined as string | undefined,
    catalogLoading: true,
    transcript: { status: "idle" } as TranscriptState,
  };
}

export type ChatSession = Observable<ReturnType<typeof createChatSessionState>>;
