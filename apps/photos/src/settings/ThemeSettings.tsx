import { ColorPicker } from '../components/ColorPicker';
import { Button } from '../native-modules/Button';
import { themeState$, useTheme } from '../theme/ThemeProvider';
import { observer } from '@legendapp/state/react';
import React from 'react';
import { ScrollView, Text, View } from 'react-native';

type ThemeType = 'light' | 'dark';

export const ThemeSettings = observer(() => {
  const { currentTheme, resetTheme } = useTheme();
  const colors$ = themeState$.customColors[currentTheme as ThemeType];

  return (
    <ScrollView>
      <View className="p-4">
        <View className="flex-row items-center justify-between mb-5">
          <Text className="text-2xl font-bold text-text-primary">Theme Settings</Text>
          <Button onPress={resetTheme} title="Reset" bezelStyle="regular" controlSize="regular" />
        </View>

        <Text className="text-xl font-bold text-text-primary mb-3">Background Colors</Text>
        <ColorPicker label="Primary" $color={colors$.background.primary} />
        <ColorPicker label="Secondary" $color={colors$.background.secondary} />
        <ColorPicker label="Tertiary" $color={colors$.background.tertiary} />

        <Text className="text-xl font-bold text-text-primary mb-3 mt-6">Text Colors</Text>
        <ColorPicker label="Primary" $color={colors$.text.primary} />
        <ColorPicker label="Secondary" $color={colors$.text.secondary} />
        <ColorPicker label="Tertiary" $color={colors$.text.tertiary} />

        <Text className="text-xl font-bold text-text-primary mb-3 mt-6">Accent Colors</Text>
        <ColorPicker label="Primary" $color={colors$.accent.primary} />
        <ColorPicker label="Secondary" $color={colors$.accent.secondary} />

        <ColorPicker label="Border" $color={colors$.border} />
      </View>
    </ScrollView>
  );
});
