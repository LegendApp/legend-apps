import { Alert } from "react-native";

const defaultLinkURL = "https://";

export function promptMarkdownLink(defaultURL = defaultLinkURL) {
  return new Promise<string | null>((resolve) => {
    Alert.prompt(
      "Insert Link",
      "Enter the URL for this link.",
      [
        {
          onPress: () => resolve(null),
          style: "cancel",
          text: "Cancel",
        },
        {
          isPreferred: true,
          onPress: (value: string | undefined) => {
            const url = typeof value === "string" ? value.trim() : "";
            resolve(url || null);
          },
          text: "Insert",
        },
      ],
      "plain-text",
      defaultURL,
    );
  });
}
