import { Alert } from "react-native";

export type DirtyDocumentTransitionAction = "save" | "discard" | "cancel";

type DirtyDocumentTransitionReason = "new" | "open" | "quit";

type ConfirmDirtyDocumentTransitionOptions = {
  filename: string;
  reason: DirtyDocumentTransitionReason;
};

function messageForReason(reason: DirtyDocumentTransitionReason, filename: string) {
  if (reason === "quit") {
    return `Save changes to ${filename} before quitting?`;
  }

  if (reason === "new") {
    return `Save changes to ${filename} before creating a new document?`;
  }

  return `Save changes to ${filename} before opening another document?`;
}

export function confirmDirtyDocumentTransition({
  filename,
  reason,
}: ConfirmDirtyDocumentTransitionOptions): Promise<DirtyDocumentTransitionAction> {
  return new Promise((resolve) => {
    Alert.alert("Unsaved Changes", messageForReason(reason, filename), [
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
