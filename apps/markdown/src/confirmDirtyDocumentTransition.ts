import { Alert } from "react-native";

export type DirtyDocumentTransitionAction = "save" | "discard" | "cancel";

type DirtyDocumentTransitionReason = "close" | "quit";

type ConfirmDirtyDocumentTransitionOptions = {
  filename: string;
  reason: DirtyDocumentTransitionReason;
};

export function confirmDirtyDocumentTransition({
  filename,
  reason,
}: ConfirmDirtyDocumentTransitionOptions): Promise<DirtyDocumentTransitionAction> {
  return new Promise((resolve) => {
    Alert.alert("Unsaved Changes", `Save changes to ${filename} before ${reason === "quit" ? "quitting" : "closing"}?`, [
      {
        onPress: () => resolve("cancel"),
        style: "cancel",
        text: "Cancel",
      },
      {
        onPress: () => resolve("discard"),
        style: "destructive",
        text: "Discard",
      },
      {
        onPress: () => resolve("save"),
        text: "Save",
      },
    ]);
  });
}
