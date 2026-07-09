import { Alert } from "react-native";

export type UnsavedDiffMergeDraftAction = "save" | "discard" | "cancel";
export type UnsavedDiffMergeDraftReason = "close" | "quit" | "source";

type ConfirmUnsavedDiffMergeDraftsOptions = {
  fileCount: number;
  reason: UnsavedDiffMergeDraftReason;
  sourceLabel: string;
};

export function getUnsavedDiffMergeDraftPrompt(reason: UnsavedDiffMergeDraftReason) {
  if (reason === "quit") {
    return "before quitting Legend Diff?";
  }
  if (reason === "source") {
    return "before opening another comparison?";
  }
  return "before closing?";
}

export function confirmUnsavedDiffMergeDrafts({
  fileCount,
  reason,
  sourceLabel,
}: ConfirmUnsavedDiffMergeDraftsOptions): Promise<UnsavedDiffMergeDraftAction> {
  const fileLabel = fileCount === 1 ? "1 file" : `${fileCount} files`;
  const prompt = getUnsavedDiffMergeDraftPrompt(reason);
  return new Promise((resolve) => {
    Alert.alert(
      "Unsaved Merge Resolutions",
      `Save merge resolutions for ${fileLabel} in ${sourceLabel} ${prompt}`,
      [
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
      ],
    );
  });
}
