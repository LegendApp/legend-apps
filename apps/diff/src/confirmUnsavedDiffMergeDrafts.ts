import { Alert } from "react-native";

export type UnsavedDiffMergeDraftAction = "save" | "discard" | "cancel";

type ConfirmUnsavedDiffMergeDraftsOptions = {
  fileCount: number;
  sourceLabel: string;
};

export function confirmUnsavedDiffMergeDrafts({
  fileCount,
  sourceLabel,
}: ConfirmUnsavedDiffMergeDraftsOptions): Promise<UnsavedDiffMergeDraftAction> {
  const fileLabel = fileCount === 1 ? "1 file" : `${fileCount} files`;
  return new Promise((resolve) => {
    Alert.alert(
      "Unsaved Merge Resolutions",
      `Save merge resolutions for ${fileLabel} in ${sourceLabel} before closing?`,
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
