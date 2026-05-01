import { NativeEventEmitter, Platform } from "react-native";
import NativeRecentDocuments from "./NativeRecentDocuments";

export type RecentDocumentOpenEvent = {
  path: string;
};

const recentDocumentOpenEvent = "RecentDocumentOpen";

export function noteRecentDocument(path: string) {
  if (Platform.OS === "macos") {
    NativeRecentDocuments.noteRecentDocument(path);
  }
}

export function addRecentDocumentOpenListener(listener: (event: RecentDocumentOpenEvent) => void) {
  if (Platform.OS !== "macos") {
    return { remove() {} };
  }

  const emitter = new NativeEventEmitter(NativeRecentDocuments as never);
  return emitter.addListener(recentDocumentOpenEvent, listener);
}

export { default as NativeRecentDocuments } from "./NativeRecentDocuments";
