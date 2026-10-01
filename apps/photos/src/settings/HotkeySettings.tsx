import { HotkeyMetadata, type HotkeyName, hotkeys$ } from './Hotkeys';
import { useValue } from '@legendapp/state/react';
import { HotkeyCapture } from "@legendapp/spark/shortcuts/commands";
import { ScrollView, Text, View } from 'react-native';

export function HotkeySettings() {
  const hotkeyNames = useValue(() => Object.keys(hotkeys$.get()));

  return (
    <ScrollView contentContainerClassName="p-5">
      <View className="bg-gray-800 border border-gray-700 rounded-lg p-4">
        <Text>Note: This may become a Pro feature once Pro is set up</Text>
      </View>
      <Text className="text-2xl font-bold mb-4 mt-4">Keyboard Shortcuts</Text>
      {hotkeyNames.map((name) => (
        <HotkeyItem
          key={name}
          name={name as HotkeyName}
          description={HotkeyMetadata[name as HotkeyName]?.description || ''}
        />
      ))}
    </ScrollView>
  );
}

interface HotkeyItemProps {
  name: HotkeyName;
  description: string;
}

function HotkeyItem({ name, description }: HotkeyItemProps) {
  const binding = useValue(hotkeys$[name]);
  return (
    <View className="flex-row justify-between items-center my-2">
      <View className="flex-1">
        <Text className="text-lg">{name}</Text>
        <Text className="text-sm text-gray-600">{description}</Text>
      </View>
      <HotkeyCapture value={binding || null} onChange={value => hotkeys$[name].set(value ?? "")} onError={console.error} />
    </View>
  );
}
