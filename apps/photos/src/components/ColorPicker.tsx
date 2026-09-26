import { ColorPickerModule } from '../native-modules/ColorPickerModule';
import type { Observable } from '@legendapp/state';
import { useValue } from '@legendapp/state/react';
import React, { useEffect, useState } from 'react';
import { Pressable, Text, TextInput, View } from 'react-native';

export interface ColorPickerProps {
  label?: string;
  $color: Observable<string>;
}

export const ColorPicker = ({ $color, label }: ColorPickerProps) => {
  const color = useValue($color);
  const [inputValue, setInputValue] = useState(color);
  useEffect(() => setInputValue(color), [color]);

  const handleColorChange = (text: string) => {
    // Validate hex color format
    const isValidHex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(text);

    setInputValue(text);

    if (isValidHex) {
      $color.set(text);
    }
  };

  const handleColorSwatchPress = async () => {
    try {
      // Show the native color picker with current color
      const selectedColor = await ColorPickerModule.showColorPicker(color);

      // Update the input field and notify parent
      setInputValue(selectedColor);
      $color.set(selectedColor);
    } catch (error) {
      // Color picker was cancelled or there was an error
      console.log('Color picker cancelled or error:', error);
    }
  };

  return (
    <View className="flex-row items-center mb-4">
      {label && <Text className="text-text-primary mr-3 w-32">{label}</Text>}
      <View className="flex-row items-center border border-border rounded-md overflow-hidden">
        <TextInput
          value={inputValue}
          onChangeText={handleColorChange}
          className="px-3 py-1 text-text-primary w-24"
          placeholder="#RRGGBB"
          placeholderTextColor="#777"
          autoCapitalize="none"
          autoCorrect={false}
        />
        <Pressable
          className="size-8"
          style={{ backgroundColor: color }}
          onPress={handleColorSwatchPress}
          accessibilityLabel="Select color"
          accessibilityHint="Opens the color picker dialog"
        >
          <View className="w-8 h-full" style={{ backgroundColor: color }} />
        </Pressable>
      </View>
    </View>
  );
};
