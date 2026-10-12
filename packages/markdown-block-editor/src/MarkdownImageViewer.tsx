import { Image, Modal, Platform, Pressable, Text, View } from "react-native";

export type MarkdownViewerImage = { url: string; altText: string };

export function MarkdownImageViewer({ image, onClose }: {
  image: MarkdownViewerImage | null;
  onClose: () => void;
}) {
  if (!image) {
    return null;
  }

  const content = (
    <View className="flex-1 bg-black/90 p-6">
      <Pressable
        accessibilityLabel="Close image viewer"
        accessibilityRole="button"
        className="self-end rounded-md px-4 py-2"
        onPress={onClose}
      >
        <Text className="text-base text-white">Close</Text>
      </Pressable>
      <Image
        accessibilityLabel={image.altText || "Markdown image"}
        className="w-full flex-1"
        resizeMode="contain"
        source={{ uri: image.url }}
      />
    </View>
  );

  return Platform.OS === "macos" ? (
    <View className="absolute inset-0 z-50">{content}</View>
  ) : (
    <Modal onRequestClose={onClose} transparent visible>{content}</Modal>
  );
}
