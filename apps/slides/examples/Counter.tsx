import { useState } from "react";
import { Pressable, Text } from "react-native";

export function Counter() {
  const [count, setCount] = useState(0);
  return (
    <Pressable onPress={() => setCount((value) => value + 1)}>
      <Text className="text-5xl font-bold text-white">Clicked {count} times</Text>
    </Pressable>
  );
}
