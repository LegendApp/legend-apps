import { Text, View } from "react-native";
import type { DemoTranscriptMessage } from "./TranscriptDataSource";

export function DemoTranscriptRow({ message }: { message: DemoTranscriptMessage }) {
  const isUser = message.role === "user";
  return (
    <View className={isUser ? "items-end px-5 py-2" : "items-start px-5 py-3"}>
      <View
        className={isUser
          ? "max-w-[82%] self-end rounded-2xl bg-surface-muted px-4 py-3"
          : "w-full max-w-[92%]"}
      >
        <Text className="text-[15px] leading-[22px] text-foreground" selectable>
          {message.text}
        </Text>
      </View>
    </View>
  );
}
